package mysql

import (
	"context"

	"github.com/usememos/memos/store"
	"github.com/usememos/memos/store/db/moodhistory"
)

func (d *DB) ListDeletedMemoMoodHistory(ctx context.Context, creatorID int32) ([]*store.MemoMoodHistory, error) {
	return moodhistory.Adapter{DB: d.db, Dialect: "mysql"}.ListDeleted(ctx, creatorID)
}
