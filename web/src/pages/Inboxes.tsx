import { timestampDate } from "@bufbuild/protobuf/wkt";
import { useQueryClient } from "@tanstack/react-query";
import { sortBy } from "lodash-es";
import { BellIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "react-hot-toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import MemoCommentMessage from "@/components/Inbox/MemoCommentMessage";
import MemoMentionMessage from "@/components/Inbox/MemoMentionMessage";
import ReminderMessage from "@/components/Inbox/ReminderMessage";
import Placeholder from "@/components/Placeholder";
import { Button } from "@/components/ui/button";
import { userServiceClient } from "@/connect";
import { useAppSidebar } from "@/contexts/AppSidebarContext";
import usePersonalFeatures from "@/hooks/usePersonalFeatures";
import { useNotifications, userKeys } from "@/hooks/useUserQueries";
import { UserNotification, UserNotification_Status, UserNotification_Type } from "@/types/proto/api/v1/user_service_pb";
import { useTranslate } from "@/utils/i18n";

const Inboxes = () => {
  const t = useTranslate();
  const { inboxFilter: filter } = useAppSidebar();
  const { remindersEnabled } = usePersonalFeatures();
  const queryClient = useQueryClient();
  const [deleteArchivedOpen, setDeleteArchivedOpen] = useState(false);

  // Fetch notifications with React Query
  const { data: fetchedNotifications = [] } = useNotifications();

  const visibleNotifications = remindersEnabled
    ? fetchedNotifications
    : fetchedNotifications.filter((notification) => notification.type !== UserNotification_Type.REMINDER);
  const allNotifications = sortBy(visibleNotifications, (notification: UserNotification) => {
    return -((notification.createTime ? timestampDate(notification.createTime) : undefined)?.getTime() || 0);
  });

  const notifications = allNotifications.filter((notification) => {
    if (filter === "unread") return notification.status === UserNotification_Status.UNREAD;
    if (filter === "archived") return notification.status === UserNotification_Status.ARCHIVED;
    return notification.status !== UserNotification_Status.ARCHIVED;
  });

  const unreadCount = allNotifications.filter((n) => n.status === UserNotification_Status.UNREAD).length;
  const archivedNames = allNotifications.filter((n) => n.status === UserNotification_Status.ARCHIVED).map((n) => n.name);

  const deleteArchived = async () => {
    const deleted = new Set<string>();
    let failed = 0;
    for (let index = 0; index < archivedNames.length; index += 10) {
      const names = archivedNames.slice(index, index + 10);
      const results = await Promise.allSettled(names.map((name) => userServiceClient.deleteUserNotification({ name })));
      results.forEach((result, resultIndex) => {
        if (result.status === "fulfilled") deleted.add(names[resultIndex]);
        else failed++;
      });
    }
    queryClient.setQueryData<UserNotification[]>(userKeys.notifications(), (current) => current?.filter((item) => !deleted.has(item.name)));
    await queryClient.invalidateQueries({ queryKey: userKeys.notifications() });
    if (deleted.size > 0) toast.success(t("inbox.deleted-archived", { count: deleted.size }));
    if (failed > 0) {
      toast.error(t("inbox.delete-archived-failed", { count: failed }));
      throw new Error(`Failed to delete ${failed} archived notifications`);
    }
  };

  return (
    <section className="@container w-full max-w-5xl min-h-full flex flex-col justify-start items-center sm:pt-3 md:pt-6 pb-8">
      <div className="w-full px-4 sm:px-6">
        <div className="w-full border border-border flex flex-col justify-start items-start rounded-xl bg-background text-foreground overflow-hidden">
          {/* Header */}
          <div className="w-full px-4 py-4 border-b border-border">
            <div className="flex flex-row justify-between items-center">
              <div className="flex flex-row items-center gap-2">
                <BellIcon className="w-5 h-auto text-muted-foreground" />
                <h1 className="text-xl font-semibold">{t("common.inbox")}</h1>
                {unreadCount > 0 && (
                  <span className="ml-1 px-2 py-0.5 text-xs font-medium rounded-full bg-primary text-primary-foreground">
                    {unreadCount}
                  </span>
                )}
              </div>
              {filter === "archived" && archivedNames.length > 0 && (
                <Button variant="destructive" size="sm" onClick={() => setDeleteArchivedOpen(true)}>
                  <Trash2Icon className="size-4" />
                  {t("inbox.delete-all-archived")}
                </Button>
              )}
            </div>
          </div>

          {/* Notifications List */}
          <div className="w-full">
            {notifications.length === 0 ? (
              <Placeholder
                variant="empty"
                message={filter === "unread" ? t("inbox.no-unread") : filter === "archived" ? t("inbox.no-archived") : t("message.no-data")}
              />
            ) : (
              <div className="flex flex-col">
                {notifications.map((notification: UserNotification) => {
                  if (notification.type === UserNotification_Type.MEMO_COMMENT) {
                    return <MemoCommentMessage key={notification.name} notification={notification} />;
                  }
                  if (notification.type === UserNotification_Type.MEMO_MENTION) {
                    return <MemoMentionMessage key={notification.name} notification={notification} />;
                  }
                  if (notification.type === UserNotification_Type.REMINDER) {
                    return <ReminderMessage key={notification.name} notification={notification} />;
                  }
                  return null;
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={deleteArchivedOpen}
        onOpenChange={setDeleteArchivedOpen}
        title={t("inbox.delete-all-archived")}
        description={t("inbox.delete-all-archived-confirm", { count: archivedNames.length })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={deleteArchived}
        confirmVariant="destructive"
      />
    </section>
  );
};

export default Inboxes;
