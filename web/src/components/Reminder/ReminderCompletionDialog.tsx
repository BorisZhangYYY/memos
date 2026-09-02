import { useEffect, useState } from "react";
import { ReminderDatePicker } from "@/components/Reminder/ReminderDateTimePicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Reminder } from "@/types/proto/api/v1/reminder_service_pb";
import { useTranslate } from "@/utils/i18n";
import { dateKeyInTimeZone } from "@/utils/reminder-overdue";

interface Props {
  reminder?: Reminder;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (completionDate: string) => Promise<void>;
}

const ReminderCompletionDialog = ({ reminder, pending, onOpenChange, onConfirm }: Props) => {
  const t = useTranslate();
  const [completionDate, setCompletionDate] = useState("");
  const today = dateKeyInTimeZone(new Date(), reminder?.timeZone ?? "");

  useEffect(() => {
    if (reminder) setCompletionDate(reminder.dueDate);
  }, [reminder]);

  const invalidDate = !completionDate || completionDate < (reminder?.dueDate ?? "") || completionDate > today;

  return (
    <Dialog open={!!reminder} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("reminder.complete-on-date")}</DialogTitle>
          <DialogDescription>{t("reminder.complete-on-date-description")}</DialogDescription>
        </DialogHeader>
        <ReminderDatePicker value={completionDate} onChange={setCompletionDate} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={invalidDate || pending}
            onClick={async () => {
              await onConfirm(completionDate);
              onOpenChange(false);
            }}
          >
            {t("reminder.complete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReminderCompletionDialog;
