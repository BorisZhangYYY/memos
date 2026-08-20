import { isDefaultReminderList } from "@/components/Reminder/ReminderListIcon";

const STORAGE_KEY_PREFIX = "memos-reminder-selected-list:";

type ReminderListReference = {
  name: string;
};

const storageKey = (parent: string) => `${STORAGE_KEY_PREFIX}${parent}`;

export const readRememberedReminderList = (parent: string): string => {
  try {
    return localStorage.getItem(storageKey(parent)) ?? "";
  } catch {
    return "";
  }
};

export const rememberReminderList = (parent: string, name: string): void => {
  try {
    localStorage.setItem(storageKey(parent), name);
  } catch {
    // Selection persistence is an enhancement; the reminder center still works
    // when storage is blocked or unavailable.
  }
};

export const resolveReminderListSelection = (lists: ReminderListReference[], rememberedName = ""): string => {
  if (rememberedName && lists.some((list) => list.name === rememberedName)) {
    return rememberedName;
  }
  return lists.find((list) => isDefaultReminderList(list.name))?.name ?? lists[0]?.name ?? "";
};
