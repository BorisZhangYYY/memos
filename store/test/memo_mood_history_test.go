package test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

func TestMemoMoodHistorySurvivesDeletion(t *testing.T) {
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	defer ts.Close()
	owner, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)
	memo, err := ts.CreateMemo(ctx, &store.Memo{
		UID: "mood-history-original", CreatorID: owner.ID, Content: "private note",
		Visibility: store.Private, Payload: &storepb.MemoPayload{MoodLevel: 3},
	})
	require.NoError(t, err)
	changedUID := "mood-history-renamed"
	require.NoError(t, ts.UpdateMemo(ctx, &store.UpdateMemo{
		ID: memo.ID, UID: &changedUID, Payload: &storepb.MemoPayload{MoodLevel: 6},
	}))
	before, err := ts.ListDeletedMemoMoodHistory(ctx, owner.ID)
	require.NoError(t, err)
	require.Empty(t, before)
	require.NoError(t, ts.DeleteMemo(ctx, &store.DeleteMemo{ID: memo.ID}))
	deleted, err := ts.GetMemo(ctx, &store.FindMemo{ID: &memo.ID})
	require.NoError(t, err)
	require.Nil(t, deleted)
	history, err := ts.ListDeletedMemoMoodHistory(ctx, owner.ID)
	require.NoError(t, err)
	require.Len(t, history, 1)
	require.Equal(t, changedUID, history[0].MemoUID)
	require.Equal(t, int32(6), history[0].MoodLevel)
	require.Equal(t, memo.CreatedTs, history[0].CreatedTs)
	require.Positive(t, history[0].DeletedTs)

	cleared, err := ts.CreateMemo(ctx, &store.Memo{
		UID: "mood-history-cleared", CreatorID: owner.ID, Visibility: store.Private,
		Payload: &storepb.MemoPayload{MoodLevel: 2},
	})
	require.NoError(t, err)
	require.NoError(t, ts.UpdateMemo(ctx, &store.UpdateMemo{ID: cleared.ID, Payload: &storepb.MemoPayload{}}))
	require.NoError(t, ts.DeleteMemo(ctx, &store.DeleteMemo{ID: cleared.ID}))
	history, err = ts.ListDeletedMemoMoodHistory(ctx, owner.ID)
	require.NoError(t, err)
	require.Len(t, history, 1)
	_, err = ts.DeleteUser(ctx, &store.DeleteUser{ID: owner.ID})
	require.NoError(t, err)
	history, err = ts.ListDeletedMemoMoodHistory(ctx, owner.ID)
	require.NoError(t, err)
	require.Empty(t, history)
}
