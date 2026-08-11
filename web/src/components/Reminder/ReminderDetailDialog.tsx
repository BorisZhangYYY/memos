import { create } from "@bufbuild/protobuf";
import { timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { ArchiveIcon, FileTextIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Link, useLocation } from "react-router-dom";
import ConfirmDialog from "@/components/ConfirmDialog";
import { ReminderDatePicker, ReminderTimePicker } from "@/components/Reminder/ReminderDateTimePicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCreateReminder, useDeleteReminder, useUpdateReminder } from "@/hooks/useReminderQueries";
import { State } from "@/types/proto/api/v1/common_pb";
import {
  type Reminder,
  Reminder_Priority,
  type ReminderList,
  ReminderRecurrence_Frequency,
  ReminderRecurrenceSchema,
} from "@/types/proto/api/v1/reminder_service_pb";
import { useTranslate } from "@/utils/i18n";

interface Props {
  reminder?: Reminder;
  draft?: ReminderDraft;
  lists: ReminderList[];
  parent: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface ReminderDraft {
  title?: string;
  reminderList?: string;
  dueDate?: string;
  flagged?: boolean;
}

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatTimeInput = (date: Date) => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

const defaultListLabel = (list: ReminderList, translatedDefault: string) =>
  list.name.endsWith("/reminderLists/default") ? translatedDefault : list.displayName;

const ReminderDetailDialog = ({ reminder, draft, lists, parent, open, onOpenChange }: Props) => {
  const t = useTranslate();
  const location = useLocation();
  const createReminder = useCreateReminder();
  const updateReminder = useUpdateReminder();
  const deleteReminder = useDeleteReminder();

  const [title, setTitle] = useState("");
  const [listName, setListName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [advance, setAdvance] = useState("0");
  const [frequency, setFrequency] = useState("0");
  const [flagged, setFlagged] = useState(false);
  const [priority, setPriority] = useState("0");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const frequencyLabel =
    frequency === "1"
      ? t("reminder.daily")
      : frequency === "2"
        ? t("reminder.weekly")
        : frequency === "3"
          ? t("reminder.monthly")
          : frequency === "4"
            ? t("reminder.yearly")
            : t("reminder.never");
  const advanceLabel =
    advance === "300"
      ? t("reminder.minutes-before", { count: 5 })
      : advance === "900"
        ? t("reminder.minutes-before", { count: 15 })
        : advance === "3600"
          ? t("reminder.hours-before", { count: 1 })
          : advance === "86400"
            ? t("reminder.days-before", { count: 1 })
            : t("reminder.none");
  const priorityLabel = priority === "1" ? "!" : priority === "2" ? "!!" : priority === "3" ? "!!!" : t("reminder.none");
  const selectedList = lists.find((list) => list.name === listName);
  const archived = reminder?.state === State.ARCHIVED;
  const returnLocation = `${location.pathname}${location.search}${location.hash}`;

  useEffect(() => {
    if (!open) return;
    const remindDate = reminder?.remindTime ? timestampDate(reminder.remindTime) : undefined;
    setTitle(reminder?.title ?? draft?.title ?? "");
    setListName(reminder?.reminderList ?? draft?.reminderList ?? lists[0]?.name ?? "");
    setDueDate(reminder?.dueDate || draft?.dueDate || (remindDate ? formatDateInput(remindDate) : ""));
    setRemindAt(remindDate ? formatTimeInput(remindDate) : "");
    setAdvance(String(reminder?.advanceNoticeSeconds ?? 0));
    setFrequency(String(reminder?.recurrence?.frequency ?? 0));
    setFlagged(reminder?.flagged ?? draft?.flagged ?? false);
    setPriority(String(reminder?.priority ?? 0));
  }, [draft, lists, open, reminder]);

  const handleSave = async () => {
    if (!title.trim() || !listName) return;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const remindTime = dueDate && remindAt ? timestampFromDate(new Date(`${dueDate}T${remindAt}:00`)) : undefined;
    const recurrenceFrequency = Number(frequency) as ReminderRecurrence_Frequency;
    const reminderFields = {
      title: title.trim(),
      reminderList: listName,
      dueDate,
      remindTime,
      timeZone,
      advanceNoticeSeconds: remindTime ? BigInt(advance) : 0n,
      recurrence:
        recurrenceFrequency === ReminderRecurrence_Frequency.FREQUENCY_UNSPECIFIED
          ? undefined
          : create(ReminderRecurrenceSchema, {
              frequency: recurrenceFrequency,
              interval: 1,
              weekdays:
                recurrenceFrequency === ReminderRecurrence_Frequency.WEEKLY && dueDate ? [new Date(`${dueDate}T12:00:00`).getDay()] : [],
            }),
      flagged,
      priority: Number(priority) as Reminder_Priority,
    };
    if (reminder) {
      await updateReminder.mutateAsync({
        reminder: { name: reminder.name, ...reminderFields },
        updateMask: [
          "title",
          "reminder_list",
          "due_date",
          "remind_time",
          "time_zone",
          "advance_notice_seconds",
          "recurrence",
          "flagged",
          "priority",
        ],
      });
    } else {
      await createReminder.mutateAsync({ parent, reminder: reminderFields });
    }
    toast.success(t("reminder.saved"));
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!reminder) return;
    await deleteReminder.mutateAsync(reminder.name);
    toast.success(t("reminder.deleted"));
    onOpenChange(false);
  };

  const handleArchive = async () => {
    if (!reminder || archived) return;
    await updateReminder.mutateAsync({
      reminder: { name: reminder.name, state: State.ARCHIVED },
      updateMask: ["state"],
    });
    toast.success(t("reminder.archived"));
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="lg" className="p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>{t("reminder.details")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-5 pb-2">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} className="h-10 text-base font-medium" />

            {reminder?.memo && (
              <Button
                nativeButton={false}
                variant="outline"
                className="w-full justify-start"
                render={<Link to={`/${reminder.memo}`} state={{ from: returnLocation }} />}
              >
                <FileTextIcon className="size-4 text-primary" />
                {t("reminder.open-linked-memo")}
              </Button>
            )}

            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("reminder.date-and-time")}</h3>
              <div className="grid grid-cols-1 gap-3 rounded-xl bg-muted/50 p-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span>{t("reminder.date")}</span>
                  <ReminderDatePicker value={dueDate} onChange={setDueDate} />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t("reminder.time")}</span>
                  <ReminderTimePicker value={remindAt} onChange={setRemindAt} disabled={!dueDate} />
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t("reminder.repeat")}</span>
                  <Select value={frequency} onValueChange={setFrequency} disabled={!dueDate}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{frequencyLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">{t("reminder.never")}</SelectItem>
                      <SelectItem value="1">{t("reminder.daily")}</SelectItem>
                      <SelectItem value="2">{t("reminder.weekly")}</SelectItem>
                      <SelectItem value="3">{t("reminder.monthly")}</SelectItem>
                      <SelectItem value="4">{t("reminder.yearly")}</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t("reminder.advance-notice")}</span>
                  <Select value={advance} onValueChange={setAdvance} disabled={!remindAt}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{advanceLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">{t("reminder.none")}</SelectItem>
                      <SelectItem value="300">{t("reminder.minutes-before", { count: 5 })}</SelectItem>
                      <SelectItem value="900">{t("reminder.minutes-before", { count: 15 })}</SelectItem>
                      <SelectItem value="3600">{t("reminder.hours-before", { count: 1 })}</SelectItem>
                      <SelectItem value="86400">{t("reminder.days-before", { count: 1 })}</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <p className="text-xs text-muted-foreground">{t("reminder.time-independent-description")}</p>
            </section>
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("reminder.organize")}</h3>
              <div className="grid gap-3 rounded-xl bg-muted/50 p-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span>{t("reminder.list")}</span>
                  <Select value={listName} onValueChange={setListName}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{selectedList ? defaultListLabel(selectedList, t("common.reminders")) : ""}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {lists.map((list) => (
                        <SelectItem key={list.name} value={list.name}>
                          {defaultListLabel(list, t("common.reminders"))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t("reminder.priority")}</span>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{priorityLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">{t("reminder.none")}</SelectItem>
                      <SelectItem value="1">!</SelectItem>
                      <SelectItem value="2">!!</SelectItem>
                      <SelectItem value="3">!!!</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm sm:col-span-2">
                  <span>{t("reminder.flagged")}</span>
                  <Switch checked={flagged} onCheckedChange={setFlagged} />
                </label>
              </div>
            </section>
          </div>
          <DialogFooter className="border-t px-5 py-4">
            {reminder && (
              <div className="flex gap-2 sm:mr-auto">
                {!archived && (
                  <Button type="button" variant="outline" onClick={handleArchive}>
                    <ArchiveIcon className="size-4" />
                    {t("common.archive")}
                  </Button>
                )}
                <Button type="button" variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>
                  <Trash2Icon className="size-4" />
                  {t("common.delete")}
                </Button>
              </div>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!title.trim() || !listName || createReminder.isPending || updateReminder.isPending}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={t("reminder.delete-confirm")}
        description={t("reminder.delete-confirm-description")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={handleDelete}
        confirmVariant="destructive"
      />
    </>
  );
};

export default ReminderDetailDialog;
