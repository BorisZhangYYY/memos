package v1

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

// TestListMemos_DisabledVisibilityHidesMemos verifies that disabling PUBLIC via
// allowed_visibilities hides already-published PUBLIC memos (including the
// creator's own) from ListMemos, while PRIVATE/PROTECTED memos remain visible.
func TestListMemos_DisabledVisibilityHidesMemos(t *testing.T) {
	ctx := context.Background()
	svc := newIntegrationService(t)

	author, err := svc.Store.CreateUser(ctx, &store.User{
		Username: "author", Role: store.RoleAdmin, Email: "author@example.com",
	})
	require.NoError(t, err)
	authorCtx := userCtx(ctx, author.ID)

	viewer, err := svc.Store.CreateUser(ctx, &store.User{
		Username: "viewer", Role: store.RoleUser, Email: "viewer@example.com",
	})
	require.NoError(t, err)
	viewerCtx := userCtx(ctx, viewer.ID)

	// Author publishes one memo at each visibility level.
	privateMemo, err := svc.CreateMemo(authorCtx, &v1pb.CreateMemoRequest{
		Memo: &v1pb.Memo{Content: "private", Visibility: v1pb.Visibility_PRIVATE},
	})
	require.NoError(t, err)
	_, err = svc.CreateMemo(authorCtx, &v1pb.CreateMemoRequest{
		Memo: &v1pb.Memo{Content: "protected", Visibility: v1pb.Visibility_PROTECTED},
	})
	require.NoError(t, err)
	publicMemo, err := svc.CreateMemo(authorCtx, &v1pb.CreateMemoRequest{
		Memo: &v1pb.Memo{Content: "public", Visibility: v1pb.Visibility_PUBLIC},
	})
	require.NoError(t, err)

	// Disable PUBLIC only (PRIVATE + PROTECTED remain allowed).
	_, err = svc.UpdateInstanceSetting(authorCtx, &v1pb.UpdateInstanceSettingRequest{
		Setting: &v1pb.InstanceSetting{
			Name: "instance/settings/MEMO_RELATED",
			Value: &v1pb.InstanceSetting_MemoRelatedSetting_{
				MemoRelatedSetting: &v1pb.InstanceSetting_MemoRelatedSetting{
					AllowedVisibilities: []string{"PRIVATE", "PROTECTED"},
				},
			},
		},
	})
	require.NoError(t, err)

	// The author's own feed hides the PUBLIC memo but keeps PRIVATE/PROTECTED.
	ownList, err := svc.ListMemos(authorCtx, &v1pb.ListMemosRequest{})
	require.NoError(t, err)
	ownContents := map[string]bool{}
	for _, memo := range ownList.Memos {
		ownContents[memo.Content] = true
	}
	assert.True(t, ownContents["private"])
	assert.True(t, ownContents["protected"])
	assert.False(t, ownContents["public"], "author's own PUBLIC memo must be hidden when PUBLIC is disabled")

	// A viewer sees PRIVATE/PROTECTED-visible memos but not the PUBLIC one.
	viewerList, err := svc.ListMemos(viewerCtx, &v1pb.ListMemosRequest{})
	require.NoError(t, err)
	viewerContents := map[string]bool{}
	for _, memo := range viewerList.Memos {
		viewerContents[memo.Content] = true
	}
	assert.False(t, viewerContents["private"])
	assert.True(t, viewerContents["protected"])
	assert.False(t, viewerContents["public"])

	// GetMemo on the hidden PUBLIC memo returns NotFound.
	_, err = svc.GetMemo(viewerCtx, &v1pb.GetMemoRequest{Name: publicMemo.Name})
	require.Error(t, err)
	assert.Equal(t, codes.NotFound, status.Code(err))

	// Disabling PROTECTED too leaves only PRIVATE.
	_, err = svc.UpdateInstanceSetting(authorCtx, &v1pb.UpdateInstanceSettingRequest{
		Setting: &v1pb.InstanceSetting{
			Name: "instance/settings/MEMO_RELATED",
			Value: &v1pb.InstanceSetting_MemoRelatedSetting_{
				MemoRelatedSetting: &v1pb.InstanceSetting_MemoRelatedSetting{
					AllowedVisibilities: []string{"PRIVATE"},
				},
			},
		},
	})
	require.NoError(t, err)

	ownList2, err := svc.ListMemos(authorCtx, &v1pb.ListMemosRequest{})
	require.NoError(t, err)
	ownContents2 := map[string]bool{}
	for _, memo := range ownList2.Memos {
		ownContents2[memo.Content] = true
	}
	assert.True(t, ownContents2["private"])
	assert.False(t, ownContents2["protected"])
	assert.False(t, ownContents2["public"])

	// Creating a memo at a disabled visibility is rejected.
	_, err = svc.CreateMemo(authorCtx, &v1pb.CreateMemoRequest{
		Memo: &v1pb.Memo{Content: "should fail", Visibility: v1pb.Visibility_PROTECTED},
	})
	require.Error(t, err)
	assert.Equal(t, codes.InvalidArgument, status.Code(err))

	// Sanity: the private memo is still readable by its creator.
	got, err := svc.GetMemo(authorCtx, &v1pb.GetMemoRequest{Name: privateMemo.Name})
	require.NoError(t, err)
	assert.Equal(t, "private", got.Content)
}

// TestUpdateInstanceSetting_VisibilityHierarchy verifies that a setting allowing
// PUBLIC without PROTECTED is rejected, and unknown levels are rejected.
func TestUpdateInstanceSetting_VisibilityHierarchy(t *testing.T) {
	ctx := context.Background()
	svc := newIntegrationService(t)

	admin, err := svc.Store.CreateUser(ctx, &store.User{
		Username: "admin", Role: store.RoleAdmin, Email: "admin@example.com",
	})
	require.NoError(t, err)
	adminCtx := userCtx(ctx, admin.ID)

	// PUBLIC without PROTECTED violates the hierarchy.
	_, err = svc.UpdateInstanceSetting(adminCtx, &v1pb.UpdateInstanceSettingRequest{
		Setting: &v1pb.InstanceSetting{
			Name: "instance/settings/MEMO_RELATED",
			Value: &v1pb.InstanceSetting_MemoRelatedSetting_{
				MemoRelatedSetting: &v1pb.InstanceSetting_MemoRelatedSetting{
					AllowedVisibilities: []string{"PRIVATE", "PUBLIC"},
				},
			},
		},
	})
	require.Error(t, err)
	assert.Equal(t, codes.InvalidArgument, status.Code(err))

	// An unknown level is rejected.
	_, err = svc.UpdateInstanceSetting(adminCtx, &v1pb.UpdateInstanceSettingRequest{
		Setting: &v1pb.InstanceSetting{
			Name: "instance/settings/MEMO_RELATED",
			Value: &v1pb.InstanceSetting_MemoRelatedSetting_{
				MemoRelatedSetting: &v1pb.InstanceSetting_MemoRelatedSetting{
					AllowedVisibilities: []string{"PRIVATE", "SECRET"},
				},
			},
		},
	})
	require.Error(t, err)
	assert.Equal(t, codes.InvalidArgument, status.Code(err))

	// Valid combinations pass: empty (all allowed), PRIVATE+PROTECTED, PRIVATE.
	for _, allowed := range [][]string{nil, {"PRIVATE", "PROTECTED"}, {"PRIVATE"}} {
		_, err = svc.UpdateInstanceSetting(adminCtx, &v1pb.UpdateInstanceSettingRequest{
			Setting: &v1pb.InstanceSetting{
				Name: "instance/settings/MEMO_RELATED",
				Value: &v1pb.InstanceSetting_MemoRelatedSetting_{
					MemoRelatedSetting: &v1pb.InstanceSetting_MemoRelatedSetting{
						AllowedVisibilities: allowed,
					},
				},
			},
		})
		require.NoError(t, err, "allowed=%v should be accepted", allowed)
	}
}

// TestListMemos_DisabledPublicAnonymous verifies anonymous users see nothing
// when PUBLIC is disabled.
func TestListMemos_DisabledPublicAnonymous(t *testing.T) {
	ctx := context.Background()
	svc := newIntegrationService(t)

	admin, err := svc.Store.CreateUser(ctx, &store.User{
		Username: "admin", Role: store.RoleAdmin, Email: "admin@example.com",
	})
	require.NoError(t, err)
	adminCtx := userCtx(ctx, admin.ID)

	_, err = svc.CreateMemo(adminCtx, &v1pb.CreateMemoRequest{
		Memo: &v1pb.Memo{Content: "public memo", Visibility: v1pb.Visibility_PUBLIC},
	})
	require.NoError(t, err)

	// Disable PUBLIC.
	_, err = svc.Store.UpsertInstanceSetting(ctx, &storepb.InstanceSetting{
		Key: storepb.InstanceSettingKey_MEMO_RELATED,
		Value: &storepb.InstanceSetting_MemoRelatedSetting{MemoRelatedSetting: &storepb.InstanceMemoRelatedSetting{
			AllowedVisibilities: []string{"PRIVATE", "PROTECTED"},
		}},
	})
	require.NoError(t, err)

	// Anonymous ListMemos returns nothing.
	anonymousList, err := svc.ListMemos(ctx, &v1pb.ListMemosRequest{})
	require.NoError(t, err)
	assert.Len(t, anonymousList.Memos, 0)
}
