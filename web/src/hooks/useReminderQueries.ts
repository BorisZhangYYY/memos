import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { FieldMaskSchema } from "@bufbuild/protobuf/wkt";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { reminderServiceClient } from "@/connect";
import { userKeys } from "@/hooks/useUserQueries";
import { State } from "@/types/proto/api/v1/common_pb";
import { ListRemindersRequest_View, ReminderListSchema, ReminderSchema } from "@/types/proto/api/v1/reminder_service_pb";
import { generateUUID } from "@/utils/uuid";

type ReminderInput = MessageInitShape<typeof ReminderSchema>;
type ReminderListInput = MessageInitShape<typeof ReminderListSchema>;

export const reminderKeys = {
  all: ["reminders"] as const,
  lists: (parent: string) => [...reminderKeys.all, "lists", parent] as const,
  items: (parent: string, view: ListRemindersRequest_View, state: State, reminderList: string, query: string, timeZone: string) =>
    [...reminderKeys.all, "items", parent, view, state, reminderList, query, timeZone] as const,
};

export const useReminderLists = (parent?: string) =>
  useQuery({
    queryKey: reminderKeys.lists(parent ?? ""),
    queryFn: () => reminderServiceClient.listReminderLists({ parent, state: State.NORMAL }),
    enabled: !!parent,
    select: (response) => response.reminderLists,
  });

export const useReminders = (
  parent: string | undefined,
  options: {
    view?: ListRemindersRequest_View;
    reminderList?: string;
    query?: string;
    timeZone?: string;
    state?: State;
    enabled?: boolean;
  } = {},
) => {
  const view = options.view ?? ListRemindersRequest_View.ALL;
  const reminderList = options.reminderList ?? "";
  const query = options.query ?? "";
  const timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const state = options.state ?? State.NORMAL;
  return useQuery({
    queryKey: reminderKeys.items(parent ?? "", view, state, reminderList, query, timeZone),
    queryFn: () => reminderServiceClient.listReminders({ parent, view, reminderList, query, timeZone, state }),
    enabled: !!parent && (options.enabled ?? true),
    select: (response) => response.reminders,
    refetchInterval: 30_000,
  });
};

const useInvalidateReminders = () => {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: reminderKeys.all }),
      queryClient.invalidateQueries({ queryKey: userKeys.notifications() }),
    ]);
};

export const useCreateReminderList = () => {
  const invalidate = useInvalidateReminders();
  return useMutation({
    mutationFn: ({ parent, reminderList }: { parent: string; reminderList: ReminderListInput }) =>
      reminderServiceClient.createReminderList({
        parent,
        reminderList: create(ReminderListSchema, reminderList),
        reminderListId: generateUUID(),
      }),
    onSuccess: invalidate,
  });
};

export const useUpdateReminderList = () => {
  const invalidate = useInvalidateReminders();
  return useMutation({
    mutationFn: ({ reminderList, updateMask }: { reminderList: ReminderListInput; updateMask: string[] }) =>
      reminderServiceClient.updateReminderList({
        reminderList: create(ReminderListSchema, reminderList),
        updateMask: create(FieldMaskSchema, { paths: updateMask }),
      }),
    onSuccess: invalidate,
  });
};

export const useDeleteReminderList = () => {
  const invalidate = useInvalidateReminders();
  return useMutation({
    mutationFn: (name: string) => reminderServiceClient.deleteReminderList({ name }),
    onSuccess: invalidate,
  });
};

export const useCreateReminder = () => {
  const invalidate = useInvalidateReminders();
  return useMutation({
    mutationFn: ({ parent, reminder }: { parent: string; reminder: ReminderInput }) =>
      reminderServiceClient.createReminder({ parent, reminder: create(ReminderSchema, reminder), reminderId: generateUUID() }),
    onSuccess: invalidate,
  });
};

export const useUpdateReminder = () => {
  const invalidate = useInvalidateReminders();
  return useMutation({
    mutationFn: ({ reminder, updateMask }: { reminder: ReminderInput; updateMask: string[] }) =>
      reminderServiceClient.updateReminder({
        reminder: create(ReminderSchema, reminder),
        updateMask: create(FieldMaskSchema, { paths: updateMask }),
      }),
    onSuccess: invalidate,
  });
};

export const useCompleteReminder = () => {
  const invalidate = useInvalidateReminders();
  return useMutation({
    mutationFn: (name: string) => reminderServiceClient.completeReminder({ name }),
    onSuccess: invalidate,
  });
};

export const useDeleteReminder = () => {
  const invalidate = useInvalidateReminders();
  return useMutation({
    mutationFn: (name: string) => reminderServiceClient.deleteReminder({ name }),
    onSuccess: invalidate,
  });
};

export const useArchiveCompletedReminders = () => {
  const invalidate = useInvalidateReminders();
  return useMutation({
    mutationFn: (parent: string) => reminderServiceClient.clearCompletedReminders({ parent }),
    onSuccess: invalidate,
  });
};
