package v1

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

// TestUpdateInstanceSetting_MemoRelatedPersists verifies that saving a memo-related
// instance setting through the public API persists allowed_visibilities and
// mood_emojis (regression for the converter dropping those fields).
func TestUpdateInstanceSetting_MemoRelatedPersists(t *testing.T) {
	ctx := context.Background()
	svc := newIntegrationService(t)

	admin, err := svc.Store.CreateUser(ctx, &store.User{
		Username: "admin", Role: store.RoleAdmin, Email: "admin@example.com",
	})
	require.NoError(t, err)
	adminCtx := userCtx(ctx, admin.ID)

	// Save memo-related setting with the new fields via the public API.
	setting, err := svc.UpdateInstanceSetting(adminCtx, &v1pb.UpdateInstanceSettingRequest{
		Setting: &v1pb.InstanceSetting{
			Name: "instance/settings/MEMO_RELATED",
			Value: &v1pb.InstanceSetting_MemoRelatedSetting_{
				MemoRelatedSetting: &v1pb.InstanceSetting_MemoRelatedSetting{
					AllowedVisibilities: []string{"PRIVATE", "PROTECTED"},
					MoodEmojis:          []string{"😫", "😟", "😔", "😐", "😌", "☺️", "😆"},
				},
			},
		},
	})
	require.NoError(t, err)

	// The response echoes the persisted values.
	memoRelated := setting.GetMemoRelatedSetting()
	require.NotNil(t, memoRelated)
	require.Equal(t, []string{"PRIVATE", "PROTECTED"}, memoRelated.AllowedVisibilities)
	require.Equal(t, []string{"😫", "😟", "😔", "😐", "😌", "☺️", "😆"}, memoRelated.MoodEmojis)

	// Read back from the store to confirm persistence (not just echo).
	stored, err := svc.Store.GetInstanceMemoRelatedSetting(ctx)
	require.NoError(t, err)
	require.NotNil(t, stored)
	require.Equal(t, []string{"PRIVATE", "PROTECTED"}, stored.AllowedVisibilities)
	require.Equal(t, []string{"😫", "😟", "😔", "😐", "😌", "☺️", "😆"}, stored.MoodEmojis)

	// Read back through the API converter as the frontend would.
	got, err := svc.GetInstanceSetting(adminCtx, &v1pb.GetInstanceSettingRequest{
		Name: "instance/settings/MEMO_RELATED",
	})
	require.NoError(t, err)
	gotMemoRelated := got.GetMemoRelatedSetting()
	require.NotNil(t, gotMemoRelated)
	require.Equal(t, []string{"PRIVATE", "PROTECTED"}, gotMemoRelated.AllowedVisibilities)
	require.Equal(t, []string{"😫", "😟", "😔", "😐", "😌", "☺️", "😆"}, gotMemoRelated.MoodEmojis)
}
