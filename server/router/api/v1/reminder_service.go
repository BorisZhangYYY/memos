package v1

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

const (
	defaultReminderListUID    = "default"
	defaultReminderListName   = "Reminders"
	maxRemindersPerMemo       = 3
	maxReminderTitleLength    = 500
	maxReminderListNameLength = 100
)

func reminderListName(username, uid string) string {
	return BuildUserName(username) + "/reminderLists/" + uid
}
func reminderName(username, uid string) string { return BuildUserName(username) + "/reminders/" + uid }

func parseReminderResourceName(name, collection string) (string, string, error) {
	parts := strings.Split(name, "/")
	if len(parts) != 4 || parts[0] != "users" || parts[1] == "" || parts[2] != collection || parts[3] == "" {
		return "", "", status.Errorf(codes.InvalidArgument, "invalid reminder resource name: %s", name)
	}
	return parts[1], parts[3], nil
}

func (s *APIV1Service) authorizeReminderParent(ctx context.Context, parent string) (*store.User, error) {
	user, err := ResolveUserByName(ctx, s.Store, parent)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user name: %v", err)
	}
	if user == nil {
		return nil, status.Errorf(codes.NotFound, "user not found")
	}
	if _, err := s.authorizeUserResourceAccess(ctx, user.ID, false); err != nil {
		return nil, err
	}
	return user, nil
}

func (s *APIV1Service) ensureDefaultReminderList(ctx context.Context, user *store.User) (*store.ReminderList, error) {
	lists, err := s.Store.ListReminderLists(ctx, &store.FindReminderList{UID: pointer(defaultReminderListUID), CreatorID: &user.ID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list reminder lists")
	}
	if len(lists) > 0 {
		return lists[0], nil
	}
	created, err := s.Store.CreateReminderList(ctx, &store.ReminderList{
		UID: defaultReminderListUID, CreatorID: user.ID, Name: defaultReminderListName, Color: "#0A84FF", Icon: "list",
	})
	if err != nil {
		// Another concurrent request may have inserted it first.
		lists, listErr := s.Store.ListReminderLists(ctx, &store.FindReminderList{UID: pointer(defaultReminderListUID), CreatorID: &user.ID})
		if listErr == nil && len(lists) > 0 {
			return lists[0], nil
		}
		return nil, status.Errorf(codes.Internal, "failed to create default reminder list")
	}
	return created, nil
}

func pointer[T any](value T) *T { return &value }

func (s *APIV1Service) resolveReminderList(ctx context.Context, name string) (*store.User, *store.ReminderList, error) {
	username, uid, err := parseReminderResourceName(name, "reminderLists")
	if err != nil {
		return nil, nil, err
	}
	user, err := s.authorizeReminderParent(ctx, BuildUserName(username))
	if err != nil {
		return nil, nil, err
	}
	lists, err := s.Store.ListReminderLists(ctx, &store.FindReminderList{UID: &uid, CreatorID: &user.ID})
	if err != nil {
		return nil, nil, status.Errorf(codes.Internal, "failed to get reminder list")
	}
	if len(lists) == 0 {
		return nil, nil, status.Errorf(codes.NotFound, "reminder list not found")
	}
	return user, lists[0], nil
}

func (s *APIV1Service) resolveReminder(ctx context.Context, name string) (*store.User, *store.Reminder, error) {
	username, uid, err := parseReminderResourceName(name, "reminders")
	if err != nil {
		return nil, nil, err
	}
	user, err := s.authorizeReminderParent(ctx, BuildUserName(username))
	if err != nil {
		return nil, nil, err
	}
	values, err := s.Store.ListReminders(ctx, &store.FindReminder{UID: &uid, CreatorID: &user.ID})
	if err != nil {
		return nil, nil, status.Errorf(codes.Internal, "failed to get reminder")
	}
	if len(values) == 0 {
		return nil, nil, status.Errorf(codes.NotFound, "reminder not found")
	}
	return user, values[0], nil
}

func convertReminderList(user *store.User, value *store.ReminderList, pending int32) *v1pb.ReminderList {
	return &v1pb.ReminderList{
		Name: reminderListName(user.Username, value.UID), DisplayName: value.Name, Color: value.Color, Icon: value.Icon,
		SortOrder: value.SortOrder, State: convertStateFromStore(value.RowStatus), CreateTime: timestamppb.New(time.Unix(value.CreatedTs, 0)),
		UpdateTime: timestamppb.New(time.Unix(value.UpdatedTs, 0)), PendingCount: pending,
	}
}

func convertReminder(user *store.User, value *store.Reminder, lists map[int32]*store.ReminderList, memoUIDs map[int32]string) *v1pb.Reminder {
	message := &v1pb.Reminder{
		Name: reminderName(user.Username, value.UID), Creator: BuildUserName(user.Username), Title: value.Title,
		DueDate: value.DueDate, TimeZone: value.TimeZone, AdvanceNoticeSeconds: value.AdvanceNoticeSeconds,
		Flagged: value.Flagged, Priority: v1pb.Reminder_Priority(value.Priority), Tags: value.Tags,
		Status: v1pb.Reminder_PENDING, SortOrder: value.SortOrder, State: convertStateFromStore(value.RowStatus),
		CreateTime: timestamppb.New(time.Unix(value.CreatedTs, 0)), UpdateTime: timestamppb.New(time.Unix(value.UpdatedTs, 0)),
		CompletedOccurrences: value.CompletedOccurrences,
	}
	if value.RecurrenceType != store.ReminderRecurrenceNone {
		message.Recurrence = &v1pb.ReminderRecurrence{
			Frequency: convertReminderRecurrenceToAPI(value.RecurrenceType), Interval: value.RecurrenceInterval,
			Weekdays: value.RecurrenceWeekdays, EndDate: value.RecurrenceEndDate, MaxOccurrences: value.RecurrenceMaxOccurrences,
		}
	}
	if value.LocationPlaceholder != "" || value.LocationLatitude != 0 || value.LocationLongitude != 0 {
		message.Location = &v1pb.ReminderLocation{
			Placeholder: value.LocationPlaceholder, Latitude: value.LocationLatitude, Longitude: value.LocationLongitude,
			RadiusMeters: value.LocationRadiusMeters, Trigger: v1pb.ReminderLocation_Trigger(value.LocationTrigger),
		}
	}
	if list := lists[value.ListID]; list != nil {
		message.ReminderList = reminderListName(user.Username, list.UID)
	}
	if value.MemoID != nil && memoUIDs[*value.MemoID] != "" {
		message.Memo = "memos/" + memoUIDs[*value.MemoID]
	}
	if value.RemindTs != nil {
		message.RemindTime = timestamppb.New(time.Unix(*value.RemindTs, 0))
	}
	if value.Status == store.ReminderCompleted {
		message.Status = v1pb.Reminder_COMPLETED
	}
	if value.CompletedTs != nil {
		message.CompletionTime = timestamppb.New(time.Unix(*value.CompletedTs, 0))
	}
	return message
}

func convertReminderRecurrenceToAPI(value store.ReminderRecurrenceType) v1pb.ReminderRecurrence_Frequency {
	switch value {
	case store.ReminderRecurrenceDaily:
		return v1pb.ReminderRecurrence_DAILY
	case store.ReminderRecurrenceWeekly:
		return v1pb.ReminderRecurrence_WEEKLY
	case store.ReminderRecurrenceMonthly:
		return v1pb.ReminderRecurrence_MONTHLY
	case store.ReminderRecurrenceYearly:
		return v1pb.ReminderRecurrence_YEARLY
	default:
		return v1pb.ReminderRecurrence_FREQUENCY_UNSPECIFIED
	}
}

func convertReminderRecurrenceToStore(value v1pb.ReminderRecurrence_Frequency) store.ReminderRecurrenceType {
	switch value {
	case v1pb.ReminderRecurrence_DAILY:
		return store.ReminderRecurrenceDaily
	case v1pb.ReminderRecurrence_WEEKLY:
		return store.ReminderRecurrenceWeekly
	case v1pb.ReminderRecurrence_MONTHLY:
		return store.ReminderRecurrenceMonthly
	case v1pb.ReminderRecurrence_YEARLY:
		return store.ReminderRecurrenceYearly
	default:
		return store.ReminderRecurrenceNone
	}
}

func (s *APIV1Service) reminderConversionData(ctx context.Context, values []*store.Reminder) (map[int32]*store.ReminderList, map[int32]string, error) {
	lists := map[int32]*store.ReminderList{}
	memoUIDs := map[int32]string{}
	listIDs, memoIDs := map[int32]struct{}{}, map[int32]struct{}{}
	for _, value := range values {
		listIDs[value.ListID] = struct{}{}
		if value.MemoID != nil {
			memoIDs[*value.MemoID] = struct{}{}
		}
	}
	for id := range listIDs {
		found, err := s.Store.ListReminderLists(ctx, &store.FindReminderList{ID: &id})
		if err != nil {
			return nil, nil, err
		}
		if len(found) > 0 {
			lists[id] = found[0]
		}
	}
	for id := range memoIDs {
		memo, err := s.Store.GetMemo(ctx, &store.FindMemo{ID: &id})
		if err != nil {
			return nil, nil, err
		}
		if memo != nil {
			memoUIDs[id] = memo.UID
		}
	}
	return lists, memoUIDs, nil
}

func (s *APIV1Service) ListReminderLists(ctx context.Context, request *v1pb.ListReminderListsRequest) (*v1pb.ListReminderListsResponse, error) {
	user, err := s.authorizeReminderParent(ctx, request.Parent)
	if err != nil {
		return nil, err
	}
	if _, err := s.ensureDefaultReminderList(ctx, user); err != nil {
		return nil, err
	}
	rowStatus := store.Normal
	if request.State == v1pb.State_ARCHIVED {
		rowStatus = store.Archived
	}
	lists, err := s.Store.ListReminderLists(ctx, &store.FindReminderList{CreatorID: &user.ID, RowStatus: &rowStatus})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list reminder lists")
	}
	pending := store.ReminderPending
	reminders, err := s.Store.ListReminders(ctx, &store.FindReminder{CreatorID: &user.ID, RowStatus: pointer(store.Normal), Status: &pending})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to count reminders")
	}
	counts := map[int32]int32{}
	for _, reminder := range reminders {
		counts[reminder.ListID]++
	}
	response := &v1pb.ListReminderListsResponse{}
	for _, list := range lists {
		response.ReminderLists = append(response.ReminderLists, convertReminderList(user, list, counts[list.ID]))
	}
	return response, nil
}

func (s *APIV1Service) CreateReminderList(ctx context.Context, request *v1pb.CreateReminderListRequest) (*v1pb.ReminderList, error) {
	user, err := s.authorizeReminderParent(ctx, request.Parent)
	if err != nil {
		return nil, err
	}
	if request.ReminderList == nil {
		return nil, status.Errorf(codes.InvalidArgument, "reminder_list is required")
	}
	name := strings.TrimSpace(request.ReminderList.DisplayName)
	if name == "" || len([]rune(name)) > maxReminderListNameLength {
		return nil, status.Errorf(codes.InvalidArgument, "invalid reminder list name")
	}
	uid, err := ValidateAndGenerateUID(request.ReminderListId)
	if err != nil {
		return nil, err
	}
	color := request.ReminderList.Color
	if color == "" {
		color = "#0A84FF"
	}
	icon := request.ReminderList.Icon
	if icon == "" {
		icon = "list"
	}
	created, err := s.Store.CreateReminderList(ctx, &store.ReminderList{UID: uid, CreatorID: user.ID, Name: name, Color: color, Icon: icon, SortOrder: request.ReminderList.SortOrder})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to create reminder list")
	}
	return convertReminderList(user, created, 0), nil
}

func (s *APIV1Service) UpdateReminderList(ctx context.Context, request *v1pb.UpdateReminderListRequest) (*v1pb.ReminderList, error) {
	if request.ReminderList == nil {
		return nil, status.Errorf(codes.InvalidArgument, "reminder_list is required")
	}
	user, value, err := s.resolveReminderList(ctx, request.ReminderList.Name)
	if err != nil {
		return nil, err
	}
	update := &store.UpdateReminderList{ID: value.ID, CreatorID: user.ID}
	for _, path := range request.UpdateMask.GetPaths() {
		switch path {
		case "display_name":
			name := strings.TrimSpace(request.ReminderList.DisplayName)
			if name == "" {
				return nil, status.Errorf(codes.InvalidArgument, "display_name is required")
			}
			update.Name = &name
		case "color":
			update.Color = &request.ReminderList.Color
		case "icon":
			update.Icon = &request.ReminderList.Icon
		case "sort_order":
			update.SortOrder = &request.ReminderList.SortOrder
		default:
			return nil, status.Errorf(codes.InvalidArgument, "invalid update path: %s", path)
		}
	}
	updated, err := s.Store.UpdateReminderList(ctx, update)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update reminder list")
	}
	return convertReminderList(user, updated, 0), nil
}

func (s *APIV1Service) DeleteReminderList(ctx context.Context, request *v1pb.DeleteReminderListRequest) (*emptypb.Empty, error) {
	user, value, err := s.resolveReminderList(ctx, request.Name)
	if err != nil {
		return nil, err
	}
	if value.UID == defaultReminderListUID {
		return nil, status.Errorf(codes.FailedPrecondition, "default reminder list cannot be deleted")
	}
	defaultList, err := s.ensureDefaultReminderList(ctx, user)
	if err != nil {
		return nil, err
	}
	reminders, err := s.Store.ListReminders(ctx, &store.FindReminder{CreatorID: &user.ID, ListID: &value.ID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to move reminders")
	}
	for _, reminder := range reminders {
		if _, err := s.Store.UpdateReminder(ctx, &store.UpdateReminder{ID: reminder.ID, CreatorID: user.ID, ListID: &defaultList.ID}); err != nil {
			return nil, status.Errorf(codes.Internal, "failed to move reminders")
		}
	}
	archived := store.Archived
	if _, err := s.Store.UpdateReminderList(ctx, &store.UpdateReminderList{ID: value.ID, CreatorID: user.ID, RowStatus: &archived}); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to archive reminder list")
	}
	return &emptypb.Empty{}, nil
}

func (s *APIV1Service) ListReminders(ctx context.Context, request *v1pb.ListRemindersRequest) (*v1pb.ListRemindersResponse, error) {
	user, err := s.authorizeReminderParent(ctx, request.Parent)
	if err != nil {
		return nil, err
	}
	if _, err := s.ensureDefaultReminderList(ctx, user); err != nil {
		return nil, err
	}
	rowStatus := store.Normal
	if request.State == v1pb.State_ARCHIVED {
		rowStatus = store.Archived
	}
	find := &store.FindReminder{CreatorID: &user.ID, RowStatus: &rowStatus}
	pending, completed := store.ReminderPending, store.ReminderCompleted
	if rowStatus == store.Normal {
		switch request.View {
		case v1pb.ListRemindersRequest_COMPLETED:
			find.Status = &completed
		default:
			find.Status = &pending
		}
	}
	if request.ReminderList != "" {
		_, list, err := s.resolveReminderList(ctx, request.ReminderList)
		if err != nil {
			return nil, err
		}
		find.ListID = &list.ID
	}
	if request.Query != "" {
		find.Query = &request.Query
	}
	switch request.View {
	case v1pb.ListRemindersRequest_TODAY:
		zone := request.TimeZone
		if zone == "" {
			zone = "UTC"
		}
		location, err := time.LoadLocation(zone)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid time zone")
		}
		today := time.Now().In(location).Format(time.DateOnly)
		find.DueBefore = &today
	case v1pb.ListRemindersRequest_SCHEDULED:
		find.DueSet = pointer(true)
	case v1pb.ListRemindersRequest_FLAGGED:
		find.Flagged = pointer(true)
	default:
		// ALL and COMPLETED only use the status filter configured above.
	}
	values, err := s.Store.ListReminders(ctx, find)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list reminders")
	}
	lists, memoUIDs, err := s.reminderConversionData(ctx, values)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to load reminder relations")
	}
	response := &v1pb.ListRemindersResponse{}
	for _, value := range values {
		response.Reminders = append(response.Reminders, convertReminder(user, value, lists, memoUIDs))
	}
	return response, nil
}

func (s *APIV1Service) resolveReminderListID(ctx context.Context, user *store.User, name string) (int32, error) {
	if name == "" {
		list, err := s.ensureDefaultReminderList(ctx, user)
		if err != nil {
			return 0, err
		}
		return list.ID, nil
	}
	_, list, err := s.resolveReminderList(ctx, name)
	if err != nil {
		return 0, err
	}
	return list.ID, nil
}

func (s *APIV1Service) resolveReminderMemoID(ctx context.Context, user *store.User, name string) (*int32, error) {
	if name == "" {
		return nil, nil
	}
	uid, err := ExtractMemoUIDFromName(name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid memo name")
	}
	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: &uid})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get memo")
	}
	if memo == nil || memo.CreatorID != user.ID {
		return nil, status.Errorf(codes.NotFound, "memo not found")
	}
	return &memo.ID, nil
}

func (s *APIV1Service) ensureReminderMemoCapacity(ctx context.Context, user *store.User, memoID *int32, excludeReminderID int32) error {
	if memoID == nil {
		return nil
	}
	values, err := s.Store.ListReminders(ctx, &store.FindReminder{CreatorID: &user.ID, MemoID: memoID, RowStatus: pointer(store.Normal)})
	if err != nil {
		return status.Errorf(codes.Internal, "failed to count memo reminders")
	}
	count := 0
	for _, value := range values {
		if value.ID != excludeReminderID {
			count++
		}
	}
	if count >= maxRemindersPerMemo {
		return status.Errorf(codes.FailedPrecondition, "a memo can link at most %d reminders", maxRemindersPerMemo)
	}
	return nil
}

func validateReminder(value *store.Reminder) error {
	value.Title = strings.TrimSpace(value.Title)
	if value.Title == "" || len([]rune(value.Title)) > maxReminderTitleLength {
		return status.Errorf(codes.InvalidArgument, "invalid reminder title")
	}
	if value.DueDate != "" {
		if _, err := time.Parse(time.DateOnly, value.DueDate); err != nil {
			return status.Errorf(codes.InvalidArgument, "due_date must use YYYY-MM-DD")
		}
	}
	if value.TimeZone == "" {
		value.TimeZone = "UTC"
	}
	if _, err := time.LoadLocation(value.TimeZone); err != nil {
		return status.Errorf(codes.InvalidArgument, "invalid time zone")
	}
	if value.AdvanceNoticeSeconds < 0 {
		return status.Errorf(codes.InvalidArgument, "advance notice cannot be negative")
	}
	if value.AdvanceNoticeSeconds > 0 && value.RemindTs == nil {
		return status.Errorf(codes.InvalidArgument, "advance notice requires remind_time")
	}
	if value.RecurrenceInterval <= 0 {
		value.RecurrenceInterval = 1
	}
	if value.RecurrenceType != store.ReminderRecurrenceNone && value.DueDate == "" {
		return status.Errorf(codes.InvalidArgument, "recurrence requires due_date")
	}
	for _, weekday := range value.RecurrenceWeekdays {
		if weekday < 0 || weekday > 6 {
			return status.Errorf(codes.InvalidArgument, "weekday must be between 0 and 6")
		}
	}
	if value.RecurrenceEndDate != "" {
		if _, err := time.Parse(time.DateOnly, value.RecurrenceEndDate); err != nil {
			return status.Errorf(codes.InvalidArgument, "recurrence end_date must use YYYY-MM-DD")
		}
	}
	if value.RemindTs != nil && value.DueDate == "" {
		location, _ := time.LoadLocation(value.TimeZone)
		value.DueDate = time.Unix(*value.RemindTs, 0).In(location).Format(time.DateOnly)
	}
	return nil
}

func applyReminderMessage(value *store.Reminder, message *v1pb.Reminder) {
	value.Title, value.DueDate, value.TimeZone = message.Title, message.DueDate, message.TimeZone
	value.AdvanceNoticeSeconds, value.Flagged, value.Priority = message.AdvanceNoticeSeconds, message.Flagged, int32(message.Priority)
	value.Tags, value.SortOrder = message.Tags, message.SortOrder
	if message.RemindTime != nil && message.RemindTime.IsValid() {
		ts := message.RemindTime.AsTime().Unix()
		value.RemindTs = &ts
	} else {
		value.RemindTs = nil
	}
	if message.Recurrence != nil {
		value.RecurrenceType = convertReminderRecurrenceToStore(message.Recurrence.Frequency)
		value.RecurrenceInterval, value.RecurrenceWeekdays = message.Recurrence.Interval, message.Recurrence.Weekdays
		value.RecurrenceEndDate, value.RecurrenceMaxOccurrences = message.Recurrence.EndDate, message.Recurrence.MaxOccurrences
	} else {
		value.RecurrenceType, value.RecurrenceInterval, value.RecurrenceWeekdays = store.ReminderRecurrenceNone, 1, nil
		value.RecurrenceEndDate, value.RecurrenceMaxOccurrences = "", 0
	}
	if message.Location != nil {
		value.LocationPlaceholder, value.LocationLatitude, value.LocationLongitude = message.Location.Placeholder, message.Location.Latitude, message.Location.Longitude
		value.LocationRadiusMeters, value.LocationTrigger = message.Location.RadiusMeters, int32(message.Location.Trigger)
	} else {
		value.LocationPlaceholder, value.LocationLatitude, value.LocationLongitude, value.LocationRadiusMeters, value.LocationTrigger = "", 0, 0, 0, 0
	}
}

func (s *APIV1Service) CreateReminder(ctx context.Context, request *v1pb.CreateReminderRequest) (*v1pb.Reminder, error) {
	user, err := s.authorizeReminderParent(ctx, request.Parent)
	if err != nil {
		return nil, err
	}
	if request.Reminder == nil {
		return nil, status.Errorf(codes.InvalidArgument, "reminder is required")
	}
	listID, err := s.resolveReminderListID(ctx, user, request.Reminder.ReminderList)
	if err != nil {
		return nil, err
	}
	memoID, err := s.resolveReminderMemoID(ctx, user, request.Reminder.Memo)
	if err != nil {
		return nil, err
	}
	if err := s.ensureReminderMemoCapacity(ctx, user, memoID, 0); err != nil {
		return nil, err
	}
	uid, err := ValidateAndGenerateUID(request.ReminderId)
	if err != nil {
		return nil, err
	}
	value := &store.Reminder{UID: uid, CreatorID: user.ID, ListID: listID, MemoID: memoID, Status: store.ReminderPending, RowStatus: store.Normal}
	applyReminderMessage(value, request.Reminder)
	if err := validateReminder(value); err != nil {
		return nil, err
	}
	created, err := s.Store.CreateReminder(ctx, value)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to create reminder")
	}
	lists, memoUIDs, err := s.reminderConversionData(ctx, []*store.Reminder{created})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to load reminder relations")
	}
	return convertReminder(user, created, lists, memoUIDs), nil
}

func (s *APIV1Service) UpdateReminder(ctx context.Context, request *v1pb.UpdateReminderRequest) (*v1pb.Reminder, error) {
	if request.Reminder == nil {
		return nil, status.Errorf(codes.InvalidArgument, "reminder is required")
	}
	user, existing, err := s.resolveReminder(ctx, request.Reminder.Name)
	if err != nil {
		return nil, err
	}
	candidate := *existing
	message := request.Reminder
	for _, path := range request.UpdateMask.GetPaths() {
		switch path {
		case "title":
			candidate.Title = message.Title
		case "reminder_list":
			candidate.ListID, err = s.resolveReminderListID(ctx, user, message.ReminderList)
		case "memo":
			candidate.MemoID, err = s.resolveReminderMemoID(ctx, user, message.Memo)
		case "state":
			candidate.RowStatus = convertStateToStore(message.State)
		case "due_date":
			candidate.DueDate = message.DueDate
		case "remind_time":
			if message.RemindTime != nil {
				ts := message.RemindTime.AsTime().Unix()
				candidate.RemindTs = &ts
			} else {
				candidate.RemindTs = nil
			}
		case "time_zone":
			candidate.TimeZone = message.TimeZone
		case "advance_notice_seconds":
			candidate.AdvanceNoticeSeconds = message.AdvanceNoticeSeconds
		case "recurrence":
			if message.Recurrence == nil {
				candidate.RecurrenceType, candidate.RecurrenceInterval, candidate.RecurrenceWeekdays, candidate.RecurrenceEndDate, candidate.RecurrenceMaxOccurrences = "", 1, nil, "", 0
			} else {
				candidate.RecurrenceType = convertReminderRecurrenceToStore(message.Recurrence.Frequency)
				candidate.RecurrenceInterval, candidate.RecurrenceWeekdays, candidate.RecurrenceEndDate, candidate.RecurrenceMaxOccurrences = message.Recurrence.Interval, message.Recurrence.Weekdays, message.Recurrence.EndDate, message.Recurrence.MaxOccurrences
			}
		case "flagged":
			candidate.Flagged = message.Flagged
		case "priority":
			candidate.Priority = int32(message.Priority)
		case "tags":
			candidate.Tags = message.Tags
		case "location":
			if message.Location == nil {
				candidate.LocationPlaceholder, candidate.LocationLatitude, candidate.LocationLongitude, candidate.LocationRadiusMeters, candidate.LocationTrigger = "", 0, 0, 0, 0
			} else {
				candidate.LocationPlaceholder, candidate.LocationLatitude, candidate.LocationLongitude, candidate.LocationRadiusMeters, candidate.LocationTrigger = message.Location.Placeholder, message.Location.Latitude, message.Location.Longitude, message.Location.RadiusMeters, int32(message.Location.Trigger)
			}
		case "sort_order":
			candidate.SortOrder = message.SortOrder
		default:
			return nil, status.Errorf(codes.InvalidArgument, "invalid update path: %s", path)
		}
		if err != nil {
			return nil, err
		}
	}
	if err := validateReminder(&candidate); err != nil {
		return nil, err
	}
	if err := s.ensureReminderMemoCapacity(ctx, user, candidate.MemoID, candidate.ID); err != nil {
		return nil, err
	}
	var nilTs *int64
	updated, err := s.Store.UpdateReminder(ctx, &store.UpdateReminder{
		ID: candidate.ID, CreatorID: user.ID, ListID: &candidate.ListID, MemoID: &candidate.MemoID, RowStatus: &candidate.RowStatus,
		Title:   &candidate.Title,
		DueDate: &candidate.DueDate, RemindTs: &candidate.RemindTs, TimeZone: &candidate.TimeZone, AdvanceNoticeSeconds: &candidate.AdvanceNoticeSeconds,
		RecurrenceType: &candidate.RecurrenceType, RecurrenceInterval: &candidate.RecurrenceInterval, RecurrenceWeekdays: &candidate.RecurrenceWeekdays,
		RecurrenceEndDate: &candidate.RecurrenceEndDate, RecurrenceMaxOccurrences: &candidate.RecurrenceMaxOccurrences, Flagged: &candidate.Flagged,
		Priority: &candidate.Priority, Tags: &candidate.Tags, LocationPlaceholder: &candidate.LocationPlaceholder, LocationLatitude: &candidate.LocationLatitude,
		LocationLongitude: &candidate.LocationLongitude, LocationRadiusMeters: &candidate.LocationRadiusMeters, LocationTrigger: &candidate.LocationTrigger,
		SortOrder: &candidate.SortOrder, EarlyNotifiedTs: &nilTs, NotifiedTs: &nilTs,
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update reminder")
	}
	if existing.RowStatus != store.Archived && updated.RowStatus == store.Archived {
		if err := s.archiveReminderInboxes(ctx, user.ID, map[string]struct{}{updated.UID: {}}); err != nil {
			return nil, status.Errorf(codes.Internal, "failed to archive reminder notifications")
		}
	}
	lists, memoUIDs, err := s.reminderConversionData(ctx, []*store.Reminder{updated})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to load reminder relations")
	}
	return convertReminder(user, updated, lists, memoUIDs), nil
}

func (s *APIV1Service) DeleteReminder(ctx context.Context, request *v1pb.DeleteReminderRequest) (*emptypb.Empty, error) {
	user, value, err := s.resolveReminder(ctx, request.Name)
	if err != nil {
		return nil, err
	}
	if err := s.Store.DeleteReminder(ctx, &store.DeleteReminder{ID: value.ID, CreatorID: user.ID}); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to delete reminder")
	}
	if err := s.deleteReminderInboxes(ctx, user.ID, map[string]struct{}{value.UID: {}}); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to delete reminder notifications")
	}
	return &emptypb.Empty{}, nil
}

func (s *APIV1Service) deleteReminderInboxes(ctx context.Context, userID int32, reminderUIDs map[string]struct{}) error {
	messageType := storepb.InboxMessage_REMINDER
	inboxes, err := s.Store.ListInboxes(ctx, &store.FindInbox{ReceiverID: &userID, MessageType: &messageType})
	if err != nil {
		return err
	}
	for _, inbox := range inboxes {
		payload := inbox.Message.GetReminder()
		if payload == nil {
			continue
		}
		if _, ok := reminderUIDs[payload.ReminderUid]; !ok {
			continue
		}
		if err := s.Store.DeleteInbox(ctx, &store.DeleteInbox{ID: inbox.ID}); err != nil {
			return err
		}
	}
	return nil
}

func (s *APIV1Service) archiveReminderInboxes(ctx context.Context, userID int32, reminderUIDs map[string]struct{}) error {
	if len(reminderUIDs) == 0 {
		return nil
	}
	messageType := storepb.InboxMessage_REMINDER
	inboxes, err := s.Store.ListInboxes(ctx, &store.FindInbox{ReceiverID: &userID, MessageType: &messageType})
	if err != nil {
		return err
	}
	for _, inbox := range inboxes {
		payload := inbox.Message.GetReminder()
		if payload == nil {
			continue
		}
		if _, ok := reminderUIDs[payload.ReminderUid]; !ok {
			continue
		}
		if _, err := s.Store.UpdateInbox(ctx, &store.UpdateInbox{ID: inbox.ID, Status: store.ARCHIVED}); err != nil {
			return err
		}
	}
	return nil
}

func nextReminderDate(value *store.Reminder) (string, error) {
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
			allowed[time.Weekday(weekday)] = true
		}
		for day := 1; day <= 7*interval; day++ {
			candidate := current.AddDate(0, 0, day)
			weekIndex := (day - 1) / 7
			if weekIndex%interval == 0 && allowed[candidate.Weekday()] {
				current = candidate
				break
			}
		}
	case store.ReminderRecurrenceMonthly:
		current = addMonthsClamped(current, interval)
	case store.ReminderRecurrenceYearly:
		current = addYearsClamped(current, interval)
	default:
		return "", status.Errorf(codes.FailedPrecondition, "reminder does not repeat")
	}
	return current.Format(time.DateOnly), nil
}

func addMonthsClamped(value time.Time, months int) time.Time {
	target := time.Date(value.Year(), value.Month()+time.Month(months), 1, 0, 0, 0, 0, time.UTC)
	lastDay := target.AddDate(0, 1, -1).Day()
	day := value.Day()
	if day > lastDay {
		day = lastDay
	}
	return time.Date(target.Year(), target.Month(), day, 0, 0, 0, 0, time.UTC)
}

func addYearsClamped(value time.Time, years int) time.Time {
	targetYear := value.Year() + years
	day := value.Day()
	lastFebruaryDay := time.Date(targetYear, time.March, 1, 0, 0, 0, 0, time.UTC).AddDate(0, 0, -1).Day()
	if value.Month() == time.February && day == 29 && lastFebruaryDay != 29 {
		day = 28
	}
	return time.Date(targetYear, value.Month(), day, 0, 0, 0, 0, time.UTC)
}

func shiftReminderTime(value *store.Reminder, nextDate string) *int64 {
	if value.RemindTs == nil {
		return nil
	}
	location, err := time.LoadLocation(value.TimeZone)
	if err != nil {
		location = time.UTC
	}
	old := time.Unix(*value.RemindTs, 0).In(location)
	date, err := time.Parse(time.DateOnly, nextDate)
	if err != nil {
		return nil
	}
	nextSec := time.Date(date.Year(), date.Month(), date.Day(), old.Hour(), old.Minute(), old.Second(), 0, location).Unix()
	return &nextSec
}

func (s *APIV1Service) CompleteReminder(ctx context.Context, request *v1pb.CompleteReminderRequest) (*v1pb.Reminder, error) {
	user, value, err := s.resolveReminder(ctx, request.Name)
	if err != nil {
		return nil, err
	}
	if value.Status == store.ReminderCompleted {
		lists, memos, _ := s.reminderConversionData(ctx, []*store.Reminder{value})
		return convertReminder(user, value, lists, memos), nil
	}
	nowSec := time.Now().Unix()
	listRows, err := s.Store.ListReminderLists(ctx, &store.FindReminderList{ID: &value.ListID, CreatorID: &user.ID})
	if err != nil || len(listRows) == 0 {
		return nil, status.Errorf(codes.Internal, "failed to load reminder list")
	}
	list := listRows[0]
	if _, err := s.Store.CreateReminderOccurrence(ctx, &store.ReminderOccurrence{
		UID: uuid.NewString(), CreatorID: user.ID, ReminderUID: value.UID, ListUID: list.UID, ListName: list.Name, Title: value.Title,
		ScheduledDate: value.DueDate, RemindTs: value.RemindTs, CompletedTs: nowSec, Status: store.ReminderCompleted,
	}); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to record reminder completion")
	}
	count := value.CompletedOccurrences + 1
	statusValue := store.ReminderCompleted
	completedTs := &nowSec
	update := &store.UpdateReminder{ID: value.ID, CreatorID: user.ID, CompletedOccurrences: &count}
	if value.RecurrenceType != store.ReminderRecurrenceNone {
		nextDate, nextErr := nextReminderDate(value)
		finished := nextErr != nil || (value.RecurrenceMaxOccurrences > 0 && count >= value.RecurrenceMaxOccurrences) || (value.RecurrenceEndDate != "" && nextDate > value.RecurrenceEndDate)
		if !finished {
			statusValue = store.ReminderPending
			completedTs = nil
			nextTime := shiftReminderTime(value, nextDate)
			update.DueDate, update.RemindTs = &nextDate, &nextTime
			// The notification runner may already have delivered a later occurrence
			// while an older occurrence remained incomplete. Preserve those markers
			// so completing the backlog cannot redeliver the newer occurrence.
			if nextTime != nil {
				var nilTs *int64
				if value.EarlyNotifiedTs == nil || *value.EarlyNotifiedTs < *nextTime {
					update.EarlyNotifiedTs = &nilTs
				}
				if value.NotifiedTs == nil || *value.NotifiedTs < *nextTime {
					update.NotifiedTs = &nilTs
				}
			}
		}
	}
	update.Status, update.CompletedTs = &statusValue, &completedTs
	updated, err := s.Store.UpdateReminder(ctx, update)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to complete reminder")
	}
	if err := s.archiveReminderInboxes(ctx, user.ID, map[string]struct{}{updated.UID: {}}); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to archive reminder notifications")
	}
	lists, memoUIDs, err := s.reminderConversionData(ctx, []*store.Reminder{updated})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to load reminder relations")
	}
	return convertReminder(user, updated, lists, memoUIDs), nil
}

func (s *APIV1Service) ClearCompletedReminders(ctx context.Context, request *v1pb.ClearCompletedRemindersRequest) (*v1pb.ClearCompletedRemindersResponse, error) {
	user, err := s.authorizeReminderParent(ctx, request.Parent)
	if err != nil {
		return nil, err
	}
	completed, normal := store.ReminderCompleted, store.Normal
	values, err := s.Store.ListReminders(ctx, &store.FindReminder{CreatorID: &user.ID, RowStatus: &normal, Status: &completed})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list completed reminders")
	}
	var count int32
	archivedUIDs := map[string]struct{}{}
	for _, value := range values {
		archived := store.Archived
		if _, err := s.Store.UpdateReminder(ctx, &store.UpdateReminder{ID: value.ID, CreatorID: user.ID, RowStatus: &archived}); err != nil {
			return nil, status.Errorf(codes.Internal, "failed to archive completed reminders")
		}
		archivedUIDs[value.UID] = struct{}{}
		count++
	}
	if err := s.archiveReminderInboxes(ctx, user.ID, archivedUIDs); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to archive reminder notifications")
	}
	return &v1pb.ClearCompletedRemindersResponse{ClearedCount: count}, nil
}
