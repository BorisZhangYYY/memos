// Package reminderhistory materializes immutable outcomes for reminder periods.
package reminderhistory

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/pkg/errors"

	"github.com/usememos/memos/store"
)

// MaterializeSkipped records every recurring period displaced by a newer one.
// The newest period remains pending and can still become an on-time or late completion.
func MaterializeSkipped(ctx context.Context, storage *store.Store, now time.Time) error {
	pending, normal := store.ReminderPending, store.Normal
	reminders, err := storage.ListReminders(ctx, &store.FindReminder{RowStatus: &normal, Status: &pending})
	if err != nil {
		return errors.Wrap(err, "list pending reminders")
	}
	for _, reminder := range reminders {
		if reminder.RecurrenceType == store.ReminderRecurrenceNone || reminder.DueDate == "" {
			continue
		}
		location, locationErr := time.LoadLocation(reminder.TimeZone)
		if locationErr != nil {
			location = time.UTC
		}
		dates, err := datesThrough(reminder, now.In(location).Format(time.DateOnly))
		if err != nil || len(dates) < 2 {
			continue
		}
		lists, err := storage.ListReminderLists(ctx, &store.FindReminderList{ID: &reminder.ListID, CreatorID: &reminder.CreatorID})
		if err != nil || len(lists) == 0 {
			continue
		}
		memoUID := ""
		if reminder.MemoID != nil {
			memo, memoErr := storage.GetMemo(ctx, &store.FindMemo{ID: reminder.MemoID})
			if memoErr == nil && memo != nil {
				memoUID = memo.UID
			}
		}
		existing, err := storage.ListReminderOccurrences(ctx, &store.FindReminderOccurrence{
			CreatorID: &reminder.CreatorID, ReminderUID: &reminder.UID,
		})
		if err != nil {
			return errors.Wrap(err, "list reminder occurrences")
		}
		seen := map[string]struct{}{}
		for _, occurrence := range existing {
			seen[occurrence.ScheduledDate] = struct{}{}
		}
		for _, scheduledDate := range dates[:len(dates)-1] {
			if _, ok := seen[scheduledDate]; ok {
				continue
			}
			if _, err := storage.CreateReminderOccurrence(ctx, &store.ReminderOccurrence{
				UID: uuid.NewString(), CreatorID: reminder.CreatorID, ReminderUID: reminder.UID, ListUID: lists[0].UID,
				ListName: lists[0].Name, Title: reminder.Title, MemoUID: memoUID, ScheduledDate: scheduledDate,
				RemindTs: shiftedTime(reminder, scheduledDate), ResolvedTs: now.Unix(), Status: store.ReminderOccurrenceSkipped,
			}); err != nil {
				concurrent, listErr := storage.ListReminderOccurrences(ctx, &store.FindReminderOccurrence{
					CreatorID: &reminder.CreatorID, ReminderUID: &reminder.UID,
				})
				if listErr != nil {
					return errors.Wrap(err, "create skipped reminder occurrence")
				}
				found := false
				for _, occurrence := range concurrent {
					found = found || occurrence.ScheduledDate == scheduledDate
				}
				if !found {
					return errors.Wrap(err, "create skipped reminder occurrence")
				}
			}
			seen[scheduledDate] = struct{}{}
		}
	}
	return nil
}

func datesThrough(value *store.Reminder, throughDate string) ([]string, error) {
	current := *value
	dates := []string{}
	for current.DueDate != "" && current.DueDate <= throughDate {
		if value.RecurrenceEndDate != "" && current.DueDate > value.RecurrenceEndDate {
			break
		}
		dates = append(dates, current.DueDate)
		next, err := nextDate(&current)
		if err != nil || next <= current.DueDate {
			return dates, err
		}
		current.DueDate = next
	}
	return dates, nil
}

func nextDate(value *store.Reminder) (string, error) {
	current, err := time.Parse(time.DateOnly, value.DueDate)
	if err != nil {
		return "", err
	}
	interval := int(value.RecurrenceInterval)
	if interval <= 0 {
		interval = 1
	}
	switch value.RecurrenceType {
	case store.ReminderRecurrenceDaily:
		current = current.AddDate(0, 0, interval)
	case store.ReminderRecurrenceWeekly:
		if len(value.RecurrenceWeekdays) == 0 {
			current = current.AddDate(0, 0, 7*interval)
			break
		}
		allowed := map[time.Weekday]bool{}
		for _, weekday := range value.RecurrenceWeekdays {
			if weekday >= 0 && weekday <= 6 {
				allowed[time.Weekday(weekday)] = true
			}
		}
		for day := 1; day < 7; day++ {
			candidate := current.AddDate(0, 0, day)
			if candidate.Weekday() > current.Weekday() && allowed[candidate.Weekday()] {
				return candidate.Format(time.DateOnly), nil
			}
		}
		weekStart := current.AddDate(0, 0, -int(current.Weekday()))
		for weekday := time.Sunday; weekday <= time.Saturday; weekday++ {
			if allowed[weekday] {
				current = weekStart.AddDate(0, 0, 7*interval+int(weekday))
				break
			}
		}
	case store.ReminderRecurrenceMonthly:
		current = addMonthsClamped(current, interval)
	case store.ReminderRecurrenceYearly:
		current = addYearsClamped(current, interval)
	default:
		return "", errors.New("reminder does not repeat")
	}
	return current.Format(time.DateOnly), nil
}

func shiftedTime(value *store.Reminder, dateValue string) *int64 {
	if value.RemindTs == nil {
		return nil
	}
	location, err := time.LoadLocation(value.TimeZone)
	if err != nil {
		location = time.UTC
	}
	old := time.Unix(*value.RemindTs, 0).In(location)
	date, err := time.Parse(time.DateOnly, dateValue)
	if err != nil {
		return nil
	}
	result := time.Date(date.Year(), date.Month(), date.Day(), old.Hour(), old.Minute(), old.Second(), 0, location).Unix()
	return &result
}

func addMonthsClamped(value time.Time, months int) time.Time {
	target := time.Date(value.Year(), value.Month()+time.Month(months), 1, 0, 0, 0, 0, time.UTC)
	day := min(value.Day(), target.AddDate(0, 1, -1).Day())
	return time.Date(target.Year(), target.Month(), day, 0, 0, 0, 0, time.UTC)
}

func addYearsClamped(value time.Time, years int) time.Time {
	targetYear, day := value.Year()+years, value.Day()
	lastFebruaryDay := time.Date(targetYear, time.March, 1, 0, 0, 0, 0, time.UTC).AddDate(0, 0, -1).Day()
	if value.Month() == time.February && day == 29 && lastFebruaryDay != 29 {
		day = 28
	}
	return time.Date(targetYear, value.Month(), day, 0, 0, 0, 0, time.UTC)
}
