package store

import "context"

// ReminderStatus is the current completion state of a reminder item.
type ReminderStatus string

const (
	ReminderPending   ReminderStatus = "PENDING"
	ReminderCompleted ReminderStatus = "COMPLETED"
)

// ReminderRecurrenceType identifies a structured recurrence rule.
type ReminderRecurrenceType string

const (
	ReminderRecurrenceNone    ReminderRecurrenceType = ""
	ReminderRecurrenceDaily   ReminderRecurrenceType = "DAILY"
	ReminderRecurrenceWeekly  ReminderRecurrenceType = "WEEKLY"
	ReminderRecurrenceMonthly ReminderRecurrenceType = "MONTHLY"
	ReminderRecurrenceYearly  ReminderRecurrenceType = "YEARLY"
)

// ReminderList is a user-owned list used to organize reminders.
type ReminderList struct {
	ID        int32
	UID       string
	CreatorID int32
	CreatedTs int64
	UpdatedTs int64
	RowStatus RowStatus
	Name      string
	Color     string
	Icon      string
	SortOrder int32
}

// FindReminderList filters reminder lists.
type FindReminderList struct {
	ID        *int32
	UID       *string
	CreatorID *int32
	RowStatus *RowStatus
}

// UpdateReminderList contains mutable reminder-list fields.
type UpdateReminderList struct {
	ID        int32
	CreatorID int32
	Name      *string
	Color     *string
	Icon      *string
	SortOrder *int32
	RowStatus *RowStatus
}

// Reminder is a user-owned structured task. Its creation timestamp is independent
// from its due date, notification time, and any linked memo timestamps.
type Reminder struct {
	ID                       int32
	UID                      string
	CreatorID                int32
	ListID                   int32
	MemoID                   *int32
	CreatedTs                int64
	UpdatedTs                int64
	RowStatus                RowStatus
	Title                    string
	DueDate                  string
	RemindTs                 *int64
	TimeZone                 string
	AdvanceNoticeSeconds     int64
	RecurrenceType           ReminderRecurrenceType
	RecurrenceInterval       int32
	RecurrenceWeekdays       []int32
	RecurrenceEndDate        string
	RecurrenceMaxOccurrences int32
	CompletedOccurrences     int32
	Flagged                  bool
	Priority                 int32
	Tags                     []string
	LocationPlaceholder      string
	LocationLatitude         float64
	LocationLongitude        float64
	LocationRadiusMeters     float64
	LocationTrigger          int32
	Status                   ReminderStatus
	CompletedTs              *int64
	SortOrder                int32
	EarlyNotifiedTs          *int64
	NotifiedTs               *int64
}

// FindReminder filters reminder items.
type FindReminder struct {
	ID        *int32
	UID       *string
	CreatorID *int32
	ListID    *int32
	MemoID    *int32
	RowStatus *RowStatus
	Status    *ReminderStatus
	Flagged   *bool
	DueBefore *string
	DueSet    *bool
	Query     *string
}

// UpdateReminder contains mutable reminder fields. Nil pointers are unchanged.
type UpdateReminder struct {
	ID                       int32
	CreatorID                int32
	ListID                   *int32
	MemoID                   **int32
	RowStatus                *RowStatus
	Title                    *string
	DueDate                  *string
	RemindTs                 **int64
	TimeZone                 *string
	AdvanceNoticeSeconds     *int64
	RecurrenceType           *ReminderRecurrenceType
	RecurrenceInterval       *int32
	RecurrenceWeekdays       *[]int32
	RecurrenceEndDate        *string
	RecurrenceMaxOccurrences *int32
	CompletedOccurrences     *int32
	Flagged                  *bool
	Priority                 *int32
	Tags                     *[]string
	LocationPlaceholder      *string
	LocationLatitude         *float64
	LocationLongitude        *float64
	LocationRadiusMeters     *float64
	LocationTrigger          *int32
	Status                   *ReminderStatus
	CompletedTs              **int64
	SortOrder                *int32
	EarlyNotifiedTs          **int64
	NotifiedTs               **int64
}

// ReminderOccurrence records one completion for deterministic daily and weekly reports.
type ReminderOccurrence struct {
	ID            int32
	UID           string
	CreatorID     int32
	ReminderUID   string
	ListUID       string
	ListName      string
	Title         string
	CreatedTs     int64
	ScheduledDate string
	RemindTs      *int64
	CompletedTs   int64
	Status        ReminderStatus
}

// FindReminderOccurrence filters immutable completion facts for reporting.
type FindReminderOccurrence struct {
	CreatorID       *int32
	CompletedAfter  *int64
	CompletedBefore *int64
}

// DeleteReminder permanently removes a reminder. Completion occurrences are
// independent snapshots and intentionally survive this deletion for reports.
type DeleteReminder struct {
	ID        int32
	CreatorID int32
}

// ReminderNotification identifies a due notification delivery.
type ReminderNotification struct {
	Reminder *Reminder
	Early    bool
}

func (s *Store) CreateReminderList(ctx context.Context, value *ReminderList) (*ReminderList, error) {
	return s.driver.CreateReminderList(ctx, value)
}

func (s *Store) ListReminderLists(ctx context.Context, find *FindReminderList) ([]*ReminderList, error) {
	return s.driver.ListReminderLists(ctx, find)
}

func (s *Store) UpdateReminderList(ctx context.Context, value *UpdateReminderList) (*ReminderList, error) {
	return s.driver.UpdateReminderList(ctx, value)
}

func (s *Store) CreateReminder(ctx context.Context, value *Reminder) (*Reminder, error) {
	return s.driver.CreateReminder(ctx, value)
}

func (s *Store) ListReminders(ctx context.Context, find *FindReminder) ([]*Reminder, error) {
	return s.driver.ListReminders(ctx, find)
}

func (s *Store) UpdateReminder(ctx context.Context, value *UpdateReminder) (*Reminder, error) {
	return s.driver.UpdateReminder(ctx, value)
}

func (s *Store) DeleteReminder(ctx context.Context, value *DeleteReminder) error {
	return s.driver.DeleteReminder(ctx, value)
}

func (s *Store) CreateReminderOccurrence(ctx context.Context, value *ReminderOccurrence) (*ReminderOccurrence, error) {
	return s.driver.CreateReminderOccurrence(ctx, value)
}

func (s *Store) ListReminderOccurrences(ctx context.Context, find *FindReminderOccurrence) ([]*ReminderOccurrence, error) {
	return s.driver.ListReminderOccurrences(ctx, find)
}

func (s *Store) ListDueReminderNotifications(ctx context.Context, now int64) ([]*ReminderNotification, error) {
	return s.driver.ListDueReminderNotifications(ctx, now)
}

func (s *Store) MarkReminderNotificationDelivered(ctx context.Context, reminderID int32, early bool, deliveredTs int64) error {
	return s.driver.MarkReminderNotificationDelivered(ctx, reminderID, early, deliveredTs)
}
