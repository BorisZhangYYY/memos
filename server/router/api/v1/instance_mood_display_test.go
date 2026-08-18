package v1

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

func TestMemoMoodDisplayDefaultsAndPartialUpdate(t *testing.T) {
	ctx := context.Background()
	svc := newIntegrationService(t)
	admin, err := svc.Store.CreateUser(ctx, &store.User{
		Username: "admin", Role: store.RoleAdmin, Email: "admin@example.com",
	})
	require.NoError(t, err)
	adminCtx := userCtx(ctx, admin.ID)

	display, err := svc.GetMemoMoodDisplay(ctx, &v1pb.GetMemoMoodDisplayRequest{})
	require.NoError(t, err)
	require.Len(t, display.Levels, memoMoodLevelCount)
	require.Equal(t, "😫", display.Levels[0].Emoji)
	require.Equal(t, "#8b5cf6", display.Levels[6].Color)

	_, err = svc.UpdateInstanceSetting(adminCtx, &v1pb.UpdateInstanceSettingRequest{
		Setting: &v1pb.InstanceSetting{
			Name: "instance/settings/MEMO_RELATED",
			Value: &v1pb.InstanceSetting_MemoRelatedSetting_{
				MemoRelatedSetting: &v1pb.InstanceSetting_MemoRelatedSetting{
					ContentLengthLimit:    store.DefaultContentLengthLimit,
					EnableDoubleClickEdit: true,
					Reactions:             []string{"👍", "🎉"},
					AllowedVisibilities:   []string{"PRIVATE", "PROTECTED"},
				},
			},
		},
	})
	require.NoError(t, err)

	emoji := "🤩"
	color := "#ABCDEF"
	display, err = svc.UpdateMemoMoodDisplay(adminCtx, &v1pb.UpdateMemoMoodDisplayRequest{
		Updates: []*v1pb.UpdateMemoMoodDisplayRequest_MoodLevelUpdate{
			{Level: 6, Emoji: &emoji, Color: &color},
		},
	})
	require.NoError(t, err)
	require.Len(t, display.Levels, memoMoodLevelCount)
	require.Equal(t, "🤩", display.Levels[5].Emoji)
	require.Equal(t, "#abcdef", display.Levels[5].Color)
	require.Equal(t, "😫", display.Levels[0].Emoji)

	stored, err := svc.Store.GetInstanceMemoRelatedSetting(ctx)
	require.NoError(t, err)
	require.True(t, stored.EnableDoubleClickEdit)
	require.Equal(t, []string{"👍", "🎉"}, stored.Reactions)
	require.Equal(t, []string{"PRIVATE", "PROTECTED"}, stored.AllowedVisibilities)
	require.Equal(t, "🤩", stored.MoodEmojis[5])
	require.Equal(t, "#abcdef", stored.MoodColors[5])
}

func TestUpdateMemoMoodDisplayValidationAndAuthorization(t *testing.T) {
	ctx := context.Background()
	svc := newIntegrationService(t)
	admin, err := svc.Store.CreateUser(ctx, &store.User{Username: "admin", Role: store.RoleAdmin})
	require.NoError(t, err)
	member, err := svc.Store.CreateUser(ctx, &store.User{Username: "member", Role: store.RoleUser})
	require.NoError(t, err)
	adminCtx := userCtx(ctx, admin.ID)
	memberCtx := userCtx(ctx, member.ID)

	emoji := "🙂"
	_, err = svc.UpdateMemoMoodDisplay(memberCtx, &v1pb.UpdateMemoMoodDisplayRequest{
		Updates: []*v1pb.UpdateMemoMoodDisplayRequest_MoodLevelUpdate{{Level: 4, Emoji: &emoji}},
	})
	require.Equal(t, codes.PermissionDenied, status.Code(err))

	tests := []struct {
		name    string
		request *v1pb.UpdateMemoMoodDisplayRequest
	}{
		{name: "empty", request: &v1pb.UpdateMemoMoodDisplayRequest{}},
		{name: "out of range", request: &v1pb.UpdateMemoMoodDisplayRequest{
			Updates: []*v1pb.UpdateMemoMoodDisplayRequest_MoodLevelUpdate{{Level: 8, Emoji: &emoji}},
		}},
		{name: "no fields", request: &v1pb.UpdateMemoMoodDisplayRequest{
			Updates: []*v1pb.UpdateMemoMoodDisplayRequest_MoodLevelUpdate{{Level: 4}},
		}},
		{name: "duplicate", request: &v1pb.UpdateMemoMoodDisplayRequest{
			Updates: []*v1pb.UpdateMemoMoodDisplayRequest_MoodLevelUpdate{{Level: 4, Emoji: &emoji}, {Level: 4, Emoji: &emoji}},
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := svc.UpdateMemoMoodDisplay(adminCtx, test.request)
			require.Equal(t, codes.InvalidArgument, status.Code(err))
		})
	}
}
