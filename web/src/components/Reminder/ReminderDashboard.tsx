import { CheckIcon, FlagIcon, ListIcon, PencilIcon } from "lucide-react";
import { useMemo } from "react";
import ReminderMetadata from "@/components/Reminder/ReminderMetadata";
import { Button } from "@/components/ui/button";
import { useCompleteReminder, useReminderLists, useReminders } from "@/hooks/useReminderQueries";
import { cn } from "@/lib/utils";
import { ListRemindersRequest_View, Reminder_Priority } from "@/types/proto/api/v1/reminder_service_pb";
import { useTranslate } from "@/utils/i18n";

const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

interface Props {
  parent: string;
  onOpenCenter: () => void;
  onOpenReminder: (reminderName: string) => void;
}

const ReminderDashboard = ({ parent, onOpenCenter, onOpenReminder }: Props) => {
  const t = useTranslate();
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const { data: reminders = [] } = useReminders(parent, { view: ListRemindersRequest_View.ALL, timeZone });
  const { data: lists = [] } = useReminderLists(parent);
  const completeReminder = useCompleteReminder();
  const today = localDate();
  const dueToday = reminders.filter((reminder) => reminder.dueDate && reminder.dueDate <= today);
  const scheduled = reminders.filter((reminder) => reminder.dueDate || reminder.remindTime);
  const flagged = reminders.filter((reminder) => reminder.flagged);
  const preview = [...reminders].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) {
      const aSeconds = a.createTime?.seconds ?? 0n;
      const bSeconds = b.createTime?.seconds ?? 0n;
      return aSeconds === bSeconds ? 0 : aSeconds < bSeconds ? 1 : -1;
    }
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });
  const listByName = useMemo(() => new Map(lists.map((list) => [list.name, list])), [lists]);

  return (
    <div className="flex h-full min-h-0 flex-col p-3 text-card-foreground">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-base font-semibold">
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
              {t("mood.chart.today")}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", weekday: "short" }).format(new Date())}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onOpenCenter}>
          <ListIcon />
          {t("reminder.view-all")}
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: t("reminder.due-today"), value: dueToday.length, className: "text-blue-500" },
          { label: t("reminder.scheduled"), value: scheduled.length, className: "text-rose-500" },
          { label: t("reminder.flagged"), value: flagged.length, className: "text-orange-500" },
          { label: t("reminder.pending"), value: reminders.length, className: "text-foreground" },
        ].map((item) => (
          <div key={item.label} className="min-w-0 rounded-lg bg-muted/50 p-2.5">
            <div className="truncate text-xs text-muted-foreground">{item.label}</div>
            <div className={cn("mt-1 truncate font-mono text-base font-semibold", item.className)}>{item.value}</div>
          </div>
        ))}
      </div>

      {preview.length === 0 ? (
        <div className="flex min-h-24 flex-1 items-center justify-center text-sm text-muted-foreground">
          {t("reminder.dashboard-empty")}
        </div>
      ) : (
        <div className="mt-2 min-h-0 flex-1 divide-y overflow-y-auto rounded-lg border bg-background/60">
          {preview.map((reminder) => {
            const list = listByName.get(reminder.reminderList);
            return (
              <div key={reminder.name} className="group flex items-start gap-2 px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => completeReminder.mutate(reminder.name)}
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/30 hover:border-primary"
                  aria-label={t("reminder.complete")}
                >
                  <CheckIcon className="size-3 opacity-0 group-hover:opacity-30" />
                </button>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpenReminder(reminder.name)}>
                  <span className="flex items-start gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm">{reminder.title}</span>
                    <span className="flex h-6 shrink-0 items-center gap-1">
                      {reminder.priority !== Reminder_Priority.PRIORITY_UNSPECIFIED && (
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-primary/10 px-1 text-xs font-semibold leading-none text-primary">
                          {"!".repeat(reminder.priority)}
                        </span>
                      )}
                      {reminder.flagged && (
                        <span className="inline-flex size-6 items-center justify-center rounded-md bg-orange-400/10 text-orange-500">
                          <FlagIcon className="size-3.5 fill-current" />
                        </span>
                      )}
                    </span>
                  </span>
                  <ReminderMetadata reminder={reminder} list={list} className="mt-0.5 gap-y-0.5 text-[11px]" />
                </button>
                <button
                  type="button"
                  className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  onClick={() => onOpenReminder(reminder.name)}
                  aria-label={`${t("common.edit")}: ${reminder.title}`}
                  title={t("common.edit")}
                >
                  <PencilIcon className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ReminderDashboard;
