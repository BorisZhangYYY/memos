import { timestampDate } from "@bufbuild/protobuf/wkt";
import { AlarmClockIcon, BellRingIcon, CalendarDaysIcon, CheckCheckIcon, FileTextIcon, Repeat2Icon } from "lucide-react";
import ReminderListIcon from "@/components/Reminder/ReminderListIcon";
import { cn } from "@/lib/utils";
import { type Reminder, type ReminderList, ReminderRecurrence_Frequency } from "@/types/proto/api/v1/reminder_service_pb";
import { useTranslate } from "@/utils/i18n";

interface Props {
  reminder: Reminder;
  list?: ReminderList;
  className?: string;
}

const formatAdvanceNotice = (seconds: bigint, t: ReturnType<typeof useTranslate>) => {
  const value = Number(seconds);
  if (value >= 86_400 && value % 86_400 === 0) return t("reminder.days-before", { count: value / 86_400 });
  if (value >= 3_600 && value % 3_600 === 0) return t("reminder.hours-before", { count: value / 3_600 });
  return t("reminder.minutes-before", { count: Math.max(1, Math.round(value / 60)) });
};

const ReminderMetadata = ({ reminder, list, className }: Props) => {
  const t = useTranslate();
  const remindTime = reminder.remindTime ? timestampDate(reminder.remindTime) : undefined;
  const completionTime = reminder.completionTime ? timestampDate(reminder.completionTime) : undefined;
  const recurrenceLabel =
    reminder.recurrence?.frequency === ReminderRecurrence_Frequency.DAILY
      ? t("reminder.daily")
      : reminder.recurrence?.frequency === ReminderRecurrence_Frequency.WEEKLY
        ? t("reminder.weekly")
        : reminder.recurrence?.frequency === ReminderRecurrence_Frequency.MONTHLY
          ? t("reminder.monthly")
          : reminder.recurrence?.frequency === ReminderRecurrence_Frequency.YEARLY
            ? t("reminder.yearly")
            : undefined;
  const listLabel = list?.name.endsWith("/reminderLists/default") ? t("common.reminders") : list?.displayName;

  return (
    <span className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground", className)}>
      {listLabel && (
        <span className="inline-flex items-center gap-1">
          <ReminderListIcon icon={list?.icon} className="size-3" style={{ color: list?.color || "#0A84FF" }} />
          {listLabel}
        </span>
      )}
      {reminder.dueDate && (
        <span className="inline-flex items-center gap-1">
          <CalendarDaysIcon className="size-3" />
          {reminder.dueDate}
        </span>
      )}
      {remindTime && (
        <span className="inline-flex items-center gap-1">
          <AlarmClockIcon className="size-3" />
          {remindTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
      {remindTime && reminder.advanceNoticeSeconds > 0n && (
        <span className="inline-flex items-center gap-1">
          <BellRingIcon className="size-3" />
          {formatAdvanceNotice(reminder.advanceNoticeSeconds, t)}
        </span>
      )}
      {recurrenceLabel && (
        <span className="inline-flex items-center gap-1">
          <Repeat2Icon className="size-3" />
          {recurrenceLabel}
        </span>
      )}
      {reminder.memo && (
        <span className="inline-flex items-center gap-1 text-primary">
          <FileTextIcon className="size-3" /> Memo
        </span>
      )}
      {completionTime && (
        <span className="inline-flex items-center gap-1">
          <CheckCheckIcon className="size-3" />
          {t("reminder.completed-at", { time: completionTime.toLocaleString() })}
        </span>
      )}
    </span>
  );
};

export default ReminderMetadata;
