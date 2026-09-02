import { Reminder_Status } from "@/types/proto/api/v1/reminder_service_pb";

type ReminderDueState = {
  dueDate: string;
  timeZone: string;
  status: Reminder_Status;
};

const localDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const dateKeyInTimeZone = (date: Date, timeZone: string) => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (values.year && values.month && values.day) return `${values.year}-${values.month}-${values.day}`;
  } catch {
    // Fall back to the browser calendar when an old reminder has an invalid zone.
  }
  return localDateKey(date);
};

export const isReminderOverdue = (reminder: ReminderDueState, now = new Date()) =>
  reminder.status === Reminder_Status.PENDING && !!reminder.dueDate && reminder.dueDate < dateKeyInTimeZone(now, reminder.timeZone);
