package v1

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

func TestLegacyShortcutsShareStorageAndPrivacyWithViews(t *testing.T) {
	ctx := context.Background()
	svc := newIntegrationService(t)
	owner, err := svc.Store.CreateUser(ctx, &store.User{Username: "owner", Role: store.RoleUser})
	require.NoError(t, err)
	admin, err := svc.Store.CreateUser(ctx, &store.User{Username: "admin", Role: store.RoleAdmin})
	require.NoError(t, err)
	ownerCtx := userCtx(ctx, owner.ID)
	shortcut, err := svc.CreateShortcut(ownerCtx, &v1pb.CreateShortcutRequest{Parent: "users/owner", Shortcut: &v1pb.Shortcut{Title: "Private mood", Filter: "mood_level == 7"}})
	require.NoError(t, err)
	views, err := svc.ListMemoViews(ownerCtx, &v1pb.ListMemoViewsRequest{Parent: "users/owner"})
	require.NoError(t, err)
	require.Len(t, views.MemoViews, 1)
	require.Equal(t, shortcutViewName(shortcut.Name), views.MemoViews[0].Name)
	_, err = svc.UpdateMemoView(ownerCtx, &v1pb.UpdateMemoViewRequest{MemoView: &v1pb.MemoView{Name: views.MemoViews[0].Name, Title: "Renamed"}, UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"title"}}})
	require.NoError(t, err)
	got, err := svc.GetShortcut(ownerCtx, &v1pb.GetShortcutRequest{Name: shortcut.Name})
	require.NoError(t, err)
	require.Equal(t, "Renamed", got.Title)
	_, err = svc.ListShortcuts(userCtx(ctx, admin.ID), &v1pb.ListShortcutsRequest{Parent: "users/owner"})
	require.Equal(t, codes.PermissionDenied, status.Code(err))
	_, err = svc.DeleteShortcut(ownerCtx, &v1pb.DeleteShortcutRequest{Name: shortcut.Name})
	require.NoError(t, err)
	views, err = svc.ListMemoViews(ownerCtx, &v1pb.ListMemoViewsRequest{Parent: "users/owner"})
	require.NoError(t, err)
	require.Empty(t, views.MemoViews)
}
