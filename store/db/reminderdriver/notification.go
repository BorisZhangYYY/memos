package reminderdriver

import (
	"time"

	"github.com/usememos/memos/store"
)

func notificationForReminder(value *store.Reminder, now int64) *store.ReminderNotification {
	if value == nil || value.RemindTs == nil {
		return nil
	}
	if value.RecurrenceType == store.ReminderRecurrenceNone {
		return oneTimeNotification(value, now)
	}
	return recurringNotification(value, now)
}

func oneTimeNotification(value *store.Reminder, now int64) *store.ReminderNotification {
	remindTs := *value.RemindTs
	if remindTs <= now && value.NotifiedTs == nil {
		return &store.ReminderNotification{Reminder: value, RemindTs: remindTs}
	}
	if value.AdvanceNoticeSeconds > 0 && value.EarlyNotifiedTs == nil && remindTs-value.AdvanceNoticeSeconds <= now && now < remindTs {
		return &store.ReminderNotification{Reminder: value, RemindTs: remindTs, Early: true}
	}
	return nil
}

// recurringNotification only considers a due occurrence on the user's current
// calendar date. This deliberately drops missed occurrences instead of sending
// stale notifications after the date has passed.
func recurringNotification(value *store.Reminder, now int64) *store.ReminderNotification {
	location, err := time.LoadLocation(value.TimeZone)
	if err != nil {
		location = time.UTC
	}
	nowTime := time.Unix(now, 0)
	localNow := nowTime.In(location)
	today := localCalendarDate(localNow, location)

	if remindTs, ok := recurringRemindTimeOnDate(value, today, location); ok && remindTs <= now && notificationMarkerBefore(value.NotifiedTs, remindTs) {
		return &store.ReminderNotification{Reminder: value, RemindTs: remindTs}
	}
	if value.AdvanceNoticeSeconds <= 0 {
		return nil
	}

	// Early-notification windows may cross midnight, so inspect every local date
	// reachable within the configured advance interval.
	lastLocalDate := localCalendarDate(time.Unix(now+value.AdvanceNoticeSeconds, 0).In(location), location)
	for date := today; !date.After(lastLocalDate); date = date.AddDate(0, 0, 1) {
		remindTs, ok := recurringRemindTimeOnDate(value, date, location)
		if !ok || remindTs <= now || remindTs-value.AdvanceNoticeSeconds > now {
			continue
		}
		if notificationMarkerBefore(value.EarlyNotifiedTs, remindTs) {
			return &store.ReminderNotification{Reminder: value, RemindTs: remindTs, Early: true}
		}
	}
	return nil
}

func notificationMarkerBefore(marker *int64, remindTs int64) bool {
	return marker == nil || *marker < remindTs
}

func recurringRemindTimeOnDate(value *store.Reminder, target time.Time, location *time.Location) (int64, bool) {
	base, err := time.ParseInLocation(time.DateOnly, value.DueDate, location)
	if err != nil || target.Before(base) {
		return 0, false
	}
	targetDate := target.Format(time.DateOnly)
	if value.RecurrenceEndDate != "" && targetDate > value.RecurrenceEndDate {
		return 0, false
	}

	interval := int(value.RecurrenceInterval)
	if interval <= 0 {
		interval = 1
	}
	sequence, matches := recurrenceSequenceOnDate(value, base, target, interval)
	if !matches {
		return 0, false
	}
	if value.RecurrenceMaxOccurrences > 0 && int64(value.CompletedOccurrences)+sequence > int64(value.RecurrenceMaxOccurrences) {
		return 0, false
	}

	baseRemindTime := time.Unix(*value.RemindTs, 0).In(location)
	return time.Date(
		target.Year(), target.Month(), target.Day(),
		baseRemindTime.Hour(), baseRemindTime.Minute(), baseRemindTime.Second(), 0, location,
	).Unix(), true
}

func recurrenceSequenceOnDate(value *store.Reminder, base, target time.Time, interval int) (int64, bool) {
	switch value.RecurrenceType {
	case store.ReminderRecurrenceDaily:
		days := calendarDaysBetween(base, target)
		if days%interval != 0 {
			return 0, false
		}
		return int64(days/interval + 1), true
	case store.ReminderRecurrenceWeekly:
		return weeklySequenceOnDate(value, base, target, interval)
	case store.ReminderRecurrenceMonthly:
		months := (target.Year()-base.Year())*12 + int(target.Month()-base.Month())
		if months < 0 || months%interval != 0 {
			return 0, false
		}
		candidate := base
		steps := months / interval
		for range steps {
			candidate = addMonthsClampedForNotification(candidate, interval)
		}
		if !sameCalendarDate(candidate, target) {
			return 0, false
		}
		return int64(steps + 1), true
	case store.ReminderRecurrenceYearly:
		years := target.Year() - base.Year()
		if years < 0 || years%interval != 0 {
			return 0, false
		}
		candidate := base
		steps := years / interval
		for range steps {
			candidate = addYearsClampedForNotification(candidate, interval)
		}
		if !sameCalendarDate(candidate, target) {
			return 0, false
		}
		return int64(steps + 1), true
	default:
		return 0, false
	}
}

func weeklySequenceOnDate(value *store.Reminder, base, target time.Time, interval int) (int64, bool) {
	days := calendarDaysBetween(base, target)
	if len(value.RecurrenceWeekdays) == 0 {
		period := 7 * interval
		if days%period != 0 {
			return 0, false
		}
		return int64(days/period + 1), true
	}
	if sameCalendarDate(base, target) {
		return 1, true
	}

	allowed := map[time.Weekday]bool{}
	for _, weekday := range value.RecurrenceWeekdays {
		if weekday >= 0 && weekday <= 6 {
			allowed[time.Weekday(weekday)] = true
		}
	}
	if !allowed[target.Weekday()] {
		return 0, false
	}
	baseWeek := base.AddDate(0, 0, -int(base.Weekday()))
	targetWeek := target.AddDate(0, 0, -int(target.Weekday()))
	weeks := calendarDaysBetween(baseWeek, targetWeek) / 7
	if weeks < 0 || weeks%interval != 0 {
		return 0, false
	}

	sequence := int64(1)
	for week := 0; week <= weeks; week += interval {
		weekStart := baseWeek.AddDate(0, 0, week*7)
		for weekday := time.Sunday; weekday <= time.Saturday; weekday++ {
			if !allowed[weekday] {
				continue
			}
			candidate := weekStart.AddDate(0, 0, int(weekday))
			if candidate.After(base) && !candidate.After(target) {
				sequence++
			}
		}
	}
	return sequence, true
}

func localCalendarDate(value time.Time, location *time.Location) time.Time {
	return time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, location)
}

func calendarDaysBetween(start, end time.Time) int {
	startUTC := time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.UTC)
	endUTC := time.Date(end.Year(), end.Month(), end.Day(), 0, 0, 0, 0, time.UTC)
	return int(endUTC.Sub(startUTC) / (24 * time.Hour))
}

func sameCalendarDate(left, right time.Time) bool {
	return left.Year() == right.Year() && left.Month() == right.Month() && left.Day() == right.Day()
}

func addMonthsClampedForNotification(value time.Time, months int) time.Time {
	target := time.Date(value.Year(), value.Month()+time.Month(months), 1, 0, 0, 0, 0, value.Location())
	lastDay := target.AddDate(0, 1, -1).Day()
	day := value.Day()
	if day > lastDay {
		day = lastDay
	}
	return time.Date(target.Year(), target.Month(), day, 0, 0, 0, 0, value.Location())
}

func addYearsClampedForNotification(value time.Time, years int) time.Time {
	targetYear := value.Year() + years
	day := value.Day()
	lastFebruaryDay := time.Date(targetYear, time.March, 1, 0, 0, 0, 0, value.Location()).AddDate(0, 0, -1).Day()
	if value.Month() == time.February && day == 29 && lastFebruaryDay != 29 {
		day = 28
	}
	return time.Date(targetYear, value.Month(), day, 0, 0, 0, 0, value.Location())
}
