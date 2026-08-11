import { create } from "@bufbuild/protobuf";
import { FieldMaskSchema, timestampDate } from "@bufbuild/protobuf/wkt";
import { useQueryClient } from "@tanstack/react-query";
import { AlarmClockIcon, CheckIcon, TrashIcon } from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { userServiceClient } from "@/connect";
import { userKeys } from "@/hooks/useUserQueries";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/router/routes";
import { type UserNotification, UserNotification_Status } from "@/types/proto/api/v1/user_service_pb";
import { useTranslate } from "@/utils/i18n";

interface Props {
  notification: UserNotification;
}

const ReminderMessage = ({ notification }: Props) => {
  const t = useTranslate();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const payload = notification.payload.case === "reminder" ? notification.payload.value : undefined;
  const unread = notification.status === UserNotification_Status.UNREAD;

  const archive = async (silence = false) => {
    const updated = await userServiceClient.updateUserNotification({
      notification: { name: notification.name, status: UserNotification_Status.ARCHIVED },
      updateMask: create(FieldMaskSchema, { paths: ["status"] }),
    });
    queryClient.setQueryData<UserNotification[]>(userKeys.notifications(), (current) =>
      current?.map((item) => (item.name === updated.name ? updated : item)),
    );
    if (!silence) toast.success(t("message.archived-successfully"));
  };

  const remove = async () => {
    await userServiceClient.deleteUserNotification({ name: notification.name });
    queryClient.setQueryData<UserNotification[]>(userKeys.notifications(), (current) =>
      current?.filter((item) => item.name !== notification.name),
    );
    toast.success(t("message.deleted-successfully"));
  };

  if (!payload) return null;
  const uid = payload.reminder.split("/").at(-1) ?? "";
  const remindTime = payload.remindTime ? timestampDate(payload.remindTime) : undefined;
  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 border-b border-border/60 px-5 py-4 last:border-b-0",
        unread ? "bg-primary/[0.03]" : "hover:bg-muted/30",
      )}
    >
      {unread && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" />}
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
        <AlarmClockIcon className="size-5" />
      </div>
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={async () => {
          navigate(`${ROUTES.HOME}?reminders=1&selected=${encodeURIComponent(uid)}`);
          if (unread) await archive(true);
        }}
      >
        <div className="font-semibold">{payload.early ? t("reminder.early-notification") : t("reminder.due-notification")}</div>
        <div className="mt-1 text-sm text-foreground/90">{payload.title}</div>
        {remindTime && <div className="mt-1 text-xs text-muted-foreground">{remindTime.toLocaleString()}</div>}
      </button>
      <button
        type="button"
        onClick={() => (unread ? archive() : remove())}
        className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
        aria-label={unread ? t("common.archive") : t("common.delete")}
      >
        {unread ? <CheckIcon className="size-4" /> : <TrashIcon className="size-4" />}
      </button>
    </div>
  );
};

export default ReminderMessage;
