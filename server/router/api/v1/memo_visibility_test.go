package v1

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

func TestCreateMemo_VisibilityNotAllowed(t *testing.T) {
	ctx := context.Background()
	svc := newIntegrationService(t)

	author, err := svc.Store.CreateUser(ctx, &store.User{
		Username: "author", Role: store.RoleAdmin, Email: "author@example.com",
	})
	require.NoError(t, err)
	authorCtx := userCtx(ctx, author.ID)

	// Restrict allowed visibilities to PRIVATE only.
	_, err = svc.Store.UpsertInstanceSetting(ctx, &storepb.InstanceSetting{
		Key: storepb.InstanceSettingKey_MEMO_RELATED,
		Value: &storepb.InstanceSetting_MemoRelatedSetting{MemoRelatedSetting: &storepb.InstanceMemoRelatedSetting{
			AllowedVisibilities: []string{"PRIVATE"},
		}},
	})
	require.NoError(t, err)

	// A disallowed visibility is rejected with InvalidArgument.
	_, err = svc.CreateMemo(authorCtx, &v1pb.CreateMemoRequest{
		Memo: &v1pb.Memo{Content: "public memo", Visibility: v1pb.Visibility_PUBLIC},
	})
	require.Error(t, err)
	assert.Equal(t, codes.InvalidArgument, status.Code(err))

	// An allowed visibility succeeds.
	memo, err := svc.CreateMemo(authorCtx, &v1pb.CreateMemoRequest{
		Memo: &v1pb.Memo{Content: "private memo", Visibility: v1pb.Visibility_PRIVATE},
	})
	require.NoError(t, err)

	// Updating an existing memo to a disallowed visibility is rejected.
	_, err = svc.UpdateMemo(authorCtx, &v1pb.UpdateMemoRequest{
		Memo:       &v1pb.Memo{Name: memo.Name, Visibility: v1pb.Visibility_PUBLIC},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"visibility"}},
	})
	require.Error(t, err)
	assert.Equal(t, codes.InvalidArgument, status.Code(err))

	// Updating visibility to an allowed one succeeds.
	_, err = svc.UpdateMemo(authorCtx, &v1pb.UpdateMemoRequest{
		Memo:       &v1pb.Memo{Name: memo.Name, Visibility: v1pb.Visibility_PRIVATE},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"visibility"}},
	})
	require.NoError(t, err)
}

func TestCreateMemo_VisibilityAllowedByDefault(t *testing.T) {
	ctx := context.Background()
	svc := newIntegrationService(t)

	author, err := svc.Store.CreateUser(ctx, &store.User{
		Username: "author", Role: store.RoleAdmin, Email: "author@example.com",
	})
	require.NoError(t, err)
	authorCtx := userCtx(ctx, author.ID)

	// Without an allowed_visibilities setting, all visibilities are allowed.
	memo, err := svc.CreateMemo(authorCtx, &v1pb.CreateMemoRequest{
		Memo: &v1pb.Memo{Content: "public memo", Visibility: v1pb.Visibility_PUBLIC},
	})
	require.NoError(t, err)
	assert.Equal(t, v1pb.Visibility_PUBLIC, memo.Visibility)
}
