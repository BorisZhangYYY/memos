package test

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/store"
)

// TestForkUpgradePreservesPersonalData upgrades the released fork schema, not a
// reconstructed upstream schema, and compares every legacy column after upgrade.
func TestForkUpgradePreservesPersonalData(t *testing.T) {
	ctx := context.Background()
	driver := getDriverFromEnv()
	dsn := getTestingProfileForDriver(t, driver).DSN
	db, err := sql.Open(driver, dsn)
	require.NoError(t, err)
	defer db.Close()
	schema, err := os.ReadFile("testdata/fork-v0.33.6/" + driver + ".sql")
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, string(schema))
	require.NoError(t, err)
	userTable, keyColumn := "`user`", "`key`"
	if driver == "postgres" {
		userTable, keyColumn = `"user"`, `"key"`
	}
	queries := []string{
		`INSERT INTO system_setting (name,value,description) VALUES ('BASIC','{"schemaVersion":"0.35.1"}','')`,
		fmt.Sprintf(`INSERT INTO %s (id,username,password_hash,avatar_url) VALUES (1,'legacy-owner','fixture','')`, userTable),
		`INSERT INTO memo (id,uid,creator_id,content,visibility,payload) VALUES (1,'old-memo',1,'old note','PUBLIC','{"moodLevel":7,"tags":["legacy"]}')`,
		`INSERT INTO memo (id,uid,creator_id,content,visibility,payload) VALUES (2,'old-comment',1,'old comment','PRIVATE','{}')`,
		`INSERT INTO memo_relation (memo_id,related_memo_id,type) VALUES (2,1,'COMMENT')`,
		`INSERT INTO attachment (id,uid,creator_id,memo_id,filename,reference,payload) VALUES (1,'old-file',1,1,'photo.jpg','assets/photo.jpg','{}')`,
		`INSERT INTO finance_wallet (id,uid,creator_id,name,balance_minor) VALUES (1,'old-wallet',1,'Private savings',12345)`,
		`INSERT INTO finance_category (id,uid,creator_id,name,type,emoji) VALUES (1,'old-category',1,'Food','EXPENSE','🍚')`,
		`INSERT INTO finance_transaction (id,uid,creator_id,occurred_ts,type,amount_minor,wallet_id,category_id,note) VALUES (1,'old-transaction',1,1700000000,'EXPENSE',123,1,1,'private note')`,
		`INSERT INTO reminder_list (id,uid,creator_id,name) VALUES (1,'old-list',1,'Personal')`,
		`INSERT INTO reminder (id,uid,creator_id,list_id,memo_id,title,due_date,recurrence_weekdays,tags) VALUES (1,'old-reminder',1,1,1,'Private reminder','2026-09-16','[]','[]')`,
		`INSERT INTO reminder_occurrence (id,uid,creator_id,reminder_uid,list_uid,list_name,title,memo_uid,completed_ts,scheduled_date) VALUES (1,'old-occurrence',1,'old-reminder','old-list','Personal','Private reminder','old-memo',1700000000,'2026-09-15')`,
		fmt.Sprintf(`INSERT INTO user_setting (user_id,%s,value) VALUES (1,'SHORTCUTS','{"shortcuts":[{"id":"legacy","title":"My saved filter","filter":"mood_level == 7"}]}')`, keyColumn),
	}
	for _, query := range queries {
		_, err = db.ExecContext(ctx, query)
		require.NoError(t, err, query)
	}
	// Explicit legacy columns avoid treating additive schema changes as data loss.
	tables := map[string]string{
		"memo":          "id,uid,creator_id,created_ts,updated_ts,row_status,content,visibility,pinned,payload",
		"memo_relation": "*", "attachment": "*", "finance_wallet": "*", "finance_category": "*", "finance_transaction": "*", "reminder_list": "*", "reminder": "*", "reminder_occurrence": "*",
	}
	snapshot := func(table, columns string) [][]string {
		rows, err := db.QueryContext(ctx, "SELECT "+columns+" FROM "+table)
		require.NoError(t, err)
		defer rows.Close()
		names, err := rows.Columns()
		require.NoError(t, err)
		var result [][]string
		for rows.Next() {
			values := make([]any, len(names))
			targets := make([]any, len(names))
			for i := range values {
				targets[i] = &values[i]
			}
			require.NoError(t, rows.Scan(targets...))
			record := make([]string, len(values))
			for i, value := range values {
				if bytes, ok := value.([]byte); ok {
					record[i] = string(bytes)
				} else {
					record[i] = fmt.Sprint(value)
				}
			}
			result = append(result, record)
		}
		require.NoError(t, rows.Err())
		return result
	}
	before := map[string][][]string{}
	for table, columns := range tables {
		before[table] = snapshot(table, columns)
	}
	upgraded := NewTestingStoreWithDSN(ctx, t, driver, dsn)
	require.NoError(t, upgraded.Migrate(ctx))
	require.NoError(t, upgraded.Migrate(ctx), "restart must not reapply migrations")
	for table, columns := range tables {
		require.Equal(t, before[table], snapshot(table, columns), "legacy data changed in %s", table)
	}
	var savedView string
	require.NoError(t, db.QueryRowContext(ctx, fmt.Sprintf("SELECT value FROM user_setting WHERE user_id=1 AND %s='MEMO_VIEWS'", keyColumn)).Scan(&savedView))
	require.JSONEq(t, `{"memoViews":[{"id":"legacy","title":"My saved filter","filter":"mood_level == 7"}]}`, savedView)
	require.NoError(t, upgraded.DeleteMemo(ctx, &store.DeleteMemo{ID: 1}))
	var linkedMemo sql.NullInt64
	require.NoError(t, db.QueryRowContext(ctx, "SELECT memo_id FROM reminder WHERE id=1").Scan(&linkedMemo))
	require.False(t, linkedMemo.Valid, "deleting a memo only detaches its private reminder")
	require.Equal(t, before["reminder_occurrence"], snapshot("reminder_occurrence", "*"), "completion history must survive memo deletion")
}
