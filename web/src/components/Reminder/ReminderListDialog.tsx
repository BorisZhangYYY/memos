import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import ReminderListIcon, {
  isDefaultReminderList,
  normalizeReminderListIcon,
  REMINDER_LIST_ICON_OPTIONS,
} from "@/components/Reminder/ReminderListIcon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ReminderList } from "@/types/proto/api/v1/reminder_service_pb";
import { useTranslate } from "@/utils/i18n";

export const REMINDER_LIST_COLORS = [
  "#FF453A",
  "#FF9F0A",
  "#FFD60A",
  "#30D158",
  "#64D2FF",
  "#0A84FF",
  "#5E5CE6",
  "#BF5AF2",
  "#FF375F",
  "#8E8E93",
  "#AC8E68",
  "#636366",
] as const;

export interface ReminderListDialogValue {
  displayName: string;
  color: string;
  icon: string;
}

interface Props {
  open: boolean;
  list?: ReminderList;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (value: ReminderListDialogValue) => Promise<void>;
}

const ReminderListDialog = ({ open, list, pending = false, onOpenChange, onSave }: Props) => {
  const t = useTranslate();
  const defaultList = !!list && isDefaultReminderList(list.name);
  const defaultDisplayName = t("common.reminders");
  const [displayName, setDisplayName] = useState("");
  const [color, setColor] = useState<string>(REMINDER_LIST_COLORS[5]);
  const [icon, setIcon] = useState("list");

  useEffect(() => {
    if (!open) return;
    setDisplayName(defaultList ? defaultDisplayName : (list?.displayName ?? ""));
    setColor(list?.color || REMINDER_LIST_COLORS[5]);
    setIcon(normalizeReminderListIcon(list?.icon));
  }, [defaultDisplayName, defaultList, list, open]);

  const submit = async () => {
    const normalizedName = displayName.trim();
    if (!defaultList && !normalizedName) return;
    try {
      await onSave({
        displayName: defaultList ? list?.displayName || defaultDisplayName : normalizedName,
        color,
        icon,
      });
      onOpenChange(false);
    } catch {
      toast.error(t("reminder.save-failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4 sm:px-6">
          <DialogTitle>{list ? t("reminder.edit-list") : t("reminder.new-list")}</DialogTitle>
        </DialogHeader>

        <form
          className="flex flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-6 px-5 py-5 sm:px-6">
            <div className="flex items-center gap-3">
              <span
                className="flex size-12 shrink-0 items-center justify-center rounded-full text-white shadow-sm"
                style={{ backgroundColor: color }}
              >
                <ReminderListIcon icon={icon} className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <label htmlFor="reminder-list-name" className="mb-1.5 block text-sm font-medium">
                  {t("reminder.list-name")}
                </label>
                <Input
                  id="reminder-list-name"
                  autoFocus={!defaultList}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  disabled={defaultList}
                  placeholder={t("reminder.list-name")}
                />
              </div>
            </div>

            <fieldset>
              <legend className="mb-2.5 text-sm font-medium">{t("reminder.list-color")}</legend>
              <div className="flex flex-wrap gap-2.5">
                {REMINDER_LIST_COLORS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-105",
                      color === option && "ring-2 ring-primary",
                    )}
                    style={{ backgroundColor: option }}
                    onClick={() => setColor(option)}
                    aria-label={`${t("reminder.list-color")}: ${option}`}
                    aria-pressed={color === option}
                  >
                    <span className={cn("size-2 rounded-full bg-white", color !== option && "opacity-0")} />
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2.5 text-sm font-medium">{t("reminder.list-icon-label")}</legend>
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-9">
                {REMINDER_LIST_ICON_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground",
                      icon === option.value && "text-white ring-2 ring-primary ring-offset-2 ring-offset-background",
                    )}
                    style={icon === option.value ? { backgroundColor: color } : undefined}
                    onClick={() => setIcon(option.value)}
                    aria-label={t(option.labelKey)}
                    aria-pressed={icon === option.value}
                    title={t(option.labelKey)}
                  >
                    <option.icon className="size-4" />
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <DialogFooter className="border-t px-5 py-4 sm:px-6">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={pending || (!defaultList && !displayName.trim())}>
              {list ? t("common.save") : t("common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ReminderListDialog;
