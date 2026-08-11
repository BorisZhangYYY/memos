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

	remindAt := time.Date(2026, time.August, 11, 20, 0, 0, 0, time.FixedZone("UTC+8", 8*60*60))
	repeating, err := service.CreateReminder(aliceCtx, &v1pb.CreateReminderRequest{
		Parent: "users/reminder-alice",
		Reminder: &v1pb.Reminder{
			Title: "Weekly report", ReminderList: aliceLists.ReminderLists[0].Name,
			DueDate: "2026-08-11", RemindTime: timestamppb.New(remindAt), TimeZone: "Asia/Shanghai",
			AdvanceNoticeSeconds: 900,
			Recurrence:           &v1pb.ReminderRecurrence{Frequency: v1pb.ReminderRecurrence_WEEKLY, Interval: 1, Weekdays: []int32{2}},
		},
	})
	require.NoError(t, err)
	require.Equal(t, "2026-08-11", repeating.DueDate)
	require.Equal(t, int64(900), repeating.AdvanceNoticeSeconds)

	// A user cannot use another user's parent to read reminders.
	_, err = service.ListReminders(bobCtx, &v1pb.ListRemindersRequest{Parent: "users/reminder-alice"})
	require.Equal(t, codes.PermissionDenied, status.Code(err))

	advanced, err := service.CompleteReminder(aliceCtx, &v1pb.CompleteReminderRequest{Name: repeating.Name})
	require.NoError(t, err)
	require.Equal(t, v1pb.Reminder_PENDING, advanced.Status)
	require.Equal(t, "2026-08-18", advanced.DueDate)
	require.Equal(t, int32(1), advanced.CompletedOccurrences)
	require.Equal(t, 20, advanced.RemindTime.AsTime().In(time.FixedZone("UTC+8", 8*60*60)).Hour())

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
	occurrences, err := service.Store.ListReminderOccurrences(ctx, &store.FindReminderOccurrence{CreatorID: &alice.ID})
	require.NoError(t, err)
	require.Len(t, occurrences, 2)
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
