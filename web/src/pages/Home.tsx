import { LinkIcon, XIcon } from "lucide-react";
import { useEffect, useMemo } from "react";
import toast from "react-hot-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import MemoEditor from "@/components/MemoEditor";
import { deriveDefaultCreateTimeFromFilters } from "@/components/MemoEditor/utils/deriveDefaultCreateTime";
import MemoView from "@/components/MemoView";
import PagedMemoList, { getMemoKey } from "@/components/PagedMemoList";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useMemoFilterContext } from "@/contexts/MemoFilterContext";
import { NewMemoProvider } from "@/contexts/NewMemoContext";
import { useSpaceContext } from "@/contexts/SpaceContext";
import { useMemoFilters, useMemoSorting } from "@/hooks";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useReminders, useUpdateReminder } from "@/hooks/useReminderQueries";
import { spaceScopedCacheKey } from "@/lib/resource-names";
import { ROUTES } from "@/router/routes";
import { State } from "@/types/proto/api/v1/common_pb";
import { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { ListRemindersRequest_View } from "@/types/proto/api/v1/reminder_service_pb";
import { useTranslate } from "@/utils/i18n";

const Home = () => {
  const user = useCurrentUser();
  const t = useTranslate();
  const { isUserSettingsInitialized } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { filters } = useMemoFilterContext();
  const { memoFilter: contextFilter, selectedSpaceName } = useSpaceContext();
  const defaultCreateTime = useMemo(() => deriveDefaultCreateTimeFromFilters(filters), [filters]);
  // Doubles as the remount key: the draft cache only reloads on mount, so the editor
  // has to be rebuilt for the new Space rather than just re-pointed at another cache.
  const editorCacheKey = spaceScopedCacheKey("home-memo-editor", selectedSpaceName);

  const navigate = useNavigate();
  const linkingReminderUID = searchParams.get("linkReminder") ?? "";
  const { data: pendingReminders = [] } = useReminders(user?.name, { view: ListRemindersRequest_View.ALL });
  const { data: completedReminders = [] } = useReminders(user?.name, { view: ListRemindersRequest_View.COMPLETED });
  const reminders = useMemo(() => [...pendingReminders, ...completedReminders], [completedReminders, pendingReminders]);
  const linkingReminder = useMemo(
    () => reminders.find((reminder) => reminder.name === linkingReminderUID || reminder.name.endsWith(`/${linkingReminderUID}`)),
    [linkingReminderUID, reminders],
  );
  const updateReminder = useUpdateReminder();

  useEffect(() => {
    const selected = searchParams.get("selected");
    if (selected || searchParams.get("reminders") === "1") {
      navigate(`${ROUTES.REMINDERS}${selected ? `?selected=${encodeURIComponent(selected)}` : ""}`, { replace: true });
    }
  }, [navigate, searchParams]);

  const openReminderDetail = (name: string) => navigate(`${ROUTES.REMINDERS}?selected=${encodeURIComponent(name)}`);

  const completeMemoLinkMode = () => {
    setSearchParams(
      (params) => {
        params.delete("linkReminder");
        return params;
      },
      { replace: true },
    );
    toast.success(t("reminder.memo-linked"));
  };

  const finishMemoLink = async (memoName: string) => {
    if (!linkingReminder) return;
    await updateReminder.mutateAsync({ reminder: { name: linkingReminder.name, memo: memoName }, updateMask: ["memo"] });
    completeMemoLinkMode();
  };

  const cancelMemoLink = () => {
    setSearchParams(
      (params) => {
        params.delete("linkReminder");
        return params;
      },
      { replace: true },
    );
  };
  const memoFilter = useMemoFilters({
    creatorName: user?.name,
    includeMemoViews: true,
    includePinned: true,
  });

  const { listSort, orderBy } = useMemoSorting({
    pinnedFirst: true,
    state: State.NORMAL,
  });

  return (
    <div className="w-full min-h-full bg-background text-foreground">
      <NewMemoProvider>
        <PagedMemoList
          renderer={(memo: Memo, { compact }) => (
            <MemoView
              key={getMemoKey(memo)}
              memo={memo}
              showVisibility
              showPinned
              showSpace={!selectedSpaceName}
              compact={compact}
              linkedReminders={reminders.filter((reminder) => reminder.memo === memo.name)}
              onReminderSelect={openReminderDetail}
              linkingReminderTitle={linkingReminder?.title}
              onLinkToMemo={linkingReminder ? finishMemoLink : undefined}
            />
          )}
          listSort={listSort}
          orderBy={orderBy}
          filter={memoFilter}
          contextFilter={contextFilter}
          renderLeading={({ useGrid }) => {
            if (!isUserSettingsInitialized) return null;

            return (
              <div className={useGrid ? "contents" : undefined}>
                {linkingReminder && (
                  <div className="mb-2 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm">
                    <LinkIcon className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 whitespace-normal break-words">
                      {t("reminder.linking-home-banner", { title: linkingReminder.title })}
                    </span>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={cancelMemoLink} aria-label={t("common.cancel")}>
                      <XIcon className="size-4" />
                    </Button>
                  </div>
                )}
                <MemoEditor
                  className={useGrid ? undefined : "mb-2"}
                  key={editorCacheKey}
                  cacheKey={editorCacheKey}
                  defaultSpace={selectedSpaceName}
                  placeholder={linkingReminder ? t("reminder.new-memo-for-link") : t("editor.any-thoughts")}
                  defaultCreateTime={defaultCreateTime}
                  initialReminderNames={linkingReminder ? [linkingReminder.name] : undefined}
                  onConfirm={linkingReminder ? completeMemoLinkMode : undefined}
                />
              </div>
            );
          }}
        />
      </NewMemoProvider>
    </div>
  );
};

export default Home;
