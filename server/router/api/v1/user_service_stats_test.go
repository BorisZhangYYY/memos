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
func createAuthorMemo(t *testing.T, ctx context.Context, svc *APIV1Service, content string, moodLevel int32) {
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
	createAuthorMemo(t, authorCtx, svc, "meh day", 3)
	createAuthorMemo(t, authorCtx, svc, "better", 5)
	createAuthorMemo(t, authorCtx, svc, "no mood", 0)

	// A single mooded memo two days ago carries its own mood.
	pastCreatedTs := now.AddDate(0, 0, -2).Unix()
	_, err = svc.Store.CreateMemo(ctx, &store.Memo{
		UID:        "moody-past",
		CreatorID:  author.ID,
		Content:    "great day",
		Visibility: store.Public,
		CreatedTs:  pastCreatedTs,
		UpdatedTs:  pastCreatedTs,
		Payload:    &storepb.MemoPayload{MoodLevel: 7},
	})
	require.NoError(t, err)

	stats, err := svc.GetUserStats(authorCtx, &v1pb.GetUserStatsRequest{Name: "users/author"})
	require.NoError(t, err)

	// mood_levels mirrors memo_created_timestamps one-to-one.
	require.Len(t, stats.MoodLevels, len(stats.MemoCreatedTimestamps))
	require.Len(t, stats.MoodLevels, 4)

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

	createAuthorMemo(t, authorCtx, svc, "sad", 1)
	createAuthorMemo(t, authorCtx, svc, "happy", 6)

	response, err := svc.ListAllUserStats(authorCtx, &v1pb.ListAllUserStatsRequest{})
	require.NoError(t, err)
	require.Len(t, response.Stats, 1)

	stats := response.Stats[0]
	require.Len(t, stats.MoodLevels, len(stats.MemoCreatedTimestamps))
	assert.ElementsMatch(t, []int32{1, 6}, stats.MoodLevels)
}
