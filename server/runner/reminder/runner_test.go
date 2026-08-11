package reminder

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/internal/email"
	"github.com/usememos/memos/internal/profile"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/server/notification"
	"github.com/usememos/memos/store"
	teststore "github.com/usememos/memos/store/test"
)

func TestRunOnceDeliversEarlyAndDueNotificationsExactlyOnce(t *testing.T) {
	ctx := context.Background()
	testingStore := teststore.NewTestingStore(ctx, t)
	t.Cleanup(func() { require.NoError(t, testingStore.Close()) })

	_, err := testingStore.UpsertInstanceSetting(ctx, &storepb.InstanceSetting{
		Key: storepb.InstanceSettingKey_NOTIFICATION,
		Value: &storepb.InstanceSetting_NotificationSetting{
			NotificationSetting: &storepb.InstanceNotificationSetting{
				Email: &storepb.InstanceNotificationSetting_EmailSetting{
					Enabled: true, SmtpHost: "smtp.example.com", SmtpPort: 587, FromEmail: "bot@example.com",
				},
			},
		},
	})
	require.NoError(t, err)

	user, err := testingStore.CreateUser(ctx, &store.User{Username: "reminder-runner", Email: "owner@example.com", Role: store.RoleUser})
	require.NoError(t, err)
	list, err := testingStore.CreateReminderList(ctx, &store.ReminderList{UID: "default", CreatorID: user.ID, Name: "Reminders"})
	require.NoError(t, err)

	now := time.Now().Unix()
	overdueTime := now - 30
	_, err = testingStore.CreateReminder(ctx, &store.Reminder{
		UID: "overdue", CreatorID: user.ID, ListID: list.ID, Title: "Overdue reminder", RemindTs: &overdueTime,
		TimeZone: "Asia/Shanghai", AdvanceNoticeSeconds: 300,
	})
	require.NoError(t, err)

	var sentMessages []*email.Message
	runnerProfile := &profile.Profile{InstanceURL: "https://memos.example"}
	runner := NewRunner(testingStore, runnerProfile)
	runner.dispatcher = notification.NewEmailDispatcher(runnerProfile, testingStore, func(_ *email.Config, message *email.Message) {
		sentMessages = append(sentMessages, message)
	})

	runner.RunOnce(ctx)
	require.Len(t, sentMessages, 1)
	require.Contains(t, sentMessages[0].Subject, "Overdue reminder")
	require.Contains(t, sentMessages[0].Body, "Asia/Shanghai")
	require.NotContains(t, sentMessages[0].Body, "This is an early reminder.")

	inboxes, err := testingStore.ListInboxes(ctx, &store.FindInbox{ReceiverID: &user.ID})
	require.NoError(t, err)
	require.Len(t, inboxes, 1)
	require.False(t, inboxes[0].Message.GetReminder().Early)
	require.Equal(t, "Asia/Shanghai", inboxes[0].Message.GetReminder().TimeZone)

	// Re-running the poll must not redeliver the same due notification.
	runner.RunOnce(ctx)
	require.Len(t, sentMessages, 1)

	futureTime := time.Now().Add(time.Minute).Unix()
	_, err = testingStore.CreateReminder(ctx, &store.Reminder{
		UID: "early", CreatorID: user.ID, ListID: list.ID, Title: "Early reminder", RemindTs: &futureTime,
		TimeZone: "Asia/Shanghai", AdvanceNoticeSeconds: 120,
	})
	require.NoError(t, err)

	runner.RunOnce(ctx)
	require.Len(t, sentMessages, 2)
	require.Contains(t, sentMessages[1].Body, "This is an early reminder.")

	inboxes, err = testingStore.ListInboxes(ctx, &store.FindInbox{ReceiverID: &user.ID})
	require.NoError(t, err)
	require.Len(t, inboxes, 2)
	require.True(t, inboxes[1].Message.GetReminder().Early)

	// Re-running inside the same advance window must not redeliver the early notification.
	runner.RunOnce(ctx)
	require.Len(t, sentMessages, 2)
}
