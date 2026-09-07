package v1

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

func TestReminderServiceLifecycleAndIsolation(t *testing.T) {
	ctx := context.Background()
	service := newIntegrationService(t)
	alice, err := service.Store.CreateUser(ctx, &store.User{Username: "reminder-alice", Role: store.RoleUser})
	require.NoError(t, err)
	bob, err := service.Store.CreateUser(ctx, &store.User{Username: "reminder-bob", Role: store.RoleUser})
	require.NoError(t, err)
	aliceCtx, bobCtx := userCtx(ctx, alice.ID), userCtx(ctx, bob.ID)

	// Each user gets a private default list even though both lists use the stable "default" UID.
	aliceLists, err := service.ListReminderLists(aliceCtx, &v1pb.ListReminderListsRequest{Parent: "users/reminder-alice"})
	require.NoError(t, err)
	require.Len(t, aliceLists.ReminderLists, 1)
	bobLists, err := service.ListReminderLists(bobCtx, &v1pb.ListReminderListsRequest{Parent: "users/reminder-bob"})
	require.NoError(t, err)
	require.Len(t, bobLists.ReminderLists, 1)
	require.NotEqual(t, aliceLists.ReminderLists[0].Name, bobLists.ReminderLists[0].Name)

	location, err := time.LoadLocation("Asia/Shanghai")
	require.NoError(t, err)
	today := time.Now().In(location)
	remindAt := time.Date(today.Year(), today.Month(), today.Day(), 20, 0, 0, 0, location).AddDate(0, 0, -14)
	repeating, err := service.CreateReminder(aliceCtx, &v1pb.CreateReminderRequest{
		Parent: "users/reminder-alice",
		Reminder: &v1pb.Reminder{
			Title: "Weekly report", ReminderList: aliceLists.ReminderLists[0].Name,
			DueDate: remindAt.Format(time.DateOnly), RemindTime: timestamppb.New(remindAt), TimeZone: "Asia/Shanghai",
			AdvanceNoticeSeconds: 900,
			Recurrence:           &v1pb.ReminderRecurrence{Frequency: v1pb.ReminderRecurrence_WEEKLY, Interval: 1, Weekdays: []int32{int32(today.Weekday())}},
		},
	})
	require.NoError(t, err)
	require.Equal(t, remindAt.Format(time.DateOnly), repeating.DueDate)
	require.Equal(t, int64(900), repeating.AdvanceNoticeSeconds)

	// A user cannot use another user's parent to read reminders.
	_, err = service.ListReminders(bobCtx, &v1pb.ListRemindersRequest{Parent: "users/reminder-alice"})
	require.Equal(t, codes.PermissionDenied, status.Code(err))

	advanced, err := service.CompleteReminder(aliceCtx, &v1pb.CompleteReminderRequest{Name: repeating.Name})
	require.NoError(t, err)
	require.Equal(t, v1pb.Reminder_PENDING, advanced.Status)
	require.Equal(t, today.AddDate(0, 0, 7).Format(time.DateOnly), advanced.DueDate)
	require.Equal(t, int32(1), advanced.CompletedOccurrences)
	require.Equal(t, 20, advanced.RemindTime.AsTime().In(location).Hour())

	oneTime, err := service.CreateReminder(aliceCtx, &v1pb.CreateReminderRequest{
		Parent: "users/reminder-alice", Reminder: &v1pb.Reminder{Title: "One time", ReminderList: aliceLists.ReminderLists[0].Name},
	})
	require.NoError(t, err)
	require.Nil(t, oneTime.Recurrence)
	require.Nil(t, oneTime.Location)
	_, err = service.CompleteReminder(aliceCtx, &v1pb.CompleteReminderRequest{Name: oneTime.Name})
	require.NoError(t, err)

	// Like a Memo, a reminder may be deleted directly without first being archived.
	directDelete, err := service.CreateReminder(aliceCtx, &v1pb.CreateReminderRequest{
		Parent: "users/reminder-alice", Reminder: &v1pb.Reminder{Title: "Delete directly", ReminderList: aliceLists.ReminderLists[0].Name},
	})
	require.NoError(t, err)
	_, err = service.DeleteReminder(aliceCtx, &v1pb.DeleteReminderRequest{Name: directDelete.Name})
	require.NoError(t, err)

	cleared, err := service.ClearCompletedReminders(aliceCtx, &v1pb.ClearCompletedRemindersRequest{Parent: "users/reminder-alice"})
	require.NoError(t, err)
	require.Equal(t, int32(1), cleared.ClearedCount)
	uid := oneTime.Name[len("users/reminder-alice/reminders/"):]
	stored, err := service.Store.ListReminders(ctx, &store.FindReminder{UID: &uid, CreatorID: &alice.ID})
	require.NoError(t, err)
	require.Len(t, stored, 1)
	require.Equal(t, store.Archived, stored[0].RowStatus)

	archived, err := service.ListReminders(aliceCtx, &v1pb.ListRemindersRequest{Parent: "users/reminder-alice", State: v1pb.State_ARCHIVED})
	require.NoError(t, err)
	require.Len(t, archived.Reminders, 1)
	require.Equal(t, oneTime.Name, archived.Reminders[0].Name)

	_, err = service.DeleteReminder(aliceCtx, &v1pb.DeleteReminderRequest{Name: oneTime.Name})
	require.NoError(t, err)
	stored, err = service.Store.ListReminders(ctx, &store.FindReminder{UID: &uid, CreatorID: &alice.ID})
	require.NoError(t, err)
	require.Empty(t, stored)

	// Permanent deletion removes the reminder while its immutable completion fact
	// remains available for future daily and weekly report aggregation.
	occurrences, err := service.Store.ListReminderOccurrences(ctx, &store.FindReminderOccurrence{CreatorID: &alice.ID, ReminderUID: &uid})
	require.NoError(t, err)
	require.Len(t, occurrences, 1)
	require.Equal(t, "One time", occurrences[0].Title)
	require.Equal(t, "default", occurrences[0].ListUID)
	require.Equal(t, uid, occurrences[0].ReminderUID)
}

func TestReminderAdvanceNoticeRequiresExactTime(t *testing.T) {
	ctx := context.Background()
	service := newIntegrationService(t)
	user, err := service.Store.CreateUser(ctx, &store.User{Username: "reminder-validation", Role: store.RoleUser})
	require.NoError(t, err)

	_, err = service.CreateReminder(userCtx(ctx, user.ID), &v1pb.CreateReminderRequest{
		Parent:   "users/reminder-validation",
		Reminder: &v1pb.Reminder{Title: "Date only", DueDate: "2026-08-11", TimeZone: "Asia/Shanghai", AdvanceNoticeSeconds: 300},
	})
	require.Equal(t, codes.InvalidArgument, status.Code(err))
}

func TestCompletingBacklogAdvancesPastToday(t *testing.T) {
	ctx := context.Background()
	service := newIntegrationService(t)
	user, err := service.Store.CreateUser(ctx, &store.User{Username: "reminder-notification-marker", Role: store.RoleUser})
	require.NoError(t, err)
	userContext := userCtx(ctx, user.ID)
	lists, err := service.ListReminderLists(userContext, &v1pb.ListReminderListsRequest{Parent: "users/reminder-notification-marker"})
	require.NoError(t, err)

	location, err := time.LoadLocation("Asia/Shanghai")
	require.NoError(t, err)
	today := time.Now().In(location)
	firstOccurrence := time.Date(today.Year(), today.Month(), today.Day(), 21, 0, 0, 0, location).AddDate(0, 0, -2)
	reminder, err := service.CreateReminder(userContext, &v1pb.CreateReminderRequest{
		Parent: "users/reminder-notification-marker",
		Reminder: &v1pb.Reminder{
			Title: "Write journal", ReminderList: lists.ReminderLists[0].Name, DueDate: firstOccurrence.Format(time.DateOnly),
			RemindTime: timestamppb.New(firstOccurrence), TimeZone: "Asia/Shanghai",
			Recurrence: &v1pb.ReminderRecurrence{Frequency: v1pb.ReminderRecurrence_DAILY, Interval: 1},
		},
	})
	require.NoError(t, err)

	uid := reminder.Name[len("users/reminder-notification-marker/reminders/"):]
	stored, err := service.Store.ListReminders(ctx, &store.FindReminder{UID: &uid, CreatorID: &user.ID})
	require.NoError(t, err)
	require.Len(t, stored, 1)
	todayOccurrenceSec := firstOccurrence.AddDate(0, 0, 2).Unix()
	require.NoError(t, service.Store.MarkReminderNotificationDelivered(ctx, stored[0].ID, false, todayOccurrenceSec, todayOccurrenceSec+30))

	_, err = service.CompleteReminder(userContext, &v1pb.CompleteReminderRequest{Name: reminder.Name})
	require.NoError(t, err)
	stored, err = service.Store.ListReminders(ctx, &store.FindReminder{UID: &uid, CreatorID: &user.ID})
	require.NoError(t, err)
	require.Equal(t, today.AddDate(0, 0, 1).Format(time.DateOnly), stored[0].DueDate)
	require.Nil(t, stored[0].NotifiedTs)

	occurrences, err := service.Store.ListReminderOccurrences(ctx, &store.FindReminderOccurrence{CreatorID: &user.ID, ReminderUID: &uid})
	require.NoError(t, err)
	require.Len(t, occurrences, 3)
	require.Equal(t, today.Format(time.DateOnly), occurrences[0].ScheduledDate)
	require.Equal(t, store.ReminderOccurrenceCompletedOnTime, occurrences[0].Status)
	require.Equal(t, store.ReminderOccurrenceSkipped, occurrences[1].Status)
	require.Equal(t, store.ReminderOccurrenceSkipped, occurrences[2].Status)
	require.NotNil(t, occurrences[0].RemindTs)
	require.Equal(t, todayOccurrenceSec, *occurrences[0].RemindTs)

	backfilled, err := service.CreateReminder(userContext, &v1pb.CreateReminderRequest{
		Parent: "users/reminder-notification-marker",
		Reminder: &v1pb.Reminder{
			Title: "Backfilled journal", ReminderList: lists.ReminderLists[0].Name,
			DueDate: firstOccurrence.Format(time.DateOnly), TimeZone: "Asia/Shanghai",
			Recurrence: &v1pb.ReminderRecurrence{Frequency: v1pb.ReminderRecurrence_DAILY, Interval: 1},
		},
	})
	require.NoError(t, err)
	yesterday := today.AddDate(0, 0, -1).Format(time.DateOnly)
	advanced, err := service.CompleteReminder(userContext, &v1pb.CompleteReminderRequest{Name: backfilled.Name, CompletionDate: yesterday})
	require.NoError(t, err)
	require.Equal(t, today.AddDate(0, 0, 1).Format(time.DateOnly), advanced.DueDate)

	backfilledUID := backfilled.Name[len("users/reminder-notification-marker/reminders/"):]
	occurrences, err = service.Store.ListReminderOccurrences(ctx, &store.FindReminderOccurrence{CreatorID: &user.ID, ReminderUID: &backfilledUID})
	require.NoError(t, err)
	require.Len(t, occurrences, 3)
	require.Equal(t, "Backfilled journal", occurrences[0].Title)
	require.Equal(t, today.Format(time.DateOnly), occurrences[0].ScheduledDate)
	require.Equal(t, store.ReminderOccurrenceSkipped, occurrences[0].Status)
	require.Equal(t, yesterday, occurrences[1].ScheduledDate)
	require.Equal(t, store.ReminderOccurrenceCompletedOnTime, occurrences[1].Status)

	_, err = service.CompleteReminder(userContext, &v1pb.CompleteReminderRequest{
		Name: backfilled.Name, CompletionDate: today.AddDate(0, 0, 1).Format(time.DateOnly),
	})
	require.Equal(t, codes.InvalidArgument, status.Code(err))
}

func TestCompletingRecurringReminderBeforeDueDate(t *testing.T) {
	ctx := context.Background()
	service := newIntegrationService(t)
	user, err := service.Store.CreateUser(ctx, &store.User{Username: "reminder-early-completion", Role: store.RoleUser})
	require.NoError(t, err)
	userContext := userCtx(ctx, user.ID)
	lists, err := service.ListReminderLists(userContext, &v1pb.ListReminderListsRequest{Parent: "users/reminder-early-completion"})
	require.NoError(t, err)

	location, err := time.LoadLocation("Asia/Shanghai")
	require.NoError(t, err)
	today := time.Now().In(location)
	dueDate := today.AddDate(0, 0, 1).Format(time.DateOnly)
	reminder, err := service.CreateReminder(userContext, &v1pb.CreateReminderRequest{
		Parent: "users/reminder-early-completion",
		Reminder: &v1pb.Reminder{
			Title: "Tomorrow routine", ReminderList: lists.ReminderLists[0].Name, DueDate: dueDate, TimeZone: "Asia/Shanghai",
			Recurrence: &v1pb.ReminderRecurrence{Frequency: v1pb.ReminderRecurrence_DAILY, Interval: 1},
		},
	})
	require.NoError(t, err)

	advanced, err := service.CompleteReminder(userContext, &v1pb.CompleteReminderRequest{Name: reminder.Name})
	require.NoError(t, err)
	require.Equal(t, v1pb.Reminder_PENDING, advanced.Status)
	require.Equal(t, today.AddDate(0, 0, 2).Format(time.DateOnly), advanced.DueDate)

	listed, err := service.ListReminderOccurrences(userContext, &v1pb.ListReminderOccurrencesRequest{
		Parent: "users/reminder-early-completion",
	})
	require.NoError(t, err)
	require.Len(t, listed.ReminderOccurrences, 1)
	require.Equal(t, dueDate, listed.ReminderOccurrences[0].ScheduledDate)
	require.Equal(t, today.Format(time.DateOnly), listed.ReminderOccurrences[0].CompletionDate)
	require.Equal(t, v1pb.ReminderOccurrence_COMPLETED_ON_TIME, listed.ReminderOccurrences[0].Status)
}

func TestWeeklyLateCompletionAndReminderStats(t *testing.T) {
	ctx := context.Background()
	service := newIntegrationService(t)
	user, err := service.Store.CreateUser(ctx, &store.User{Username: "reminder-weekly-stats", Role: store.RoleUser})
	require.NoError(t, err)
	userContext := userCtx(ctx, user.ID)
	lists, err := service.ListReminderLists(userContext, &v1pb.ListReminderListsRequest{Parent: "users/reminder-weekly-stats"})
	require.NoError(t, err)

	location, err := time.LoadLocation("Asia/Shanghai")
	require.NoError(t, err)
	today := time.Now().In(location)
	scheduled := today.AddDate(0, 0, -6)
	reminder, err := service.CreateReminder(userContext, &v1pb.CreateReminderRequest{
		Parent: "users/reminder-weekly-stats",
		Reminder: &v1pb.Reminder{
			Title: "Weekly review", ReminderList: lists.ReminderLists[0].Name, DueDate: scheduled.Format(time.DateOnly), TimeZone: "Asia/Shanghai",
			Recurrence: &v1pb.ReminderRecurrence{Frequency: v1pb.ReminderRecurrence_WEEKLY, Interval: 1, Weekdays: []int32{int32(scheduled.Weekday())}},
		},
	})
	require.NoError(t, err)
	_, err = service.CompleteReminder(userContext, &v1pb.CompleteReminderRequest{Name: reminder.Name})
	require.NoError(t, err)

	listed, err := service.ListReminderOccurrences(userContext, &v1pb.ListReminderOccurrencesRequest{Parent: "users/reminder-weekly-stats"})
	require.NoError(t, err)
	require.Len(t, listed.ReminderOccurrences, 1)
	require.Equal(t, v1pb.ReminderOccurrence_COMPLETED_LATE, listed.ReminderOccurrences[0].Status)
	require.Equal(t, int32(6), listed.ReminderOccurrences[0].LateDays)

	stats, err := service.GetReminderStats(userContext, &v1pb.GetReminderStatsRequest{Parent: "users/reminder-weekly-stats"})
	require.NoError(t, err)
	require.Equal(t, int32(1), stats.TotalCount)
	require.Equal(t, int32(1), stats.CompletedLateCount)
	require.Equal(t, float64(1), stats.FinalCompletionRate)
}

func TestDeletingReminderKeepsOnlyHistoryWithCompletion(t *testing.T) {
	ctx := context.Background()
	service := newIntegrationService(t)
	user, err := service.Store.CreateUser(ctx, &store.User{Username: "reminder-delete-history", Role: store.RoleUser})
	require.NoError(t, err)
	userContext := userCtx(ctx, user.ID)
	lists, err := service.ListReminderLists(userContext, &v1pb.ListReminderListsRequest{Parent: "users/reminder-delete-history"})
	require.NoError(t, err)
	today := time.Now().Format(time.DateOnly)
	oldDate := time.Now().AddDate(0, 0, -2).Format(time.DateOnly)

	unfinished, err := service.CreateReminder(userContext, &v1pb.CreateReminderRequest{
		Parent: "users/reminder-delete-history", Reminder: &v1pb.Reminder{Title: "Never completed", ReminderList: lists.ReminderLists[0].Name,
			DueDate: oldDate, TimeZone: "UTC", Recurrence: &v1pb.ReminderRecurrence{Frequency: v1pb.ReminderRecurrence_DAILY, Interval: 1}},
	})
	require.NoError(t, err)
	_, err = service.ListReminderOccurrences(userContext, &v1pb.ListReminderOccurrencesRequest{Parent: "users/reminder-delete-history"})
	require.NoError(t, err)
	unfinishedUID := unfinished.Name[len("users/reminder-delete-history/reminders/"):]
	rows, err := service.Store.ListReminderOccurrences(ctx, &store.FindReminderOccurrence{CreatorID: &user.ID, ReminderUID: &unfinishedUID})
	require.NoError(t, err)
	require.Len(t, rows, 2)
	_, err = service.DeleteReminder(userContext, &v1pb.DeleteReminderRequest{Name: unfinished.Name})
	require.NoError(t, err)
	rows, err = service.Store.ListReminderOccurrences(ctx, &store.FindReminderOccurrence{CreatorID: &user.ID, ReminderUID: &unfinishedUID})
	require.NoError(t, err)
	require.Empty(t, rows)

	completed, err := service.CreateReminder(userContext, &v1pb.CreateReminderRequest{
		Parent: "users/reminder-delete-history", Reminder: &v1pb.Reminder{Title: "Keep snapshot", ReminderList: lists.ReminderLists[0].Name,
			DueDate: today, TimeZone: "UTC"},
	})
	require.NoError(t, err)
	_, err = service.CompleteReminder(userContext, &v1pb.CompleteReminderRequest{Name: completed.Name})
	require.NoError(t, err)
	completedUID := completed.Name[len("users/reminder-delete-history/reminders/"):]
	_, err = service.DeleteReminder(userContext, &v1pb.DeleteReminderRequest{Name: completed.Name})
	require.NoError(t, err)
	rows, err = service.Store.ListReminderOccurrences(ctx, &store.FindReminderOccurrence{CreatorID: &user.ID, ReminderUID: &completedUID})
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, "Keep snapshot", rows[0].Title)
	require.Equal(t, store.ReminderOccurrenceCompletedOnTime, rows[0].Status)
}

func TestRecurringCompletionDatesSkipsBacklog(t *testing.T) {
	tests := []struct {
		name           string
		reminder       *store.Reminder
		throughDate    string
		completionDate string
		nextDate       string
	}{
		{
			name: "daily backlog",
			reminder: &store.Reminder{
				DueDate: "2026-08-28", RecurrenceType: store.ReminderRecurrenceDaily, RecurrenceInterval: 1,
			},
			throughDate: "2026-08-30", completionDate: "2026-08-30", nextDate: "2026-08-31",
		},
		{
			name: "interval keeps latest scheduled date",
			reminder: &store.Reminder{
				DueDate: "2026-08-28", RecurrenceType: store.ReminderRecurrenceDaily, RecurrenceInterval: 2,
			},
			throughDate: "2026-08-29", completionDate: "2026-08-28", nextDate: "2026-08-30",
		},
		{
			name: "weekly weekdays and interval",
			reminder: &store.Reminder{
				DueDate: "2026-08-24", RecurrenceType: store.ReminderRecurrenceWeekly, RecurrenceInterval: 2,
				RecurrenceWeekdays: []int32{1, 3},
			},
			throughDate: "2026-09-08", completionDate: "2026-09-07", nextDate: "2026-09-09",
		},
		{
			name: "recurrence end date",
			reminder: &store.Reminder{
				DueDate: "2026-08-28", RecurrenceType: store.ReminderRecurrenceDaily, RecurrenceInterval: 1,
				RecurrenceEndDate: "2026-08-29",
			},
			throughDate: "2026-08-30", completionDate: "2026-08-29", nextDate: "",
		},
		{
			name: "monthly clamped date",
			reminder: &store.Reminder{
				DueDate: "2026-01-31", RecurrenceType: store.ReminderRecurrenceMonthly, RecurrenceInterval: 1,
			},
			throughDate: "2026-02-28", completionDate: "2026-02-28", nextDate: "2026-03-28",
		},
		{
			name: "yearly leap day",
			reminder: &store.Reminder{
				DueDate: "2024-02-29", RecurrenceType: store.ReminderRecurrenceYearly, RecurrenceInterval: 1,
			},
			throughDate: "2026-02-28", completionDate: "2026-02-28", nextDate: "2027-02-28",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			completionDate, nextDate, err := recurringCompletionDates(test.reminder, test.throughDate)
			require.NoError(t, err)
			require.Equal(t, test.completionDate, completionDate)
			require.Equal(t, test.nextDate, nextDate)
		})
	}
}

func TestReminderMemoLinkLimit(t *testing.T) {
	ctx := context.Background()
	service := newIntegrationService(t)
	user, err := service.Store.CreateUser(ctx, &store.User{Username: "reminder-link-limit", Role: store.RoleUser})
	require.NoError(t, err)
	_, err = service.Store.CreateMemo(ctx, &store.Memo{
		UID: "reminder-link-limit-memo", CreatorID: user.ID, Content: "linked memo", Visibility: store.Private,
	})
	require.NoError(t, err)
	userContext := userCtx(ctx, user.ID)
	for index := 0; index < maxRemindersPerMemo; index++ {
		_, err = service.CreateReminder(userContext, &v1pb.CreateReminderRequest{
			Parent:   "users/reminder-link-limit",
			Reminder: &v1pb.Reminder{Title: "Linked reminder", Memo: "memos/reminder-link-limit-memo"},
		})
		require.NoError(t, err)
	}
	_, err = service.CreateReminder(userContext, &v1pb.CreateReminderRequest{
		Parent:   "users/reminder-link-limit",
		Reminder: &v1pb.Reminder{Title: "Too many", Memo: "memos/reminder-link-limit-memo"},
	})
	require.Equal(t, codes.FailedPrecondition, status.Code(err))
}
