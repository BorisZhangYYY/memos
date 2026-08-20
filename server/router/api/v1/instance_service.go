package v1

import (
	"context"
	"regexp"
	"strings"

	"github.com/pkg/errors"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/emptypb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/server/notification"
	"github.com/usememos/memos/store"
)

const (
	maxTranscriptionConfigModelLength    = 256
	maxTranscriptionConfigLanguageLength = 32
	maxTranscriptionConfigPromptLength   = 4096
	maxBatchGetInstanceSettings          = 100
	memoMoodLevelCount                   = 7
	maxMemoMoodEmojiLength               = 16
)

var (
	defaultMemoMoodEmojis = []string{"😫", "😟", "😔", "😐", "😌", "☺️", "😆"}
	defaultMemoMoodColors = []string{"#ef4444", "#f97316", "#f59e0b", "#a8a29e", "#22c55e", "#06b6d4", "#8b5cf6"}
	memoMoodColorPattern  = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)
)

type instanceSettingCaller struct {
	user   *store.User
	loaded bool
}

func (c *instanceSettingCaller) currentUser(ctx context.Context, service *APIV1Service) (*store.User, error) {
	if c.loaded {
		return c.user, nil
	}
	user, err := service.fetchCurrentUser(ctx)
	if err != nil {
		return nil, err
	}
	c.user = user
	c.loaded = true
	return c.user, nil
}

// GetInstanceProfile returns the instance profile.
func (s *APIV1Service) GetInstanceProfile(ctx context.Context, _ *v1pb.GetInstanceProfileRequest) (*v1pb.InstanceProfile, error) {
	admin, err := s.GetInstanceAdmin(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get instance admin: %v", err)
	}

	// needs_setup reflects whether the instance has any users at all, which is
	// the real signal for first-run setup. It is deliberately independent of the
	// admin lookup: an instance that has lost its admins still has users and must
	// not be treated as a fresh install.
	limitOne := 1
	users, err := s.Store.ListUsers(ctx, &store.FindUser{Limit: &limitOne})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list users: %v", err)
	}

	instanceProfile := &v1pb.InstanceProfile{
		Version:     s.Profile.Version,
		Demo:        s.Profile.Demo,
		InstanceUrl: s.Profile.GetInstanceURL(),
		Admin:       admin, // for display only; may be nil even on a populated instance
		Commit:      s.Profile.Commit,
		NeedsSetup:  len(users) == 0,
	}
	return instanceProfile, nil
}

// GetMemoMoodDisplay returns the effective emoji and color assigned to every
// memo mood level. The values are stored inside MEMO_RELATED, but this narrow
// API prevents MCP clients from reading unrelated instance configuration.
func (s *APIV1Service) GetMemoMoodDisplay(ctx context.Context, _ *v1pb.GetMemoMoodDisplayRequest) (*v1pb.MemoMoodDisplay, error) {
	setting, err := s.GetInstanceSetting(ctx, &v1pb.GetInstanceSettingRequest{Name: "instance/settings/MEMO_RELATED"})
	if err != nil {
		return nil, err
	}
	return buildMemoMoodDisplay(setting.GetMemoRelatedSetting()), nil
}

// UpdateMemoMoodDisplay applies partial display-only changes while preserving
// every unmentioned mood level and the rest of MEMO_RELATED. UpdateInstanceSetting
// remains the single place that enforces admin and deployment-configured policy.
func (s *APIV1Service) UpdateMemoMoodDisplay(ctx context.Context, request *v1pb.UpdateMemoMoodDisplayRequest) (*v1pb.MemoMoodDisplay, error) {
	if len(request.Updates) == 0 {
		return nil, status.Error(codes.InvalidArgument, "at least one mood level update is required")
	}
	if len(request.Updates) > memoMoodLevelCount {
		return nil, status.Errorf(codes.InvalidArgument, "too many mood level updates (max %d)", memoMoodLevelCount)
	}

	setting, err := s.GetInstanceSetting(ctx, &v1pb.GetInstanceSettingRequest{Name: "instance/settings/MEMO_RELATED"})
	if err != nil {
		return nil, err
	}
	memoRelated := setting.GetMemoRelatedSetting()
	if memoRelated == nil {
		memoRelated = &v1pb.InstanceSetting_MemoRelatedSetting{}
		setting.Value = &v1pb.InstanceSetting_MemoRelatedSetting_{MemoRelatedSetting: memoRelated}
	}
	emojis := effectiveMemoMoodValues(memoRelated.MoodEmojis, defaultMemoMoodEmojis)
	colors := effectiveMemoMoodValues(memoRelated.MoodColors, defaultMemoMoodColors)
	seenLevels := map[int32]bool{}

	for _, update := range request.Updates {
		if update == nil {
			return nil, status.Error(codes.InvalidArgument, "mood level update cannot be null")
		}
		if update.Level < 1 || update.Level > memoMoodLevelCount {
			return nil, status.Errorf(codes.InvalidArgument, "mood level must be between 1 and %d", memoMoodLevelCount)
		}
		if seenLevels[update.Level] {
			return nil, status.Errorf(codes.InvalidArgument, "duplicate mood level %d", update.Level)
		}
		seenLevels[update.Level] = true
		if update.Emoji == nil && update.Color == nil {
			return nil, status.Errorf(codes.InvalidArgument, "mood level %d must update emoji or color", update.Level)
		}

		index := int(update.Level - 1)
		if update.Emoji != nil {
			emoji := strings.TrimSpace(update.GetEmoji())
			if len([]rune(emoji)) > maxMemoMoodEmojiLength {
				return nil, status.Errorf(codes.InvalidArgument, "mood emoji exceeds %d characters", maxMemoMoodEmojiLength)
			}
			if emoji == "" {
				emoji = defaultMemoMoodEmojis[index]
			}
			emojis[index] = emoji
		}
		if update.Color != nil {
			color := strings.TrimSpace(update.GetColor())
			if color == "" {
				color = defaultMemoMoodColors[index]
			} else if !memoMoodColorPattern.MatchString(color) {
				return nil, status.Error(codes.InvalidArgument, "mood color must use #RRGGBB format")
			}
			colors[index] = strings.ToLower(color)
		}
	}

	memoRelated.MoodEmojis = emojis
	memoRelated.MoodColors = colors
	updated, err := s.UpdateInstanceSetting(ctx, &v1pb.UpdateInstanceSettingRequest{Setting: setting})
	if err != nil {
		return nil, err
	}
	return buildMemoMoodDisplay(updated.GetMemoRelatedSetting()), nil
}

func buildMemoMoodDisplay(setting *v1pb.InstanceSetting_MemoRelatedSetting) *v1pb.MemoMoodDisplay {
	var configuredEmojis, configuredColors []string
	if setting != nil {
		configuredEmojis = setting.MoodEmojis
		configuredColors = setting.MoodColors
	}
	emojis := effectiveMemoMoodValues(configuredEmojis, defaultMemoMoodEmojis)
	colors := effectiveMemoMoodValues(configuredColors, defaultMemoMoodColors)
	levels := make([]*v1pb.MemoMoodDisplay_MoodLevel, 0, memoMoodLevelCount)
	for index := range memoMoodLevelCount {
		levels = append(levels, &v1pb.MemoMoodDisplay_MoodLevel{
			Level: int32(index + 1),
			Emoji: emojis[index],
			Color: colors[index],
		})
	}
	return &v1pb.MemoMoodDisplay{Levels: levels}
}

func effectiveMemoMoodValues(configured, defaults []string) []string {
	values := append([]string(nil), defaults...)
	if len(configured) != memoMoodLevelCount {
		return values
	}
	for index, value := range configured {
		if value = strings.TrimSpace(value); value != "" {
			values[index] = value
		}
	}
	return values
}

func (s *APIV1Service) GetInstanceSetting(ctx context.Context, request *v1pb.GetInstanceSettingRequest) (*v1pb.InstanceSetting, error) {
	return s.getInstanceSettingByName(ctx, request.Name, &instanceSettingCaller{})
}

// BatchGetInstanceSettings returns multiple instance settings in request order.
func (s *APIV1Service) BatchGetInstanceSettings(ctx context.Context, request *v1pb.BatchGetInstanceSettingsRequest) (*v1pb.BatchGetInstanceSettingsResponse, error) {
	if len(request.Names) > maxBatchGetInstanceSettings {
		return nil, status.Errorf(codes.InvalidArgument, "too many instance setting names (max %d)", maxBatchGetInstanceSettings)
	}

	caller := &instanceSettingCaller{}
	settings := make([]*v1pb.InstanceSetting, 0, len(request.Names))
	for _, name := range request.Names {
		setting, err := s.getInstanceSettingByName(ctx, name, caller)
		if err != nil {
			return nil, err
		}
		settings = append(settings, setting)
	}

	return &v1pb.BatchGetInstanceSettingsResponse{Settings: settings}, nil
}

func (s *APIV1Service) getInstanceSettingByName(ctx context.Context, name string, caller *instanceSettingCaller) (*v1pb.InstanceSetting, error) {
	instanceSettingKeyString, err := ExtractInstanceSettingKeyFromName(name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid instance setting name: %v", err)
	}

	instanceSettingKey := storepb.InstanceSettingKey(storepb.InstanceSettingKey_value[instanceSettingKeyString])
	// Get instance setting from store with default value.
	var instanceSetting *storepb.InstanceSetting
	switch instanceSettingKey {
	case storepb.InstanceSettingKey_BASIC:
		var setting *storepb.InstanceBasicSetting
		setting, err = s.Store.GetInstanceBasicSetting(ctx)
		instanceSetting = &storepb.InstanceSetting{Key: instanceSettingKey, Value: &storepb.InstanceSetting_BasicSetting{BasicSetting: setting}}
	case storepb.InstanceSettingKey_GENERAL:
		var setting *storepb.InstanceGeneralSetting
		setting, err = s.Store.GetInstanceGeneralSetting(ctx)
		instanceSetting = &storepb.InstanceSetting{Key: instanceSettingKey, Value: &storepb.InstanceSetting_GeneralSetting{GeneralSetting: setting}}
	case storepb.InstanceSettingKey_MEMO_RELATED:
		var setting *storepb.InstanceMemoRelatedSetting
		setting, err = s.Store.GetInstanceMemoRelatedSetting(ctx)
		instanceSetting = &storepb.InstanceSetting{Key: instanceSettingKey, Value: &storepb.InstanceSetting_MemoRelatedSetting{MemoRelatedSetting: setting}}
	case storepb.InstanceSettingKey_STORAGE:
		var setting *storepb.InstanceStorageSetting
		setting, err = s.Store.GetInstanceStorageSetting(ctx)
		instanceSetting = &storepb.InstanceSetting{Key: instanceSettingKey, Value: &storepb.InstanceSetting_StorageSetting{StorageSetting: setting}}
	case storepb.InstanceSettingKey_TAGS:
		var setting *storepb.InstanceTagsSetting
		setting, err = s.Store.GetInstanceTagsSetting(ctx)
		instanceSetting = &storepb.InstanceSetting{Key: instanceSettingKey, Value: &storepb.InstanceSetting_TagsSetting{TagsSetting: setting}}
	case storepb.InstanceSettingKey_NOTIFICATION:
		var setting *storepb.InstanceNotificationSetting
		setting, err = s.Store.GetInstanceNotificationSetting(ctx)
		instanceSetting = &storepb.InstanceSetting{Key: instanceSettingKey, Value: &storepb.InstanceSetting_NotificationSetting{NotificationSetting: setting}}
	case storepb.InstanceSettingKey_AI:
		var setting *storepb.InstanceAISetting
		setting, err = s.Store.GetInstanceAISetting(ctx)
		instanceSetting = &storepb.InstanceSetting{Key: instanceSettingKey, Value: &storepb.InstanceSetting_AiSetting{AiSetting: setting}}
	default:
		return nil, status.Errorf(codes.InvalidArgument, "unsupported instance setting key: %v", instanceSettingKey)
	}
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get instance setting: %v", err)
	}

	// Storage and notification settings contain credentials; restrict to admins only.
	if instanceSetting.Key == storepb.InstanceSettingKey_STORAGE ||
		instanceSetting.Key == storepb.InstanceSettingKey_NOTIFICATION {
		user, err := caller.currentUser(ctx, s)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to get current user: %v", err)
		}
		if user == nil {
			return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
		}
		if user.Role != store.RoleAdmin {
			return nil, status.Errorf(codes.PermissionDenied, "permission denied")
		}
	}
	isAdminCaller := false
	if instanceSetting.Key == storepb.InstanceSettingKey_AI {
		user, err := caller.currentUser(ctx, s)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to get current user: %v", err)
		}
		if user == nil {
			return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
		}
		isAdminCaller = user.Role == store.RoleAdmin
	}

	result := convertInstanceSettingFromStore(instanceSetting)
	if instanceSetting.Key == storepb.InstanceSettingKey_AI && !isAdminCaller {
		// Non-admin callers only need transcription.provider_id to gate the
		// editor's Transcribe button. Model / language / prompt are
		// admin-entered defaults that may contain proprietary glossary terms,
		// so they are redacted from non-admin responses.
		if ai := result.GetAiSetting(); ai != nil && ai.Transcription != nil {
			ai.Transcription.Model = ""
			ai.Transcription.Language = ""
			ai.Transcription.Prompt = ""
		}
	}
	return result, nil
}

func (s *APIV1Service) UpdateInstanceSetting(ctx context.Context, request *v1pb.UpdateInstanceSettingRequest) (*v1pb.InstanceSetting, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user: %v", err)
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}
	if user.Role != store.RoleAdmin {
		return nil, status.Errorf(codes.PermissionDenied, "permission denied")
	}
	if request.Setting == nil {
		return nil, status.Errorf(codes.InvalidArgument, "instance setting is required")
	}
	settingKeyString, err := ExtractInstanceSettingKeyFromName(request.Setting.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid instance setting name: %v", err)
	}
	settingKey := storepb.InstanceSettingKey(storepb.InstanceSettingKey_value[settingKeyString])
	if s.Store.IsInstanceSettingDeploymentConfigured(settingKey) {
		return nil, status.Errorf(codes.FailedPrecondition, "instance setting %q is configured by the deployment", settingKeyString)
	}

	// TODO: Apply update_mask if specified
	_ = request.UpdateMask

	if err := validateInstanceSetting(request.Setting); err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid instance setting: %v", err)
	}

	updateSetting := convertInstanceSettingToStore(request.Setting)
	instanceURLWasProvided := request.Setting.GetGeneralSetting() != nil && request.Setting.GetGeneralSetting().InstanceUrl != nil
	if updateSetting.Key == storepb.InstanceSettingKey_GENERAL && updateSetting.GetGeneralSetting().InstanceUrl == nil {
		existing, getErr := s.Store.GetInstanceGeneralSetting(ctx)
		if getErr != nil {
			return nil, status.Errorf(codes.Internal, "failed to get existing general setting: %v", getErr)
		}
		updateSetting.GetGeneralSetting().InstanceUrl = existing.InstanceUrl
	}

	// Preserve write-only credential fields when the caller sends an empty value.
	// An empty string means "no change", not "clear the credential".
	switch updateSetting.Key {
	case storepb.InstanceSettingKey_NOTIFICATION:
		if notif := updateSetting.GetNotificationSetting(); notif != nil && notif.Email != nil && notif.Email.SmtpPassword == "" {
			existing, err := s.Store.GetInstanceNotificationSetting(ctx)
			if err == nil && existing != nil && existing.Email != nil {
				if existing.Email.SmtpPassword != "" && !sameSMTPConnectionIdentity(notif.Email, existing.Email) {
					return nil, status.Errorf(codes.InvalidArgument, "smtp password is required when changing SMTP host, port, username, or encryption settings")
				}
				notif.Email.SmtpPassword = existing.Email.SmtpPassword
			}
		}
	case storepb.InstanceSettingKey_STORAGE:
		if storage := updateSetting.GetStorageSetting(); storage != nil && storage.S3Config != nil && storage.S3Config.AccessKeySecret == "" {
			existing, err := s.Store.GetInstanceStorageSetting(ctx)
			if err == nil && existing != nil && existing.S3Config != nil {
				storage.S3Config.AccessKeySecret = existing.S3Config.AccessKeySecret
			}
		}
	case storepb.InstanceSettingKey_AI:
		if err := s.prepareInstanceAISettingForUpdate(ctx, updateSetting.GetAiSetting()); err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid AI setting: %v", err)
		}
	default:
		// No credential preservation needed for other setting types.
	}

	var instanceSetting *storepb.InstanceSetting
	if updateSetting.Key == storepb.InstanceSettingKey_GENERAL {
		instanceSetting, err = s.Store.UpsertInstanceGeneralSettingSafely(ctx, updateSetting)
	} else {
		instanceSetting, err = s.Store.UpsertInstanceSetting(ctx, updateSetting)
	}
	if err != nil {
		if errors.Is(err, store.ErrUnsafeAuthenticationConfiguration) {
			return nil, status.Error(codes.FailedPrecondition, err.Error())
		}
		return nil, status.Errorf(codes.Internal, "failed to upsert instance setting: %v", err)
	}
	if updateSetting.Key == storepb.InstanceSettingKey_GENERAL && instanceURLWasProvided {
		s.Profile.SetInstanceURL(instanceSetting.GetGeneralSetting().GetInstanceUrl())
	}

	return convertInstanceSettingFromStore(instanceSetting), nil
}

func (s *APIV1Service) TestInstanceEmailSetting(ctx context.Context, request *v1pb.TestInstanceEmailSettingRequest) (*emptypb.Empty, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user: %v", err)
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}
	if user.Role != store.RoleAdmin {
		return nil, status.Errorf(codes.PermissionDenied, "permission denied")
	}

	emailSetting, err := s.resolveTestEmailSetting(ctx, request.Email)
	if err != nil {
		return nil, err
	}

	recipientEmail := strings.TrimSpace(request.RecipientEmail)
	if recipientEmail == "" {
		recipientEmail = strings.TrimSpace(user.Email)
	}
	if recipientEmail == "" {
		return nil, status.Errorf(codes.InvalidArgument, "recipient email is required")
	}

	if err := notification.ValidateEmailSetting(emailSetting); err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid notification email setting: %v", err)
	}

	if err := notification.SendTestEmail(emailSetting, recipientEmail); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to send test email: %v. Check that the SMTP port matches the encryption mode required by your email provider", err)
	}

	return &emptypb.Empty{}, nil
}

func (s *APIV1Service) resolveTestEmailSetting(ctx context.Context, requestEmail *v1pb.InstanceSetting_NotificationSetting_EmailSetting) (*storepb.InstanceNotificationSetting_EmailSetting, error) {
	if requestEmail == nil {
		existing, err := s.Store.GetInstanceNotificationSetting(ctx)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to get notification setting: %v", err)
		}
		return existing.GetEmail(), nil
	}

	emailSetting := convertInstanceNotificationSettingToStore(&v1pb.InstanceSetting_NotificationSetting{Email: requestEmail}).GetEmail()
	if emailSetting.SmtpPassword != "" {
		return emailSetting, nil
	}

	existing, err := s.Store.GetInstanceNotificationSetting(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get notification setting: %v", err)
	}
	existingEmail := existing.GetEmail()
	if existingEmail == nil || existingEmail.SmtpPassword == "" {
		return emailSetting, nil
	}
	if sameSMTPConnectionIdentity(emailSetting, existingEmail) {
		emailSetting.SmtpPassword = existingEmail.SmtpPassword
		return emailSetting, nil
	}
	return nil, status.Errorf(codes.InvalidArgument, "smtp password is required when changing SMTP host, port, username, or encryption settings")
}

func sameSMTPConnectionIdentity(setting, existing *storepb.InstanceNotificationSetting_EmailSetting) bool {
	if setting == nil || existing == nil {
		return false
	}
	return strings.TrimSpace(setting.SmtpHost) == strings.TrimSpace(existing.SmtpHost) &&
		setting.SmtpPort == existing.SmtpPort &&
		strings.TrimSpace(setting.SmtpUsername) == strings.TrimSpace(existing.SmtpUsername) &&
		setting.UseTls == existing.UseTls &&
		setting.UseSsl == existing.UseSsl
}

func (s *APIV1Service) GetInstanceAdmin(ctx context.Context) (*v1pb.User, error) {
	adminUserType := store.RoleAdmin
	user, err := s.Store.GetUser(ctx, &store.FindUser{
		Role: &adminUserType,
	})
	if err != nil {
		return nil, errors.Wrapf(err, "failed to find admin")
	}
	if user == nil {
		return nil, nil
	}

	currentUser, _ := s.fetchCurrentUser(ctx)
	return convertUserFromStore(user, currentUser), nil
}
