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

func TestGetUserStats_DailyMoodStats(t *testing.T) {
	ctx := context.Background()
	svc := newIntegrationService(t)

	author, err := svc.Store.CreateUser(ctx, &store.User{
		Username: "author", Role: store.RoleAdmin, Email: "author@example.com",
	})
	require.NoError(t, err)
	authorCtx := userCtx(ctx, author.ID)

	// Two mooded memos today average to 4; one plain memo is excluded.
	createAuthorMemo(t, authorCtx, svc, "meh day", 3)
	createAuthorMemo(t, authorCtx, svc, "better", 5)
	createAuthorMemo(t, authorCtx, svc, "no mood", 0)

	// A single mooded memo two days ago carries its own mood.
	pastCreatedTs := time.Now().AddDate(0, 0, -2).Unix()
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

	today := time.Now().Format("2006-01-02")
	pastDay := time.Unix(pastCreatedTs, 0).Format("2006-01-02")
	assert.Equal(t, float32(4), stats.DailyMoodStats[today], "average of mood 3 and 5 is 4")
	assert.Equal(t, float32(7), stats.DailyMoodStats[pastDay])
	assert.Len(t, stats.DailyMoodStats, 2, "days without mooded memos must not appear")
}

func TestListAllUserStats_DailyMoodStats(t *testing.T) {
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

	today := time.Now().Format("2006-01-02")
	// 1 and 6 average to 3.5.
	assert.InDelta(t, 3.5, float64(response.Stats[0].DailyMoodStats[today]), 0.001)
}
