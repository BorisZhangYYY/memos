package v1

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

// createAuthorMemo creates a memo through the API as the given user context.
func createAuthorMemo(ctx context.Context, t *testing.T, svc *APIV1Service, content string, moodLevel int32) {
	t.Helper()
	_, err := svc.CreateMemo(ctx, &v1pb.CreateMemoRequest{
		Memo: &v1pb.Memo{Content: content, MoodLevel: moodLevel},
	})
	require.NoError(t, err)
}

func TestGetUserStats_MoodLevels(t *testing.T) {
	ctx := context.Background()
	svc := newIntegrationService(t)

	author, err := svc.Store.CreateUser(ctx, &store.User{
		Username: "author", Role: store.RoleAdmin, Email: "author@example.com",
	})
	require.NoError(t, err)
	authorCtx := userCtx(ctx, author.ID)

	// Pin the reference time before creating memos so date bucketing can't
	// drift across midnight.
	now := time.Now()

	// Three memos today: moods 3 and 5, one without a mood (0).
	createAuthorMemo(authorCtx, t, svc, "meh day", 3)
	createAuthorMemo(authorCtx, t, svc, "better", 5)
	createAuthorMemo(authorCtx, t, svc, "no mood", 0)

	// A single mooded memo two days ago carries its own mood.
	pastCreatedTsSec := now.AddDate(0, 0, -2).Unix()
	_, err = svc.Store.CreateMemo(ctx, &store.Memo{
		UID:        "moody-past",
		CreatorID:  author.ID,
		Content:    "great day",
		Visibility: store.Public,
		CreatedTs:  pastCreatedTsSec,
		UpdatedTs:  pastCreatedTsSec,
		Payload:    &storepb.MemoPayload{MoodLevel: 7},
	})
	require.NoError(t, err)

	stats, err := svc.GetUserStats(authorCtx, &v1pb.GetUserStatsRequest{Name: "users/author"})
	require.NoError(t, err)

	// mood_levels mirrors memo_created_timestamps one-to-one.
	require.Len(t, stats.MoodLevels, len(stats.MemoCreatedTimestamps))
	require.Len(t, stats.MoodMemoNames, len(stats.MemoCreatedTimestamps))
	require.Len(t, stats.MoodLevels, 4)
	assert.Contains(t, stats.MoodMemoNames, "memos/moody-past")
	for _, name := range stats.MoodMemoNames {
		assert.Regexp(t, `^memos/.+`, name)
	}

	// Group moods by the browser-visible date derived from each timestamp.
	moodsByDate := map[string][]int32{}
	for i, ts := range stats.MemoCreatedTimestamps {
		date := ts.AsTime().Format("2006-01-02")
		moodsByDate[date] = append(moodsByDate[date], stats.MoodLevels[i])
	}
	today := now.Format("2006-01-02")
	pastDay := now.AddDate(0, 0, -2).Format("2006-01-02")
	assert.ElementsMatch(t, []int32{0, 3, 5}, moodsByDate[today])
	assert.ElementsMatch(t, []int32{7}, moodsByDate[pastDay])
}

func TestListAllUserStats_MoodLevels(t *testing.T) {
	ctx := context.Background()
	svc := newIntegrationService(t)

	author, err := svc.Store.CreateUser(ctx, &store.User{
		Username: "author", Role: store.RoleAdmin, Email: "author@example.com",
	})
	require.NoError(t, err)
	authorCtx := userCtx(ctx, author.ID)

	createAuthorMemo(authorCtx, t, svc, "sad", 1)
	createAuthorMemo(authorCtx, t, svc, "happy", 6)

	response, err := svc.ListAllUserStats(authorCtx, &v1pb.ListAllUserStatsRequest{})
	require.NoError(t, err)
	require.Len(t, response.Stats, 1)

	stats := response.Stats[0]
	require.Len(t, stats.MoodLevels, len(stats.MemoCreatedTimestamps))
	require.Len(t, stats.MoodMemoNames, len(stats.MemoCreatedTimestamps))
	assert.ElementsMatch(t, []int32{1, 6}, stats.MoodLevels)
}

func TestUserStatsMoodLevelsVisibleOnlyToOwner(t *testing.T) {
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
		Memo: &v1pb.Memo{Content: "public memo", Visibility: v1pb.Visibility_PUBLIC, MoodLevel: 5},
	})
	require.NoError(t, err)

	ownerStats, err := svc.GetUserStats(userCtx(ctx, author.ID), &v1pb.GetUserStatsRequest{Name: "users/author"})
	require.NoError(t, err)
	assert.Equal(t, []int32{5}, ownerStats.MoodLevels)
	require.Len(t, ownerStats.MoodMemoNames, 1)
	assert.Regexp(t, `^memos/.+`, ownerStats.MoodMemoNames[0])

	viewerStats, err := svc.GetUserStats(userCtx(ctx, viewer.ID), &v1pb.GetUserStatsRequest{Name: "users/author"})
	require.NoError(t, err)
	assert.Empty(t, viewerStats.MoodLevels)
	assert.Empty(t, viewerStats.MoodMemoNames)

	publicStats, err := svc.GetUserStats(ctx, &v1pb.GetUserStatsRequest{Name: "users/author"})
	require.NoError(t, err)
	assert.Empty(t, publicStats.MoodLevels)
	assert.Empty(t, publicStats.MoodMemoNames)

	allStats, err := svc.ListAllUserStats(userCtx(ctx, viewer.ID), &v1pb.ListAllUserStatsRequest{})
	require.NoError(t, err)
	for _, stats := range allStats.Stats {
		if stats.Name == "users/author/stats" {
			assert.Empty(t, stats.MoodLevels)
			assert.Empty(t, stats.MoodMemoNames)
		}
	}
}
