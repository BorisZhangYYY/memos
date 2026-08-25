package mysql

import (
	"context"

	"github.com/usememos/memos/store"
	"github.com/usememos/memos/store/db/reminderdriver"
)

func (d *DB) reminder() reminderdriver.Adapter {
	return reminderdriver.Adapter{DB: d.db, Dialect: "mysql"}
}
func (d *DB) CreateReminderList(ctx context.Context, v *store.ReminderList) (*store.ReminderList, error) {
	return d.reminder().CreateList(ctx, v)
}
func (d *DB) ListReminderLists(ctx context.Context, v *store.FindReminderList) ([]*store.ReminderList, error) {
	return d.reminder().ListLists(ctx, v)
}
func (d *DB) UpdateReminderList(ctx context.Context, v *store.UpdateReminderList) (*store.ReminderList, error) {
	return d.reminder().UpdateList(ctx, v)
}
func (d *DB) CreateReminder(ctx context.Context, v *store.Reminder) (*store.Reminder, error) {
	return d.reminder().CreateReminder(ctx, v)
}
func (d *DB) ListReminders(ctx context.Context, v *store.FindReminder) ([]*store.Reminder, error) {
	return d.reminder().ListReminders(ctx, v)
}
func (d *DB) UpdateReminder(ctx context.Context, v *store.UpdateReminder) (*store.Reminder, error) {
	return d.reminder().UpdateReminder(ctx, v)
}
func (d *DB) DeleteReminder(ctx context.Context, v *store.DeleteReminder) error {
	return d.reminder().DeleteReminder(ctx, v)
}
func (d *DB) CreateReminderOccurrence(ctx context.Context, v *store.ReminderOccurrence) (*store.ReminderOccurrence, error) {
	return d.reminder().CreateOccurrence(ctx, v)
}
func (d *DB) ListReminderOccurrences(ctx context.Context, v *store.FindReminderOccurrence) ([]*store.ReminderOccurrence, error) {
	return d.reminder().ListOccurrences(ctx, v)
}
func (d *DB) ListDueReminderNotifications(ctx context.Context, now int64) ([]*store.ReminderNotification, error) {
	return d.reminder().ListDueNotifications(ctx, now)
}
func (d *DB) MarkReminderNotificationDelivered(ctx context.Context, id int32, early bool, remindTs, deliveredTs int64) error {
	return d.reminder().MarkNotificationDelivered(ctx, id, early, remindTs, deliveredTs)
}
