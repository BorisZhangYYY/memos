package v1

import (
	"context"
	stderrors "errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/pkg/errors"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	"github.com/usememos/memos/internal/httpgetter"
	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/server/runner/memopayload"
	"github.com/usememos/memos/store"
)

// suppressSSEKey is a context key used to suppress the SSE broadcast from
// CreateMemo when it is called internally (e.g., from CreateMemoComment).
type suppressSSEKey struct{}

const maxBatchGetLinkMetadata = 10

var fetchHTMLMeta = httpgetter.GetHTMLMeta

func withSuppressSSE(ctx context.Context) context.Context {
	return context.WithValue(ctx, suppressSSEKey{}, true)
}

func isSSESuppressed(ctx context.Context) bool {
	v, ok := ctx.Value(suppressSSEKey{}).(bool)
	return ok && v
}

// suppressVisibilityValidationKey is a context key used to skip the
// allowed-visibilities check when creating a memo whose visibility is not
// user-chosen but inherited (e.g., a comment inheriting its parent memo's
// visibility in CreateMemoComment).
type suppressVisibilityValidationKey struct{}

func withSuppressVisibilityValidation(ctx context.Context) context.Context {
	return context.WithValue(ctx, suppressVisibilityValidationKey{}, true)
}

func isVisibilityValidationSuppressed(ctx context.Context) bool {
	v, ok := ctx.Value(suppressVisibilityValidationKey{}).(bool)
	return ok && v
}

// resolveAllowedVisibilities returns the visibilities currently allowed by the
// instance's memo-related setting. An empty allowed_visibilities list means all
// levels are permitted.
func (s *APIV1Service) resolveAllowedVisibilities(ctx context.Context) ([]store.Visibility, error) {
	setting, err := s.Store.GetInstanceMemoRelatedSetting(ctx)
	if err != nil {
		return nil, err
	}
	if setting == nil || len(setting.AllowedVisibilities) == 0 {
		return []store.Visibility{store.Private, store.Protected, store.Public}, nil
	}
	allowed := []store.Visibility{}
	for _, value := range setting.AllowedVisibilities {
		switch store.Visibility(value) {
		case store.Private:
			allowed = append(allowed, store.Private)
		case store.Protected:
			allowed = append(allowed, store.Protected)
		case store.Public:
			allowed = append(allowed, store.Public)
		default:
			// Unknown levels are ignored.
		}
	}
	return allowed, nil
}

func containsVisibility(visibilities []store.Visibility, target store.Visibility) bool {
	for _, v := range visibilities {
		if v == target {
			return true
		}
	}
	return false
}

func (s *APIV1Service) checkMemoReadAccess(ctx context.Context, memo *store.Memo) error {
	if memo == nil {
		return status.Errorf(codes.NotFound, "memo not found")
	}

	// Archived memos are only visible to their creator.
	if memo.RowStatus == store.Archived {
		user, err := s.fetchCurrentUser(ctx)
		if err != nil {
			return status.Errorf(codes.Internal, "failed to get user")
		}
		if user == nil || memo.CreatorID != user.ID {
			return status.Errorf(codes.NotFound, "memo not found")
		}
	}

	// A memo whose visibility level has been disabled by the instance setting is
	// hidden entirely, as if it did not exist.
	allowedVis, err := s.resolveAllowedVisibilities(ctx)
	if err != nil {
		return status.Errorf(codes.Internal, "failed to get instance setting")
	}
	if !containsVisibility(allowedVis, memo.Visibility) {
		return status.Errorf(codes.NotFound, "memo not found")
	}

	if memo.Visibility != store.Public {
		user, err := s.fetchCurrentUser(ctx)
		if err != nil {
			return status.Errorf(codes.Internal, "failed to get user")
		}
		if user == nil {
			return status.Errorf(codes.Unauthenticated, "user not authenticated")
		}
		if memo.Visibility == store.Private && memo.CreatorID != user.ID {
			return status.Errorf(codes.PermissionDenied, "permission denied")
		}
	}
	return nil
}

func (s *APIV1Service) CreateMemo(ctx context.Context, request *v1pb.CreateMemoRequest) (*v1pb.Memo, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get user")
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}

	memoUID, err := ValidateAndGenerateUID(request.MemoId)
	if err != nil {
		return nil, err
	}

	create := &store.Memo{
		UID:        memoUID,
		CreatorID:  user.ID,
		Content:    request.Memo.Content,
		Visibility: convertVisibilityToStore(request.Memo.Visibility),
	}

	// Validate visibility against the allowed list from instance settings.
	// Comments inherit their visibility from the parent memo instead of being
	// user-chosen, so the check is skipped for them (see CreateMemoComment).
	if !isVisibilityValidationSuppressed(ctx) {
		if err := s.validateMemoVisibility(ctx, create.Visibility); err != nil {
			return nil, err
		}
	}

	// Set custom timestamps if provided in the request.
	if request.Memo.CreateTime != nil && request.Memo.CreateTime.IsValid() {
		createdTs := request.Memo.CreateTime.AsTime().Unix()
		create.CreatedTs = createdTs
	}
	if request.Memo.UpdateTime != nil && request.Memo.UpdateTime.IsValid() {
		updatedTsSec := request.Memo.UpdateTime.AsTime().Unix()
		create.UpdatedTs = updatedTsSec
	}

	contentLengthLimit, err := s.getContentLengthLimit(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get content length limit")
	}
	if len(create.Content) > contentLengthLimit {
		return nil, status.Errorf(codes.InvalidArgument, "content too long (max %d characters)", contentLengthLimit)
	}
	if err := memopayload.RebuildMemoPayload(ctx, create, s.MarkdownService); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to rebuild memo payload: %v", err)
	}
	if request.Memo.Location != nil {
		create.Payload.Location = convertLocationToStore(request.Memo.Location)
	}
	if request.Memo.MoodLevel > 0 {
		create.Payload.MoodLevel = request.Memo.MoodLevel
	}

	memo, err := s.Store.CreateMemo(ctx, create)
	if err != nil {
		// Check for unique constraint violation (AIP-133 compliance)
		errMsg := err.Error()
		if strings.Contains(errMsg, "UNIQUE constraint failed") ||
			strings.Contains(errMsg, "duplicate key") ||
			strings.Contains(errMsg, "Duplicate entry") {
			return nil, status.Errorf(codes.AlreadyExists, "memo with ID %q already exists", memoUID)
		}
		return nil, err
	}

	attachments := []*store.Attachment{}

	if len(request.Memo.Attachments) > 0 {
		if err := s.setMemoAttachmentsInternal(ctx, user, memo, request.Memo.Attachments); err != nil {
			return nil, errors.Wrap(err, "failed to set memo attachments")
		}

		a, err := s.Store.ListAttachments(ctx, &store.FindAttachment{
			MemoID: &memo.ID,
		})
		if err != nil {
			return nil, errors.Wrap(err, "failed to get memo attachments")
		}
		attachments = a
	}
	if len(request.Memo.Relations) > 0 {
		if err := s.setMemoRelationsInternal(ctx, memo, request.Memo.Relations); err != nil {
			return nil, errors.Wrap(err, "failed to set memo relations")
		}
	}

	relations, err := s.loadMemoRelations(ctx, memo)
	if err != nil {
		return nil, errors.Wrap(err, "failed to load memo relations")
	}
	memoMessage, err := s.convertMemoFromStore(ctx, memo, nil, attachments, relations)
	if err != nil {
		return nil, errors.Wrap(err, "failed to convert memo")
	}
	// Try to dispatch webhook when memo is created.
	if err := s.DispatchMemoCreatedWebhook(ctx, memoMessage); err != nil {
		slog.Warn("Failed to dispatch memo created webhook", slog.Any("err", err))
	}

	// Broadcast live refresh event (skipped when called from CreateMemoComment).
	if !isSSESuppressed(ctx) {
		s.SSEHub.Broadcast(&SSEEvent{
			Type:       SSEEventMemoCreated,
			Name:       memoMessage.Name,
			Visibility: memo.Visibility,
			CreatorID:  resolveSSECreatorID(memo, nil),
		})
	}

	if !isMentionNotificationSuppressed(ctx) {
		s.dispatchMemoMentionNotificationsBestEffort(ctx, memo, nil, "")
	}

	return memoMessage, nil
}

func (s *APIV1Service) ListMemos(ctx context.Context, request *v1pb.ListMemosRequest) (*v1pb.ListMemosResponse, error) {
	memoFind := &store.FindMemo{
		// Exclude comments by default.
		ExcludeComments: true,
	}
	currentUser, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get user")
	}

	if request.State == v1pb.State_ARCHIVED {
		state := store.Archived
		memoFind.RowStatus = &state
		// Archived memos are only visible to their creator.
		if currentUser == nil {
			return &v1pb.ListMemosResponse{}, nil
		}
		memoFind.CreatorID = &currentUser.ID
	} else {
		state := store.Normal
		memoFind.RowStatus = &state
	}

	// Parse order_by field (replaces the old sort and direction fields)
	if request.OrderBy != "" {
		if err := s.parseMemoOrderBy(request.OrderBy, memoFind); err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid order_by: %v", err)
		}
	} else {
		// Default ordering by create_time desc.
		memoFind.OrderByTimeAsc = false
	}

	if request.Filter != "" {
		if err := s.validateFilter(ctx, request.Filter); err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid filter: %v", err)
		}
		usesMood, err := filterUsesField(ctx, request.Filter, "mood_level")
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid filter: %v", err)
		}
		if usesMood {
			if currentUser == nil {
				return nil, status.Errorf(codes.PermissionDenied, "mood filters are private")
			}
			// Mood filters operate only on the caller's own memos. Setting the
			// structured creator constraint also prevents crafted OR filters from
			// using mood matches to infer another user's private mood.
			memoFind.CreatorID = &currentUser.ID
		}
		memoFind.Filters = append(memoFind.Filters, request.Filter)
	}

	// Resolve which visibility levels the instance currently allows. Disabled
	// levels hide every memo at that level (including the current user's own),
	// and anonymous access only remains possible while PUBLIC is allowed.
	allowedVis, err := s.resolveAllowedVisibilities(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get instance setting")
	}
	sharedVis := []store.Visibility{}
	for _, v := range allowedVis {
		if v != store.Private {
			sharedVis = append(sharedVis, v)
		}
	}

	if currentUser == nil {
		if containsVisibility(allowedVis, store.Public) {
			memoFind.VisibilityList = []store.Visibility{store.Public}
		} else {
			// PUBLIC is disabled: anonymous users see nothing.
			return &v1pb.ListMemosResponse{}, nil
		}
	} else {
		if memoFind.CreatorID == nil {
			// Own memos are filtered by the allowed list (a disabled level hides
			// the user's own memos too); other users' memos are only reachable
			// through the shared (non-PRIVATE) levels.
			quoted := make([]string, 0, len(allowedVis))
			for _, v := range allowedVis {
				quoted = append(quoted, fmt.Sprintf("%q", v.String()))
			}
			sharedQuoted := make([]string, 0, len(sharedVis))
			for _, v := range sharedVis {
				sharedQuoted = append(sharedQuoted, fmt.Sprintf("%q", v.String()))
			}
			filter := fmt.Sprintf(`(creator_id == %d && visibility in [%s]) || visibility in [%s]`, currentUser.ID, strings.Join(quoted, ", "), strings.Join(sharedQuoted, ", "))
			memoFind.Filters = append(memoFind.Filters, filter)
		} else if *memoFind.CreatorID != currentUser.ID {
			memoFind.VisibilityList = sharedVis
		}
	}

	var limit, offset int
	if request.PageToken != "" {
		var pageToken v1pb.PageToken
		if err := unmarshalPageToken(request.PageToken, &pageToken); err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid page token: %v", err)
		}
		limit = normalizePageSize(pageToken.Limit)
		offset = max(int(pageToken.Offset), 0)
	} else {
		limit = normalizePageSize(request.PageSize)
	}
	limit = min(limit, MaxPageSize)
	limitPlusOne := limit + 1
	memoFind.Limit = &limitPlusOne
	memoFind.Offset = &offset
	memos, err := s.Store.ListMemos(ctx, memoFind)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list memos: %v", err)
	}

	memoMessages := []*v1pb.Memo{}
	nextPageToken := ""
	if len(memos) == limitPlusOne {
		memos = memos[:limit]
		nextPageToken, err = getPageToken(limit, offset+limit)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to get next page token, error: %v", err)
		}
	}

	if len(memos) == 0 {
		response := &v1pb.ListMemosResponse{
			Memos:         memoMessages,
			NextPageToken: nextPageToken,
		}
		return response, nil
	}

	reactionMap := make(map[string][]*store.Reaction)
	contentIDs := make([]string, 0, len(memos))

	attachmentMap := make(map[int32][]*store.Attachment)
	memoIDs := make([]int32, 0, len(memos))

	for _, m := range memos {
		contentIDs = append(contentIDs, fmt.Sprintf("%s%s", MemoNamePrefix, m.UID))
		memoIDs = append(memoIDs, m.ID)
	}

	// REACTIONS
	reactions, err := s.Store.ListReactions(ctx, &store.FindReaction{ContentIDList: contentIDs})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list reactions")
	}
	for _, reaction := range reactions {
		reactionMap[reaction.ContentID] = append(reactionMap[reaction.ContentID], reaction)
	}

	// ATTACHMENTS
	attachments, err := s.Store.ListAttachments(ctx, &store.FindAttachment{MemoIDList: memoIDs})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list attachments")
	}
	for _, attachment := range attachments {
		attachmentMap[*attachment.MemoID] = append(attachmentMap[*attachment.MemoID], attachment)
	}

	// RELATIONS (batch load to avoid N+1)
	relationMap, err := s.batchConvertMemoRelations(ctx, memos, false)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to batch load memo relations")
	}
	creatorIDs := make([]int32, 0, len(memos)+len(reactions))
	for _, memo := range memos {
		creatorIDs = append(creatorIDs, memo.CreatorID)
	}
	for _, reaction := range reactions {
		creatorIDs = append(creatorIDs, reaction.CreatorID)
	}
	creatorMap, err := s.listUsersByID(ctx, creatorIDs)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list memo creators: %v", err)
	}
	for _, memo := range memos {
		memoName := fmt.Sprintf("%s%s", MemoNamePrefix, memo.UID)
		reactions := reactionMap[memoName]
		attachments := attachmentMap[memo.ID]
		relations := relationMap[memo.ID]

		memoMessage, err := s.convertMemoFromStoreWithCreators(ctx, memo, reactions, attachments, relations, creatorMap)
		if err != nil {
			if stderrors.Is(err, errMemoCreatorNotFound) {
				slog.Warn("Skipping memo with missing creator",
					slog.Int64("memo_id", int64(memo.ID)),
					slog.String("memo_uid", memo.UID),
					slog.Int64("creator_id", int64(memo.CreatorID)),
				)
				continue
			}
			return nil, errors.Wrap(err, "failed to convert memo")
		}

		memoMessages = append(memoMessages, memoMessage)
	}

	response := &v1pb.ListMemosResponse{
		Memos:         memoMessages,
		NextPageToken: nextPageToken,
	}
	return response, nil
}

func (s *APIV1Service) GetMemo(ctx context.Context, request *v1pb.GetMemoRequest) (*v1pb.Memo, error) {
	memoUID, err := ExtractMemoUIDFromName(request.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid memo name: %v", err)
	}
	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{
		UID: &memoUID,
	})
	if err != nil {
		return nil, err
	}
	if memo == nil {
		return nil, status.Errorf(codes.NotFound, "memo not found")
	}

	if err := s.checkMemoReadAccess(ctx, memo); err != nil {
		return nil, err
	}
	if memo.ParentUID != nil {
		parentMemo, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: memo.ParentUID})
		if err != nil {
			return nil, status.Errorf(codes.Internal, "failed to get parent memo")
		}
		if parentMemo == nil {
			return nil, status.Errorf(codes.NotFound, "memo not found")
		}
		if err := s.checkMemoReadAccess(ctx, parentMemo); err != nil {
			return nil, err
		}
	}

	reactions, err := s.Store.ListReactions(ctx, &store.FindReaction{
		ContentID: &request.Name,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list reactions")
	}

	attachments, err := s.Store.ListAttachments(ctx, &store.FindAttachment{
		MemoID: &memo.ID,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list attachments")
	}

	relations, err := s.loadMemoRelations(ctx, memo)
	if err != nil {
		return nil, errors.Wrap(err, "failed to load memo relations")
	}
	memoMessage, err := s.convertMemoFromStore(ctx, memo, reactions, attachments, relations)
	if err != nil {
		if stderrors.Is(err, errMemoCreatorNotFound) {
			return nil, status.Errorf(codes.NotFound, "memo creator not found")
		}
		return nil, errors.Wrap(err, "failed to convert memo")
	}
	return memoMessage, nil
}

// UpdateMemo updates an existing memo.
func (s *APIV1Service) UpdateMemo(ctx context.Context, request *v1pb.UpdateMemoRequest) (*v1pb.Memo, error) {
	memoUID, err := ExtractMemoUIDFromName(request.Memo.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid memo name: %v", err)
	}
	if request.UpdateMask == nil || len(request.UpdateMask.Paths) == 0 {
		return nil, status.Errorf(codes.InvalidArgument, "update mask is required")
	}

	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: &memoUID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get memo: %v", err)
	}
	if memo == nil {
		return nil, status.Errorf(codes.NotFound, "memo not found")
	}

	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user")
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}
	// Only the creator or admin can update the memo.
	if memo.CreatorID != user.ID && !isSuperUser(user) {
		return nil, status.Errorf(codes.PermissionDenied, "permission denied")
	}

	update := &store.UpdateMemo{
		ID: memo.ID,
	}
	var previousContent string
	contentUpdated := false
	for _, path := range request.UpdateMask.Paths {
		if path == "content" {
			contentUpdated = true
			previousContent = memo.Content
			contentLengthLimit, err := s.getContentLengthLimit(ctx)
			if err != nil {
				return nil, status.Errorf(codes.Internal, "failed to get content length limit")
			}
			if len(request.Memo.Content) > contentLengthLimit {
				return nil, status.Errorf(codes.InvalidArgument, "content too long (max %d characters)", contentLengthLimit)
			}
			memo.Content = request.Memo.Content
			if err := memopayload.RebuildMemoPayload(ctx, memo, s.MarkdownService); err != nil {
				return nil, status.Errorf(codes.Internal, "failed to rebuild memo payload: %v", err)
			}
			update.Content = &memo.Content
			update.Payload = memo.Payload
		} else if path == "visibility" {
			visibility := convertVisibilityToStore(request.Memo.Visibility)
			if memo.ParentUID != nil {
				// A comment's visibility is always inherited from its parent
				// memo, so the requested value is not user-chosen and is not
				// subject to the allowed visibilities check.
				parentMemo, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: memo.ParentUID})
				if err != nil {
					return nil, status.Errorf(codes.Internal, "failed to get parent memo")
				}
				if parentMemo == nil {
					return nil, status.Errorf(codes.NotFound, "memo not found")
				}
				visibility = parentMemo.Visibility
			} else {
				// Validate visibility against the allowed list from instance settings.
				if err := s.validateMemoVisibility(ctx, visibility); err != nil {
					return nil, err
				}
			}
			update.Visibility = &visibility
		} else if path == "pinned" {
			update.Pinned = &request.Memo.Pinned
		} else if path == "state" {
			rowStatus := convertStateToStore(request.Memo.State)
			update.RowStatus = &rowStatus
		} else if path == "create_time" {
			createdTs := request.Memo.CreateTime.AsTime().Unix()
			update.CreatedTs = &createdTs
		} else if path == "update_time" {
			updatedTsSec := time.Now().Unix()
			if request.Memo.UpdateTime != nil {
				updatedTsSec = request.Memo.UpdateTime.AsTime().Unix()
			}
			update.UpdatedTs = &updatedTsSec
		} else if path == "display_time" {
			return nil, status.Errorf(codes.InvalidArgument, "display_time is not supported")
		} else if path == "location" {
			payload := memo.Payload
			payload.Location = convertLocationToStore(request.Memo.Location)
			update.Payload = payload
		} else if path == "mood_level" {
			if request.Memo.MoodLevel < 0 || request.Memo.MoodLevel > memoMoodLevelCount {
				return nil, status.Errorf(codes.InvalidArgument, "mood level must be between 0 and %d", memoMoodLevelCount)
			}
			payload := memo.Payload
			payload.MoodLevel = request.Memo.MoodLevel
			update.Payload = payload
		} else if path == "attachments" {
			if err := s.setMemoAttachmentsInternal(ctx, user, memo, request.Memo.Attachments); err != nil {
				return nil, errors.Wrap(err, "failed to set memo attachments")
			}
		} else if path == "relations" {
			if err := s.setMemoRelationsInternal(ctx, memo, request.Memo.Relations); err != nil {
				return nil, errors.Wrap(err, "failed to set memo relations")
			}
		}
	}

	if err = s.Store.UpdateMemo(ctx, update); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update memo")
	}

	memo, err = s.Store.GetMemo(ctx, &store.FindMemo{
		ID: &memo.ID,
	})
	if err != nil {
		return nil, errors.Wrap(err, "failed to get memo")
	}
	memo, parentMemo, memoMessage, err := s.buildUpdatedMemoState(ctx, memo.ID)
	if err != nil {
		return nil, errors.Wrap(err, "failed to build updated memo state")
	}
	if contentUpdated {
		s.dispatchMemoMentionNotificationsBestEffort(ctx, memo, parentMemo, previousContent)
	}
	s.dispatchMemoUpdatedSideEffects(ctx, memo, parentMemo, memoMessage)

	return memoMessage, nil
}

// SetMemoMood sets or clears the mood recorded on one memo through the same
// authorization, persistence, and side-effect path as UpdateMemo.
func (s *APIV1Service) SetMemoMood(ctx context.Context, request *v1pb.SetMemoMoodRequest) (*v1pb.Memo, error) {
	if request == nil {
		return nil, status.Error(codes.InvalidArgument, "request is required")
	}
	if request.MoodLevel < 0 || request.MoodLevel > memoMoodLevelCount {
		return nil, status.Errorf(codes.InvalidArgument, "mood level must be between 0 and %d", memoMoodLevelCount)
	}
	return s.UpdateMemo(ctx, &v1pb.UpdateMemoRequest{
		Memo:       &v1pb.Memo{Name: request.Name, MoodLevel: request.MoodLevel},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"mood_level"}},
	})
}

func (s *APIV1Service) DeleteMemo(ctx context.Context, request *v1pb.DeleteMemoRequest) (*emptypb.Empty, error) {
	memoUID, err := ExtractMemoUIDFromName(request.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid memo name: %v", err)
	}
	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{
		UID: &memoUID,
	})
	if err != nil {
		return nil, err
	}
	if memo == nil {
		return nil, status.Errorf(codes.NotFound, "memo not found")
	}

	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user")
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}
	// Only the creator or admin can update the memo.
	if memo.CreatorID != user.ID && !isSuperUser(user) {
		return nil, status.Errorf(codes.PermissionDenied, "permission denied")
	}

	reactions, err := s.Store.ListReactions(ctx, &store.FindReaction{
		ContentID: &request.Name,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list reactions")
	}

	attachments, err := s.Store.ListAttachments(ctx, &store.FindAttachment{
		MemoID: &memo.ID,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list attachments")
	}

	deleteRelations, _ := s.loadMemoRelations(ctx, memo)
	if memoMessage, err := s.convertMemoFromStore(ctx, memo, reactions, attachments, deleteRelations); err == nil {
		// Try to dispatch webhook when memo is deleted.
		if err := s.DispatchMemoDeletedWebhook(ctx, memoMessage); err != nil {
			slog.Warn("Failed to dispatch memo deleted webhook", slog.Any("err", err))
		}
	}

	// Delete memo comments first (store.DeleteMemo handles their relations and attachments)
	commentType := store.MemoRelationComment
	relations, err := s.Store.ListMemoRelations(ctx, &store.FindMemoRelation{RelatedMemoID: &memo.ID, Type: &commentType})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list memo comments")
	}
	for _, relation := range relations {
		if err := s.Store.DeleteMemo(ctx, &store.DeleteMemo{ID: relation.MemoID}); err != nil {
			return nil, status.Errorf(codes.Internal, "failed to delete memo comment")
		}
	}

	// Delete the memo (store.DeleteMemo handles relation and attachment cleanup)
	if err = s.Store.DeleteMemo(ctx, &store.DeleteMemo{ID: memo.ID}); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to delete memo")
	}

	// Broadcast live refresh event.
	s.SSEHub.Broadcast(&SSEEvent{
		Type:       SSEEventMemoDeleted,
		Name:       request.Name,
		Visibility: memo.Visibility,
		CreatorID:  resolveSSECreatorID(memo, nil),
	})

	return &emptypb.Empty{}, nil
}

func (s *APIV1Service) getContentLengthLimit(ctx context.Context) (int, error) {
	instanceMemoRelatedSetting, err := s.Store.GetInstanceMemoRelatedSetting(ctx)
	if err != nil {
		return 0, status.Errorf(codes.Internal, "failed to get instance memo related setting")
	}
	return int(instanceMemoRelatedSetting.ContentLengthLimit), nil
}

// validateMemoVisibility checks that the given visibility is in the allowed
// list of the instance memo related setting. An empty allowed list means all
// visibilities are allowed.
func (s *APIV1Service) validateMemoVisibility(ctx context.Context, visibility store.Visibility) error {
	instanceMemoRelatedSetting, err := s.Store.GetInstanceMemoRelatedSetting(ctx)
	if err != nil {
		return status.Errorf(codes.Internal, "failed to get instance setting")
	}
	allowedVisibilities := instanceMemoRelatedSetting.AllowedVisibilities
	if len(allowedVisibilities) == 0 {
		return nil
	}
	visStr := visibility.String()
	for _, allowed := range allowedVisibilities {
		if allowed == visStr {
			return nil
		}
	}
	return status.Errorf(codes.InvalidArgument, "visibility %q is not allowed", visStr)
}

// DispatchMemoCreatedWebhook dispatches webhook when memo is created.
