import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Reminders from "@/pages/Reminders";
import { useTranslate } from "@/utils/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenReminder: (reminderName: string) => void;
}

const ReminderCenterDialog = ({ open, onOpenChange, onOpenReminder }: Props) => {
  const t = useTranslate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="full"
        className="h-[min(42rem,calc(100dvh-2rem))] overflow-hidden p-0 sm:h-[min(42rem,calc(100dvh-3rem))] md:h-[min(42rem,calc(100dvh-4rem))] md:max-w-4xl [&>div:first-child]:min-h-0 [&>div:first-child]:gap-0 [&>div:first-child]:overflow-hidden"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t("reminder.dashboard-title")}</DialogTitle>
          <DialogDescription>{t("reminder.time-independent-description")}</DialogDescription>
        </DialogHeader>
        <Reminders embedded onOpenReminder={onOpenReminder} />
      </DialogContent>
    </Dialog>
  );
};

export default ReminderCenterDialog;
