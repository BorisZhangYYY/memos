import { BellRingIcon, CheckIcon } from "lucide-react";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { MAX_REMINDERS_PER_MEMO } from "@/components/Reminder/constants";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Reminder } from "@/types/proto/api/v1/reminder_service_pb";
import { useTranslate } from "@/utils/i18n";

interface Props {
  reminders: Reminder[];
  linkedReminderNames: string[];
  onChange: (names: string[]) => void;
}

const ReminderSelector = ({ reminders, linkedReminderNames, onChange }: Props) => {
  const t = useTranslate();
  const [query, setQuery] = useState("");
  const linkedSet = useMemo(() => new Set(linkedReminderNames), [linkedReminderNames]);
  const filteredReminders = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return reminders;
    return reminders.filter((reminder) => reminder.title.toLocaleLowerCase().includes(normalized));
  }, [query, reminders]);

  const toggleReminder = (name: string) => {
    const next = new Set(linkedReminderNames);
    if (next.has(name)) next.delete(name);
    else if (next.size >= MAX_REMINDERS_PER_MEMO) {
      toast.error(t("reminder.link-limit", { count: MAX_REMINDERS_PER_MEMO }));
      return;
    } else next.add(name);
    onChange([...next]);
  };

  return (
    <Popover>
      <PopoverTrigger
        nativeButton={false}
        render={
          <span
            className={cn(
              "relative flex size-7 cursor-pointer items-center justify-center rounded-full border text-muted-foreground transition-all hover:opacity-80",
              linkedReminderNames.length > 0 && "border-primary/40 bg-primary/10 text-primary",
            )}
          />
        }
        aria-label={t("reminder.link-existing-reminder")}
        title={t("reminder.link-existing-reminder")}
      >
        <BellRingIcon className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-80 p-2">
        <div className="mb-2 flex items-center justify-between px-1 text-xs text-muted-foreground">
          <span>{t("reminder.link-existing-reminder")}</span>
          <span className="tabular-nums">
            {linkedReminderNames.length} / {MAX_REMINDERS_PER_MEMO}
          </span>
        </div>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("reminder.search")} className="mb-2" />
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {filteredReminders.length === 0 ? (
            <p className="px-2 py-5 text-center text-xs text-muted-foreground">{t("reminder.no-linkable-reminders")}</p>
          ) : (
            filteredReminders.map((reminder) => (
              <button
                key={reminder.name}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
                  linkedSet.has(reminder.name) && "bg-primary/10 text-primary",
                  !linkedSet.has(reminder.name) && linkedReminderNames.length >= MAX_REMINDERS_PER_MEMO && "opacity-45",
                )}
                onClick={() => toggleReminder(reminder.name)}
              >
                <span className="flex size-4 shrink-0 items-center justify-center rounded border">
                  {linkedSet.has(reminder.name) && <CheckIcon className="size-3" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{reminder.title}</span>
                {reminder.dueDate && <span className="shrink-0 text-xs text-muted-foreground">{reminder.dueDate}</span>}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ReminderSelector;
