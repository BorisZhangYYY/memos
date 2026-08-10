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
	"github.com/usememos/memos/store"
)

func TestCreateMemo_MoodLevel(t *testing.T) {
	ctx := context.Background()
	svc := newIntegrationService(t)

	author, err := svc.Store.CreateUser(ctx, &store.User{
		Username: "author", Role: store.RoleAdmin, Email: "author@example.com",
	})
	require.NoError(t, err)
	authorCtx := userCtx(ctx, author.ID)

	// Creating a memo with a mood level persists and returns it.
	memo, err := svc.CreateMemo(authorCtx, &v1pb.CreateMemoRequest{
		Memo: &v1pb.Memo{Content: "moody memo", MoodLevel: 4},
	})
	require.NoError(t, err)
	assert.Equal(t, int32(4), memo.MoodLevel)

	// The store record carries the mood level.
	memoUID, err := ExtractMemoUIDFromName(memo.Name)
	require.NoError(t, err)
	stored, err := svc.Store.GetMemo(ctx, &store.FindMemo{UID: &memoUID})
	require.NoError(t, err)
	require.NotNil(t, stored.Payload)
	assert.Equal(t, int32(4), stored.Payload.MoodLevel)

	// Creating a memo without a mood level defaults to 0.
	plain, err := svc.CreateMemo(authorCtx, &v1pb.CreateMemoRequest{
		Memo: &v1pb.Memo{Content: "plain memo"},
	})
	require.NoError(t, err)
	assert.Equal(t, int32(0), plain.MoodLevel)
}

func TestUpdateMemo_MoodLevel(t *testing.T) {
	ctx := context.Background()
	svc := newIntegrationService(t)

	author, err := svc.Store.CreateUser(ctx, &store.User{
		Username: "author", Role: store.RoleAdmin, Email: "author@example.com",
	})
	require.NoError(t, err)
	authorCtx := userCtx(ctx, author.ID)

	memo, err := svc.CreateMemo(authorCtx, &v1pb.CreateMemoRequest{
		Memo: &v1pb.Memo{Content: "moody memo"},
	})
	require.NoError(t, err)
	assert.Equal(t, int32(0), memo.MoodLevel)

	// Updating the mood level is reflected in the response.
	updated, err := svc.UpdateMemo(authorCtx, &v1pb.UpdateMemoRequest{
		Memo:       &v1pb.Memo{Name: memo.Name, MoodLevel: 6},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"mood_level"}},
	})
	require.NoError(t, err)
	assert.Equal(t, int32(6), updated.MoodLevel)

	// The store record carries the updated mood level.
	memoUID, err := ExtractMemoUIDFromName(memo.Name)
	require.NoError(t, err)
	stored, err := svc.Store.GetMemo(ctx, &store.FindMemo{UID: &memoUID})
	require.NoError(t, err)
	require.NotNil(t, stored.Payload)
	assert.Equal(t, int32(6), stored.Payload.MoodLevel)

	// Clearing the mood level sets it back to 0.
	cleared, err := svc.UpdateMemo(authorCtx, &v1pb.UpdateMemoRequest{
		Memo:       &v1pb.Memo{Name: memo.Name, MoodLevel: 0},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"mood_level"}},
	})
	require.NoError(t, err)
	assert.Equal(t, int32(0), cleared.MoodLevel)
}

func TestMemoMoodLevelVisibleOnlyToCreator(t *testing.T) {
	ctx := context.Background()
	svc := newIntegrationService(t)

	author, err := svc.Store.CreateUser(ctx, &store.User{
		Username: "author", Role: store.RoleAdmin, Email: "author@example.com",
	})
	require.NoError(t, err)
	viewer, err := svc.Store.CreateUser(ctx, &store.User{
		Username: "viewer", Role: store.RoleUser, Email: "viewer@example.com",
	})
	require.NoError(t, err)

	memo, err := svc.CreateMemo(userCtx(ctx, author.ID), &v1pb.CreateMemoRequest{
		Memo: &v1pb.Memo{Content: "public content, private mood", Visibility: v1pb.Visibility_PUBLIC, MoodLevel: 6},
	})
	require.NoError(t, err)
	assert.Equal(t, int32(6), memo.MoodLevel)

	ownerView, err := svc.GetMemo(userCtx(ctx, author.ID), &v1pb.GetMemoRequest{Name: memo.Name})
	require.NoError(t, err)
	assert.Equal(t, int32(6), ownerView.MoodLevel)

	viewerView, err := svc.GetMemo(userCtx(ctx, viewer.ID), &v1pb.GetMemoRequest{Name: memo.Name})
	require.NoError(t, err)
	assert.Equal(t, memo.Content, viewerView.Content)
	assert.Zero(t, viewerView.MoodLevel)

	publicView, err := svc.GetMemo(ctx, &v1pb.GetMemoRequest{Name: memo.Name})
	require.NoError(t, err)
	assert.Equal(t, memo.Content, publicView.Content)
	assert.Zero(t, publicView.MoodLevel)
}

func TestMoodFilterRestrictedToCurrentUser(t *testing.T) {
	ctx := context.Background()
	svc := newIntegrationService(t)

	author, err := svc.Store.CreateUser(ctx, &store.User{
		Username: "author", Role: store.RoleAdmin, Email: "author@example.com",
	})
	require.NoError(t, err)
	viewer, err := svc.Store.CreateUser(ctx, &store.User{
		Username: "viewer", Role: store.RoleUser, Email: "viewer@example.com",
	})
	require.NoError(t, err)

	_, err = svc.CreateMemo(userCtx(ctx, author.ID), &v1pb.CreateMemoRequest{
		Memo: &v1pb.Memo{Content: "author mood", Visibility: v1pb.Visibility_PUBLIC, MoodLevel: 7},
	})
	require.NoError(t, err)
	viewerMemo, err := svc.CreateMemo(userCtx(ctx, viewer.ID), &v1pb.CreateMemoRequest{
		Memo: &v1pb.Memo{Content: "viewer mood", Visibility: v1pb.Visibility_PRIVATE, MoodLevel: 7},
	})
	require.NoError(t, err)

	response, err := svc.ListMemos(userCtx(ctx, viewer.ID), &v1pb.ListMemosRequest{Filter: "mood_level == 7"})
	require.NoError(t, err)
	require.Len(t, response.Memos, 1)
	assert.Equal(t, viewerMemo.Name, response.Memos[0].Name)

	_, err = svc.ListMemos(ctx, &v1pb.ListMemosRequest{Filter: "mood_level == 7"})
	require.Error(t, err)
	assert.Equal(t, codes.PermissionDenied, status.Code(err))
}
