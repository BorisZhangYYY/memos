package store

import "context"

// MemoMoodHistory is the owner's mood snapshot, retained after its memo is deleted.
type MemoMoodHistory struct {
	MemoID    int32
	MemoUID   string
	CreatorID int32
	CreatedTs int64
	MoodLevel int32
	DeletedTs int64
}

// ListDeletedMemoMoodHistory returns independent snapshots for deleted memos.
func (s *Store) ListDeletedMemoMoodHistory(ctx context.Context, creatorID int32) ([]*MemoMoodHistory, error) {
	return s.driver.ListDeletedMemoMoodHistory(ctx, creatorID)
}
