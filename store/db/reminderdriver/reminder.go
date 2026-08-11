// Package reminderdriver provides the shared SQL implementation for reminder storage.
package reminderdriver

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"github.com/usememos/memos/store"
)

// Adapter applies the small placeholder and insert-id differences between drivers.
type Adapter struct {
	DB      *sql.DB
	Dialect string
}

func (a Adapter) bind(query string) string {
	if a.Dialect != "postgres" {
		return query
	}
	var builder strings.Builder
	index := 1
	for _, character := range query {
		if character == '?' {
			builder.WriteString("$")
			builder.WriteString(intString(index))
			index++
		} else {
			builder.WriteRune(character)
		}
	}
	return builder.String()
}

func intString(value int) string {
	if value == 0 {
		return "0"
	}
	var digits [20]byte
	position := len(digits)
	for value > 0 {
		position--
		digits[position] = byte('0' + value%10)
		value /= 10
	}
	return string(digits[position:])
}

func (a Adapter) insertID(ctx context.Context, query string, args ...any) (int32, error) {
	if a.Dialect == "postgres" {
		var id int32
		if err := a.DB.QueryRowContext(ctx, a.bind(query+" RETURNING id"), args...).Scan(&id); err != nil {
			return 0, err
		}
		return id, nil
	}
	result, err := a.DB.ExecContext(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	id, err := result.LastInsertId()
	return int32(id), err
}

func (a Adapter) CreateList(ctx context.Context, value *store.ReminderList) (*store.ReminderList, error) {
	nowSec := time.Now().Unix()
	id, err := a.insertID(ctx, `
		INSERT INTO reminder_list (uid, creator_id, created_ts, updated_ts, row_status, name, color, icon, sort_order)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, value.UID, value.CreatorID, nowSec, nowSec, store.Normal, value.Name, value.Color, value.Icon, value.SortOrder)
	if err != nil {
		return nil, err
	}
	return a.getList(ctx, id, value.CreatorID)
}

func (a Adapter) ListLists(ctx context.Context, find *store.FindReminderList) ([]*store.ReminderList, error) {
	where, args := []string{"1 = 1"}, []any{}
	if find.ID != nil {
		where, args = append(where, "id = ?"), append(args, *find.ID)
	}
	if find.UID != nil {
		where, args = append(where, "uid = ?"), append(args, *find.UID)
	}
	if find.CreatorID != nil {
		where, args = append(where, "creator_id = ?"), append(args, *find.CreatorID)
	}
	if find.RowStatus != nil {
		where, args = append(where, "row_status = ?"), append(args, *find.RowStatus)
	}
	rows, err := a.DB.QueryContext(ctx, a.bind(`
		SELECT id, uid, creator_id, created_ts, updated_ts, row_status, name, color, icon, sort_order
		FROM reminder_list WHERE `+strings.Join(where, " AND ")+` ORDER BY sort_order ASC, id ASC`), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	lists := []*store.ReminderList{}
	for rows.Next() {
		value := &store.ReminderList{}
		if err := scanList(rows, value); err != nil {
			return nil, err
		}
		lists = append(lists, value)
	}
	return lists, rows.Err()
}

func (a Adapter) UpdateList(ctx context.Context, update *store.UpdateReminderList) (*store.ReminderList, error) {
	set, args := []string{"updated_ts = ?"}, []any{time.Now().Unix()}
	if update.Name != nil {
		set, args = append(set, "name = ?"), append(args, *update.Name)
	}
	if update.Color != nil {
		set, args = append(set, "color = ?"), append(args, *update.Color)
	}
	if update.Icon != nil {
		set, args = append(set, "icon = ?"), append(args, *update.Icon)
	}
	if update.SortOrder != nil {
		set, args = append(set, "sort_order = ?"), append(args, *update.SortOrder)
	}
	if update.RowStatus != nil {
		set, args = append(set, "row_status = ?"), append(args, *update.RowStatus)
	}
	args = append(args, update.ID, update.CreatorID)
	if _, err := a.DB.ExecContext(ctx, a.bind("UPDATE reminder_list SET "+strings.Join(set, ", ")+" WHERE id = ? AND creator_id = ?"), args...); err != nil {
		return nil, err
	}
	return a.getList(ctx, update.ID, update.CreatorID)
}

func (a Adapter) getList(ctx context.Context, id, creatorID int32) (*store.ReminderList, error) {
	value := &store.ReminderList{}
	err := a.DB.QueryRowContext(ctx, a.bind(`
		SELECT id, uid, creator_id, created_ts, updated_ts, row_status, name, color, icon, sort_order
		FROM reminder_list WHERE id = ? AND creator_id = ?`), id, creatorID).Scan(
		&value.ID, &value.UID, &value.CreatorID, &value.CreatedTs, &value.UpdatedTs,
		&value.RowStatus, &value.Name, &value.Color, &value.Icon, &value.SortOrder)
	return value, err
}

type scanner interface {
	Scan(...any) error
}

func scanList(row scanner, value *store.ReminderList) error {
	return row.Scan(&value.ID, &value.UID, &value.CreatorID, &value.CreatedTs, &value.UpdatedTs,
		&value.RowStatus, &value.Name, &value.Color, &value.Icon, &value.SortOrder)
}

func (a Adapter) CreateReminder(ctx context.Context, value *store.Reminder) (*store.Reminder, error) {
	nowSec := time.Now().Unix()
	weekdays, _ := json.Marshal(value.RecurrenceWeekdays)
	tags, _ := json.Marshal(value.Tags)
	id, err := a.insertID(ctx, `
		INSERT INTO reminder (
			uid, creator_id, list_id, memo_id, created_ts, updated_ts, row_status, title,
			due_date, remind_ts, time_zone, advance_notice_seconds, recurrence_type,
			recurrence_interval, recurrence_weekdays, recurrence_end_date, recurrence_max_occurrences,
			completed_occurrences, flagged, priority, tags, location_placeholder, location_latitude,
			location_longitude, location_radius_meters, location_trigger, status, completed_ts,
			sort_order, early_notified_ts, notified_ts
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		value.UID, value.CreatorID, value.ListID, value.MemoID, nowSec, nowSec, store.Normal, value.Title,
		value.DueDate, value.RemindTs, value.TimeZone, value.AdvanceNoticeSeconds, value.RecurrenceType,
		value.RecurrenceInterval, string(weekdays), value.RecurrenceEndDate, value.RecurrenceMaxOccurrences,
		value.CompletedOccurrences, value.Flagged, value.Priority, string(tags), value.LocationPlaceholder, value.LocationLatitude,
		value.LocationLongitude, value.LocationRadiusMeters, value.LocationTrigger, store.ReminderPending, value.CompletedTs,
		value.SortOrder, value.EarlyNotifiedTs, value.NotifiedTs)
	if err != nil {
		return nil, err
	}
	return a.getReminder(ctx, id, value.CreatorID)
}

func (a Adapter) ListReminders(ctx context.Context, find *store.FindReminder) ([]*store.Reminder, error) {
	where, args := []string{"1 = 1"}, []any{}
	if find.ID != nil {
		where, args = append(where, "id = ?"), append(args, *find.ID)
	}
	if find.UID != nil {
		where, args = append(where, "uid = ?"), append(args, *find.UID)
	}
	if find.CreatorID != nil {
		where, args = append(where, "creator_id = ?"), append(args, *find.CreatorID)
	}
	if find.ListID != nil {
		where, args = append(where, "list_id = ?"), append(args, *find.ListID)
	}
	if find.MemoID != nil {
		where, args = append(where, "memo_id = ?"), append(args, *find.MemoID)
	}
	if find.RowStatus != nil {
		where, args = append(where, "row_status = ?"), append(args, *find.RowStatus)
	}
	if find.Status != nil {
		where, args = append(where, "status = ?"), append(args, *find.Status)
	}
	if find.Flagged != nil {
		where, args = append(where, "flagged = ?"), append(args, *find.Flagged)
	}
	if find.DueBefore != nil {
		where, args = append(where, "due_date != '' AND due_date <= ?"), append(args, *find.DueBefore)
	}
	if find.DueSet != nil {
		if *find.DueSet {
			where = append(where, "due_date != ''")
		} else {
			where = append(where, "due_date = ''")
		}
	}
	if find.Query != nil && strings.TrimSpace(*find.Query) != "" {
		where, args = append(where, "LOWER(title) LIKE ?"), append(args, "%"+strings.ToLower(strings.TrimSpace(*find.Query))+"%")
	}
	rows, err := a.DB.QueryContext(ctx, a.bind(reminderSelect+" WHERE "+strings.Join(where, " AND ")+`
		ORDER BY CASE WHEN due_date = '' THEN 1 ELSE 0 END, due_date ASC, COALESCE(remind_ts, 0) ASC, sort_order ASC, id ASC`), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := []*store.Reminder{}
	for rows.Next() {
		value, err := scanReminder(rows)
		if err != nil {
			return nil, err
		}
		values = append(values, value)
	}
	return values, rows.Err()
}

func (a Adapter) UpdateReminder(ctx context.Context, update *store.UpdateReminder) (*store.Reminder, error) {
	set, args := []string{"updated_ts = ?"}, []any{time.Now().Unix()}
	add := func(column string, value any) { set, args = append(set, column+" = ?"), append(args, value) }
	if update.ListID != nil {
		add("list_id", *update.ListID)
	}
	if update.MemoID != nil {
		add("memo_id", *update.MemoID)
	}
	if update.RowStatus != nil {
		add("row_status", *update.RowStatus)
	}
	if update.Title != nil {
		add("title", *update.Title)
	}
	if update.DueDate != nil {
		add("due_date", *update.DueDate)
	}
	if update.RemindTs != nil {
		add("remind_ts", *update.RemindTs)
	}
	if update.TimeZone != nil {
		add("time_zone", *update.TimeZone)
	}
	if update.AdvanceNoticeSeconds != nil {
		add("advance_notice_seconds", *update.AdvanceNoticeSeconds)
	}
	if update.RecurrenceType != nil {
		add("recurrence_type", *update.RecurrenceType)
	}
	if update.RecurrenceInterval != nil {
		add("recurrence_interval", *update.RecurrenceInterval)
	}
	if update.RecurrenceWeekdays != nil {
		encoded, _ := json.Marshal(*update.RecurrenceWeekdays)
		add("recurrence_weekdays", string(encoded))
	}
	if update.RecurrenceEndDate != nil {
		add("recurrence_end_date", *update.RecurrenceEndDate)
	}
	if update.RecurrenceMaxOccurrences != nil {
		add("recurrence_max_occurrences", *update.RecurrenceMaxOccurrences)
	}
	if update.CompletedOccurrences != nil {
		add("completed_occurrences", *update.CompletedOccurrences)
	}
	if update.Flagged != nil {
		add("flagged", *update.Flagged)
	}
	if update.Priority != nil {
		add("priority", *update.Priority)
	}
	if update.Tags != nil {
		encoded, _ := json.Marshal(*update.Tags)
		add("tags", string(encoded))
	}
	if update.LocationPlaceholder != nil {
		add("location_placeholder", *update.LocationPlaceholder)
	}
	if update.LocationLatitude != nil {
		add("location_latitude", *update.LocationLatitude)
	}
	if update.LocationLongitude != nil {
		add("location_longitude", *update.LocationLongitude)
	}
	if update.LocationRadiusMeters != nil {
		add("location_radius_meters", *update.LocationRadiusMeters)
	}
	if update.LocationTrigger != nil {
		add("location_trigger", *update.LocationTrigger)
	}
	if update.Status != nil {
		add("status", *update.Status)
	}
	if update.CompletedTs != nil {
		add("completed_ts", *update.CompletedTs)
	}
	if update.SortOrder != nil {
		add("sort_order", *update.SortOrder)
	}
	if update.EarlyNotifiedTs != nil {
		add("early_notified_ts", *update.EarlyNotifiedTs)
	}
	if update.NotifiedTs != nil {
		add("notified_ts", *update.NotifiedTs)
	}
	args = append(args, update.ID, update.CreatorID)
	if _, err := a.DB.ExecContext(ctx, a.bind("UPDATE reminder SET "+strings.Join(set, ", ")+" WHERE id = ? AND creator_id = ?"), args...); err != nil {
		return nil, err
	}
	return a.getReminder(ctx, update.ID, update.CreatorID)
}

func (a Adapter) DeleteReminder(ctx context.Context, value *store.DeleteReminder) error {
	_, err := a.DB.ExecContext(ctx, a.bind("DELETE FROM reminder WHERE id = ? AND creator_id = ?"), value.ID, value.CreatorID)
	return err
}

func (a Adapter) getReminder(ctx context.Context, id, creatorID int32) (*store.Reminder, error) {
	return scanReminder(a.DB.QueryRowContext(ctx, a.bind(reminderSelect+" WHERE id = ? AND creator_id = ?"), id, creatorID))
}

const reminderSelect = `SELECT id, uid, creator_id, list_id, memo_id, created_ts, updated_ts, row_status,
	title, due_date, remind_ts, time_zone, advance_notice_seconds, recurrence_type,
	recurrence_interval, recurrence_weekdays, recurrence_end_date, recurrence_max_occurrences,
	completed_occurrences, flagged, priority, tags, location_placeholder, location_latitude,
	location_longitude, location_radius_meters, location_trigger, status, completed_ts, sort_order,
	early_notified_ts, notified_ts FROM reminder`

func scanReminder(row scanner) (*store.Reminder, error) {
	value := &store.Reminder{}
	var memoID, remindTs, completedTs, earlyNotifiedTs, notifiedTs sql.NullInt64
	var weekdays, tags string
	err := row.Scan(&value.ID, &value.UID, &value.CreatorID, &value.ListID, &memoID,
		&value.CreatedTs, &value.UpdatedTs, &value.RowStatus, &value.Title, &value.DueDate,
		&remindTs, &value.TimeZone, &value.AdvanceNoticeSeconds, &value.RecurrenceType,
		&value.RecurrenceInterval, &weekdays, &value.RecurrenceEndDate, &value.RecurrenceMaxOccurrences,
		&value.CompletedOccurrences, &value.Flagged, &value.Priority, &tags, &value.LocationPlaceholder,
		&value.LocationLatitude, &value.LocationLongitude, &value.LocationRadiusMeters, &value.LocationTrigger,
		&value.Status, &completedTs, &value.SortOrder, &earlyNotifiedTs, &notifiedTs)
	if err != nil {
		return nil, err
	}
	if memoID.Valid {
		id := int32(memoID.Int64)
		value.MemoID = &id
	}
	if remindTs.Valid {
		ts := remindTs.Int64
		value.RemindTs = &ts
	}
	if completedTs.Valid {
		ts := completedTs.Int64
		value.CompletedTs = &ts
	}
	if earlyNotifiedTs.Valid {
		ts := earlyNotifiedTs.Int64
		value.EarlyNotifiedTs = &ts
	}
	if notifiedTs.Valid {
		ts := notifiedTs.Int64
		value.NotifiedTs = &ts
	}
	_ = json.Unmarshal([]byte(weekdays), &value.RecurrenceWeekdays)
	_ = json.Unmarshal([]byte(tags), &value.Tags)
	return value, nil
}

func (a Adapter) CreateOccurrence(ctx context.Context, value *store.ReminderOccurrence) (*store.ReminderOccurrence, error) {
	nowSec := time.Now().Unix()
	id, err := a.insertID(ctx, `INSERT INTO reminder_occurrence
		(uid, creator_id, reminder_uid, list_uid, list_name, title, created_ts, scheduled_date, remind_ts, completed_ts, status)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, value.UID, value.CreatorID, value.ReminderUID, value.ListUID, value.ListName,
		value.Title, nowSec, value.ScheduledDate, value.RemindTs, value.CompletedTs, value.Status)
	if err != nil {
		return nil, err
	}
	value.ID, value.CreatedTs = id, nowSec
	return value, nil
}

func (a Adapter) ListOccurrences(ctx context.Context, find *store.FindReminderOccurrence) ([]*store.ReminderOccurrence, error) {
	where, args := []string{"1 = 1"}, []any{}
	if find.CreatorID != nil {
		where, args = append(where, "creator_id = ?"), append(args, *find.CreatorID)
	}
	if find.CompletedAfter != nil {
		where, args = append(where, "completed_ts >= ?"), append(args, *find.CompletedAfter)
	}
	if find.CompletedBefore != nil {
		where, args = append(where, "completed_ts < ?"), append(args, *find.CompletedBefore)
	}
	rows, err := a.DB.QueryContext(ctx, a.bind(`
		SELECT id, uid, creator_id, reminder_uid, list_uid, list_name, title, created_ts,
			scheduled_date, remind_ts, completed_ts, status
		FROM reminder_occurrence WHERE `+strings.Join(where, " AND ")+` ORDER BY completed_ts DESC, id DESC`), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := []*store.ReminderOccurrence{}
	for rows.Next() {
		value := &store.ReminderOccurrence{}
		var remindTs sql.NullInt64
		if err := rows.Scan(&value.ID, &value.UID, &value.CreatorID, &value.ReminderUID, &value.ListUID, &value.ListName,
			&value.Title, &value.CreatedTs, &value.ScheduledDate, &remindTs, &value.CompletedTs, &value.Status); err != nil {
			return nil, err
		}
		if remindTs.Valid {
			ts := remindTs.Int64
			value.RemindTs = &ts
		}
		values = append(values, value)
	}
	return values, rows.Err()
}

func (a Adapter) ListDueNotifications(ctx context.Context, now int64) ([]*store.ReminderNotification, error) {
	rows, err := a.DB.QueryContext(ctx, a.bind(reminderSelect+` WHERE row_status = ? AND status = ? AND remind_ts IS NOT NULL
		AND ((advance_notice_seconds > 0 AND early_notified_ts IS NULL AND remind_ts - advance_notice_seconds <= ? AND ? < remind_ts)
		OR (notified_ts IS NULL AND remind_ts <= ?)) ORDER BY remind_ts ASC LIMIT 100`), store.Normal, store.ReminderPending, now, now, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []*store.ReminderNotification{}
	for rows.Next() {
		value, err := scanReminder(rows)
		if err != nil {
			return nil, err
		}
		if value.RemindTs == nil {
			continue
		}
		if value.AdvanceNoticeSeconds > 0 && value.EarlyNotifiedTs == nil && *value.RemindTs-value.AdvanceNoticeSeconds <= now && now < *value.RemindTs {
			result = append(result, &store.ReminderNotification{Reminder: value, Early: true})
		}
		if value.NotifiedTs == nil && *value.RemindTs <= now {
			result = append(result, &store.ReminderNotification{Reminder: value})
		}
	}
	return result, rows.Err()
}

func (a Adapter) MarkNotificationDelivered(ctx context.Context, reminderID int32, early bool, deliveredTs int64) error {
	column := "notified_ts"
	if early {
		column = "early_notified_ts"
	}
	_, err := a.DB.ExecContext(ctx, a.bind("UPDATE reminder SET "+column+" = ?, updated_ts = ? WHERE id = ? AND "+column+" IS NULL"), deliveredTs, deliveredTs, reminderID)
	return err
}
