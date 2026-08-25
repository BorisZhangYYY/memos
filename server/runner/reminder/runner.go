// Package reminder delivers scheduled reminder notifications.
package reminder

import (
	"context"
	"log/slog"
	"time"

	"github.com/usememos/memos/internal/profile"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/server/notification"
	"github.com/usememos/memos/store"
)

const runnerInterval = 30 * time.Second

// Runner polls the database so reminder edits take effect without restarting the server.
type Runner struct {
	store      *store.Store
	dispatcher *notification.EmailDispatcher
}

// NewRunner creates a reminder notification runner.
func NewRunner(store *store.Store, profile *profile.Profile) *Runner {
	return &Runner{store: store, dispatcher: notification.NewEmailDispatcher(profile, store, nil)}
}

// Run executes until the context is canceled.
func (r *Runner) Run(ctx context.Context) {
	ticker := time.NewTicker(runnerInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			r.RunOnce(ctx)
		case <-ctx.Done():
			return
		}
	}
}

// RunOnce delivers every early or due reminder notification currently ready.
func (r *Runner) RunOnce(ctx context.Context) {
	nowSec := time.Now().Unix()
	due, err := r.store.ListDueReminderNotifications(ctx, nowSec)
	if err != nil {
		slog.Warn("Failed to list due reminder notifications", slog.Any("err", err))
		return
	}
	for _, delivery := range due {
		if delivery == nil || delivery.Reminder == nil {
			continue
		}
		value := delivery.Reminder
		inbox, err := r.store.CreateInbox(ctx, &store.Inbox{
			SenderID: value.CreatorID, ReceiverID: value.CreatorID, Status: store.UNREAD,
			Message: &storepb.InboxMessage{
				Type: storepb.InboxMessage_REMINDER,
				Payload: &storepb.InboxMessage_Reminder{Reminder: &storepb.InboxMessage_ReminderPayload{
					ReminderId: value.ID, ReminderUid: value.UID, Title: value.Title, RemindTs: delivery.RemindTs, Early: delivery.Early,
					TimeZone: value.TimeZone,
				}},
			},
		})
		if err != nil {
			slog.Warn("Failed to create reminder inbox notification", slog.Any("err", err), slog.Int64("reminder_id", int64(value.ID)))
			continue
		}
		if err := r.store.MarkReminderNotificationDelivered(ctx, value.ID, delivery.Early, delivery.RemindTs, nowSec); err != nil {
			slog.Warn("Failed to mark reminder notification delivered", slog.Any("err", err), slog.Int64("reminder_id", int64(value.ID)))
		}
		if err := r.dispatcher.DispatchInboxEmail(ctx, inbox); err != nil {
			slog.Warn("Failed to dispatch reminder email", slog.Any("err", err), slog.Int64("reminder_id", int64(value.ID)))
		}
	}
}
