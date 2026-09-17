package notification

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/internal/profile"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

func TestBuildReminderEmailMessageUsesReminderTimeZoneAndDeepLink(t *testing.T) {
	location, err := time.LoadLocation("Asia/Shanghai")
	require.NoError(t, err)
	remindTime := time.Date(2026, time.August, 11, 20, 0, 0, 0, location)
	dispatcher := &EmailDispatcher{profile: &profile.Profile{InstanceURL: "https://memos.example/"}}

	message, err := dispatcher.buildReminderEmailMessage(
		&storepb.InboxMessage{
			Type: storepb.InboxMessage_REMINDER,
			Payload: &storepb.InboxMessage_Reminder{Reminder: &storepb.InboxMessage_ReminderPayload{
				ReminderUid: "weekly-report", Title: "Weekly report", RemindTs: remindTime.Unix(), Early: true, TimeZone: "Asia/Shanghai",
			}},
		},
		&store.User{Username: "owner", Email: "owner@example.com"},
	)
	require.NoError(t, err)
	require.Equal(t, []string{"owner@example.com"}, message.To)
	require.Equal(t, "[Memos] Reminder: Weekly report", message.Subject)
	require.Contains(t, message.Body, "This is an early reminder.")
	require.Contains(t, message.Body, "Tue, 11 Aug 2026 20:00:00 +0800 (Asia/Shanghai)")
	require.Contains(t, message.Body, "https://memos.example/reminders?selected=weekly-report")
}
