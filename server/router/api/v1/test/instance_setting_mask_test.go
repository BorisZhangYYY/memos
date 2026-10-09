package test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
)

func TestUpdateInstanceSettingMask(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()
	admin, err := ts.CreateHostUser(ctx, "admin")
	require.NoError(t, err)
	adminCtx := ts.CreateUserContext(ctx, admin.ID)

	_, err = ts.Service.UpdateInstanceSetting(adminCtx, &v1pb.UpdateInstanceSettingRequest{Setting: &v1pb.InstanceSetting{
		Name: "instance/settings/GENERAL",
		Value: &v1pb.InstanceSetting_GeneralSetting_{GeneralSetting: &v1pb.InstanceSetting_GeneralSetting{
			AdditionalScript: "script", AdditionalStyle: "style", WeekStartDayOffset: 2,
			CustomProfile: &v1pb.InstanceSetting_GeneralSetting_CustomProfile{Title: "Before", Description: "Keep"},
		}},
	}})
	require.NoError(t, err)

	updated, err := ts.Service.UpdateInstanceSetting(adminCtx, &v1pb.UpdateInstanceSettingRequest{
		Setting: &v1pb.InstanceSetting{
			Name: "instance/settings/GENERAL",
			Value: &v1pb.InstanceSetting_GeneralSetting_{GeneralSetting: &v1pb.InstanceSetting_GeneralSetting{
				AdditionalStyle: "", CustomProfile: &v1pb.InstanceSetting_GeneralSetting_CustomProfile{Title: "After"},
			}},
		},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"additional_style", "general_setting.custom_profile.title"}},
	})
	require.NoError(t, err)
	require.Equal(t, "script", updated.GetGeneralSetting().AdditionalScript)
	require.Empty(t, updated.GetGeneralSetting().AdditionalStyle)
	require.Equal(t, int32(2), updated.GetGeneralSetting().WeekStartDayOffset)
	require.Equal(t, "After", updated.GetGeneralSetting().CustomProfile.Title)
	require.Equal(t, "Keep", updated.GetGeneralSetting().CustomProfile.Description)

	cleared, err := ts.Service.UpdateInstanceSetting(adminCtx, &v1pb.UpdateInstanceSettingRequest{
		Setting: &v1pb.InstanceSetting{
			Name:  "instance/settings/GENERAL",
			Value: &v1pb.InstanceSetting_GeneralSetting_{GeneralSetting: &v1pb.InstanceSetting_GeneralSetting{}},
		},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"custom_profile", "week_start_day_offset"}},
	})
	require.NoError(t, err)
	require.Nil(t, cleared.GetGeneralSetting().CustomProfile)
	require.Zero(t, cleared.GetGeneralSetting().WeekStartDayOffset)
	require.Equal(t, "script", cleared.GetGeneralSetting().AdditionalScript)

	_, err = ts.Service.UpdateInstanceSetting(adminCtx, &v1pb.UpdateInstanceSettingRequest{
		Setting: &v1pb.InstanceSetting{
			Name:  "instance/settings/GENERAL",
			Value: &v1pb.InstanceSetting_GeneralSetting_{GeneralSetting: &v1pb.InstanceSetting_GeneralSetting{}},
		},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"unknown_field"}},
	})
	require.Equal(t, codes.InvalidArgument, status.Code(err))
}

func TestUpdateInstanceSettingMaskPreservesWriteOnlyPassword(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()
	admin, err := ts.CreateHostUser(ctx, "admin")
	require.NoError(t, err)
	adminCtx := ts.CreateUserContext(ctx, admin.ID)
	_, err = ts.Service.UpdateInstanceSetting(adminCtx, &v1pb.UpdateInstanceSettingRequest{Setting: &v1pb.InstanceSetting{
		Name: "instance/settings/NOTIFICATION",
		Value: &v1pb.InstanceSetting_NotificationSetting_{NotificationSetting: &v1pb.InstanceSetting_NotificationSetting{
			Email: &v1pb.InstanceSetting_NotificationSetting_EmailSetting{
				Enabled: true, SmtpHost: "smtp.example.com", SmtpPort: 587, SmtpUsername: "bot@example.com",
				SmtpPassword: "keep-secret", FromEmail: "bot@example.com", FromName: "Before",
			},
		}},
	}})
	require.NoError(t, err)
	updated, err := ts.Service.UpdateInstanceSetting(adminCtx, &v1pb.UpdateInstanceSettingRequest{
		Setting: &v1pb.InstanceSetting{
			Name: "instance/settings/NOTIFICATION",
			Value: &v1pb.InstanceSetting_NotificationSetting_{NotificationSetting: &v1pb.InstanceSetting_NotificationSetting{
				Email: &v1pb.InstanceSetting_NotificationSetting_EmailSetting{FromName: "After"},
			}},
		},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"notification_setting.email.from_name"}},
	})
	require.NoError(t, err)
	require.Equal(t, "After", updated.GetNotificationSetting().GetEmail().FromName)
	require.Empty(t, updated.GetNotificationSetting().GetEmail().SmtpPassword)
	stored, err := ts.Store.GetInstanceNotificationSetting(ctx)
	require.NoError(t, err)
	require.Equal(t, "keep-secret", stored.GetEmail().SmtpPassword)
	require.Equal(t, "smtp.example.com", stored.GetEmail().SmtpHost)
}

func TestUpdateInstanceSettingMaskPreservesAIProviderKey(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()
	admin, err := ts.CreateHostUser(ctx, "admin")
	require.NoError(t, err)
	adminCtx := ts.CreateUserContext(ctx, admin.ID)
	_, err = ts.Service.UpdateInstanceSetting(adminCtx, &v1pb.UpdateInstanceSettingRequest{Setting: &v1pb.InstanceSetting{
		Name: "instance/settings/AI",
		Value: &v1pb.InstanceSetting_AiSetting{AiSetting: &v1pb.InstanceSetting_AISetting{
			Providers: []*v1pb.InstanceSetting_AIProviderConfig{{
				Id: "primary", Title: "Primary", Type: v1pb.InstanceSetting_OPENAI, ApiKey: "sk-stored",
			}},
		}},
	}})
	require.NoError(t, err)
	_, err = ts.Service.UpdateInstanceSetting(adminCtx, &v1pb.UpdateInstanceSettingRequest{
		Setting: &v1pb.InstanceSetting{
			Name: "instance/settings/AI",
			Value: &v1pb.InstanceSetting_AiSetting{AiSetting: &v1pb.InstanceSetting_AISetting{
				Transcription: &v1pb.InstanceSetting_TranscriptionConfig{ProviderId: "primary"},
			}},
		},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"ai_setting.transcription.provider_id"}},
	})
	require.NoError(t, err)
	stored, err := ts.Store.GetInstanceAISetting(ctx)
	require.NoError(t, err)
	require.Len(t, stored.Providers, 1)
	require.Equal(t, "sk-stored", stored.Providers[0].ApiKey)
	require.Equal(t, "primary", stored.GetTranscription().ProviderId)
}
