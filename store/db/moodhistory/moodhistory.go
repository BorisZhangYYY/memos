// Package moodhistory keeps memo mood snapshots independent from memo payloads.
package moodhistory

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"google.golang.org/protobuf/encoding/protojson"

	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

// Adapter handles the small SQL differences between supported databases.
type Adapter struct {
	DB      *sql.DB
	Dialect string
}

type runner interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func (a Adapter) placeholder() string {
	if a.Dialect == "postgres" {
		return "$1"
	}
	return "?"
}

// SyncMemo records the current mood or removes a cleared mood. Calling it before
// deletion marks the snapshot as deleted without retaining the memo itself.
func (a Adapter) SyncMemo(ctx context.Context, tx runner, memoID int32, deleting bool) error {
	createdColumn := "created_ts"
	if a.Dialect == "mysql" {
		createdColumn = "UNIX_TIMESTAMP(created_ts)"
	}
	var uid, payload string
	var creatorID int32
	var createdTs int64
	err := tx.QueryRowContext(ctx,
		"SELECT uid, creator_id, "+createdColumn+", payload FROM memo WHERE id = "+a.placeholder(), memoID,
	).Scan(&uid, &creatorID, &createdTs, &payload)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	memoPayload := &storepb.MemoPayload{}
	if err := protojson.Unmarshal([]byte(payload), memoPayload); err != nil {
		return err
	}
	if memoPayload.MoodLevel < 1 || memoPayload.MoodLevel > 7 {
		_, err := tx.ExecContext(ctx, "DELETE FROM memo_mood_history WHERE memo_id = "+a.placeholder(), memoID)
		return err
	}
	var deletedTs any
	if deleting {
		deletedTs = time.Now().Unix()
	}
	switch a.Dialect {
	case "mysql":
		_, err = tx.ExecContext(ctx, `INSERT INTO memo_mood_history
			(memo_id, memo_uid, creator_id, created_ts, mood_level, deleted_ts)
			VALUES (?, ?, ?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE memo_uid = VALUES(memo_uid), creator_id = VALUES(creator_id),
			created_ts = VALUES(created_ts), mood_level = VALUES(mood_level), deleted_ts = VALUES(deleted_ts)`,
			memoID, uid, creatorID, createdTs, memoPayload.MoodLevel, deletedTs)
	case "postgres":
		_, err = tx.ExecContext(ctx, `INSERT INTO memo_mood_history
			(memo_id, memo_uid, creator_id, created_ts, mood_level, deleted_ts)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (memo_id) DO UPDATE SET memo_uid = EXCLUDED.memo_uid, creator_id = EXCLUDED.creator_id,
			created_ts = EXCLUDED.created_ts, mood_level = EXCLUDED.mood_level, deleted_ts = EXCLUDED.deleted_ts`,
			memoID, uid, creatorID, createdTs, memoPayload.MoodLevel, deletedTs)
	default:
		_, err = tx.ExecContext(ctx, `INSERT INTO memo_mood_history
			(memo_id, memo_uid, creator_id, created_ts, mood_level, deleted_ts)
			VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT (memo_id) DO UPDATE SET memo_uid = excluded.memo_uid, creator_id = excluded.creator_id,
			created_ts = excluded.created_ts, mood_level = excluded.mood_level, deleted_ts = excluded.deleted_ts`,
			memoID, uid, creatorID, createdTs, memoPayload.MoodLevel, deletedTs)
	}
	return err
}

// PurgeUser erases retained mood snapshots when their owner is deleted.
func (a Adapter) PurgeUser(ctx context.Context, tx runner, creatorID int32) error {
	_, err := tx.ExecContext(ctx, "DELETE FROM memo_mood_history WHERE creator_id = "+a.placeholder(), creatorID)
	return err
}

// ListDeleted returns only snapshots whose memos no longer exist.
func (a Adapter) ListDeleted(ctx context.Context, creatorID int32) ([]*store.MemoMoodHistory, error) {
	rows, err := a.DB.QueryContext(ctx, `SELECT memo_id, memo_uid, creator_id, created_ts, mood_level, deleted_ts
		FROM memo_mood_history WHERE creator_id = `+a.placeholder()+` AND deleted_ts IS NOT NULL
		ORDER BY created_ts DESC, memo_id DESC`, creatorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []*store.MemoMoodHistory{}
	for rows.Next() {
		history := &store.MemoMoodHistory{}
		if err := rows.Scan(&history.MemoID, &history.MemoUID, &history.CreatorID, &history.CreatedTs, &history.MoodLevel, &history.DeletedTs); err != nil {
			return nil, err
		}
		list = append(list, history)
	}
	return list, rows.Err()
}
