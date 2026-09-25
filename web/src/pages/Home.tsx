import { timestampDate } from "@bufbuild/protobuf/wkt";
import { ChartLineIcon, LinkIcon, ListTodoIcon, WalletCardsIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useSearchParams } from "react-router-dom";
import FinanceDashboard from "@/components/Finance/FinanceDashboard";
import FinanceTransactionDialog from "@/components/Finance/FinanceTransactionDialog";
import MemoEditor from "@/components/MemoEditor";
import { deriveDefaultCreateTimeFromFilters } from "@/components/MemoEditor/utils/deriveDefaultCreateTime";
import MemoView from "@/components/MemoView";
import MoodDashboard from "@/components/MoodDashboard";
import PagedMemoList, { getMemoKey } from "@/components/PagedMemoList";
import PersonalDashboardWidget from "@/components/PersonalDashboardWidget";
import ReminderCenterDialog from "@/components/Reminder/ReminderCenterDialog";
import ReminderDashboard from "@/components/Reminder/ReminderDashboard";
import ReminderDetailDialog from "@/components/Reminder/ReminderDetailDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useMemoFilterContext } from "@/contexts/MemoFilterContext";
import { NewMemoProvider } from "@/contexts/NewMemoContext";
import { useSpaceContext } from "@/contexts/SpaceContext";
import { useMemoFilters, useMemoSorting } from "@/hooks";
import useCurrentUser from "@/hooks/useCurrentUser";
import useNavigateTo from "@/hooks/useNavigateTo";
import usePersonalFeatures from "@/hooks/usePersonalFeatures";
import { useReminderLists, useReminders, useUpdateReminder } from "@/hooks/useReminderQueries";
import { useUserStats } from "@/hooks/useUserQueries";
import type { MoodPoint } from "@/lib/mood-stats";
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
  const { remindersEnabled, financeEnabled, moodEnabled } = usePersonalFeatures();
  const navigateTo = useNavigateTo();
  const [searchParams, setSearchParams] = useSearchParams();
  const { filters } = useMemoFilterContext();
  const { memoFilter: contextFilter, selectedSpaceName } = useSpaceContext();
  const defaultCreateTime = useMemo(() => deriveDefaultCreateTimeFromFilters(filters), [filters]);
  // Doubles as the remount key: the draft cache only reloads on mount, so the editor
  // has to be rebuilt for the new Space rather than just re-pointed at another cache.
  const editorCacheKey = spaceScopedCacheKey("home-memo-editor", selectedSpaceName);

  const { data: userStats } = useUserStats(user?.name, { enabled: isUserSettingsInitialized && moodEnabled });
  const [financeDialogOpen, setFinanceDialogOpen] = useState(false);
  const [reminderCenterOpen, setReminderCenterOpen] = useState(false);
  const [selectedReminderName, setSelectedReminderName] = useState<string>();
  const linkingReminderUID = searchParams.get("linkReminder") ?? "";
  const { data: pendingReminders = [] } = useReminders(user?.name, {
    view: ListRemindersRequest_View.ALL,
    enabled: remindersEnabled,
  });
  const { data: completedReminders = [] } = useReminders(user?.name, {
    view: ListRemindersRequest_View.COMPLETED,
    enabled: remindersEnabled,
  });
  const { data: reminderLists = [] } = useReminderLists(user?.name, { enabled: remindersEnabled });
  const reminders = useMemo(() => [...pendingReminders, ...completedReminders], [completedReminders, pendingReminders]);
  const selectedReminder = useMemo(
    () =>
      selectedReminderName
        ? reminders.find((reminder) => reminder.name === selectedReminderName || reminder.name.endsWith(`/${selectedReminderName}`))
        : undefined,
    [reminders, selectedReminderName],
  );
  const linkingReminder = useMemo(
    () => reminders.find((reminder) => reminder.name === linkingReminderUID || reminder.name.endsWith(`/${linkingReminderUID}`)),
    [linkingReminderUID, reminders],
  );
  const updateReminder = useUpdateReminder();
  const moodPoints = useMemo(() => {
    const timestamps = userStats?.memoCreatedTimestamps ?? [];
    const levels = userStats?.moodLevels ?? [];
    const memoNames = userStats?.moodMemoNames ?? [];
    const points: MoodPoint[] = [];
    timestamps.forEach((timestamp, index) => {
      const level = levels[index];
      if (!timestamp || level <= 0 || level > 7) return;
      points.push({ createTime: timestampDate(timestamp), moodLevel: level, memoName: memoNames[index] });
    });
    return points;
  }, [userStats]);

  useEffect(() => {
    if (!remindersEnabled) {
      setReminderCenterOpen(false);
      setSelectedReminderName(undefined);
      if (searchParams.has("reminders") || searchParams.has("selected") || searchParams.has("linkReminder")) {
        setSearchParams(
          (params) => {
            params.delete("reminders");
            params.delete("selected");
            params.delete("linkReminder");
            return params;
          },
          { replace: true },
        );
      }
      return;
    }
    const selected = searchParams.get("selected");
    if (selected) {
      setReminderCenterOpen(false);
      setSelectedReminderName(selected);
      return;
    }
    setSelectedReminderName(undefined);
    setReminderCenterOpen(searchParams.get("reminders") === "1");
  }, [remindersEnabled, searchParams, setSearchParams]);

  const openReminderCenter = () => {
    setSearchParams((params) => {
      params.set("reminders", "1");
      params.delete("selected");
      return params;
    });
  };

  const openReminderDetail = (name: string) => {
    setSearchParams((params) => {
      params.set("selected", name);
      return params;
    });
  };

  const handleReminderCenterOpenChange = (open: boolean) => {
    if (open) {
      openReminderCenter();
      return;
    }
    setSearchParams(
      (params) => {
        params.delete("reminders");
        params.delete("selected");
        return params;
      },
      { replace: true },
    );
  };

  const handleReminderDetailOpenChange = (open: boolean) => {
    if (open) return;
    setSelectedReminderName(undefined);
    setSearchParams(
      (params) => {
        params.delete("selected");
        return params;
      },
      { replace: true },
    );
  };

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
      {isUserSettingsInitialized && user && (moodEnabled || financeEnabled || remindersEnabled) && (
        <PersonalDashboardWidget
          className="mb-3"
          labels={[
            ...(moodEnabled ? [t("mood.chart.title")] : []),
            ...(financeEnabled ? [t("finance.dashboard.title")] : []),
            ...(remindersEnabled ? [t("reminder.dashboard-title")] : []),
          ]}
          icons={[
            ...(moodEnabled ? [ChartLineIcon] : []),
            ...(financeEnabled ? [WalletCardsIcon] : []),
            ...(remindersEnabled ? [ListTodoIcon] : []),
          ]}
        >
          {moodEnabled && (
            <MoodDashboard
              points={moodPoints}
              embedded
              onMemoSelect={(memoName) => navigateTo(`/${memoName}`, { state: { from: ROUTES.HOME } })}
            />
          )}
          {financeEnabled && <FinanceDashboard parent={user.name} onAdd={() => setFinanceDialogOpen(true)} embedded />}
          {remindersEnabled && (
            <ReminderDashboard parent={user.name} onOpenCenter={openReminderCenter} onOpenReminder={openReminderDetail} />
          )}
        </PersonalDashboardWidget>
      )}
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
              linkedReminders={remindersEnabled ? reminders.filter((reminder) => reminder.memo === memo.name) : []}
              onReminderSelect={remindersEnabled ? openReminderDetail : undefined}
              linkingReminderTitle={remindersEnabled ? linkingReminder?.title : undefined}
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
      {user && financeEnabled && (
        <FinanceTransactionDialog open={financeDialogOpen} onOpenChange={setFinanceDialogOpen} parent={user.name} />
      )}
      {remindersEnabled && (
        <ReminderCenterDialog open={reminderCenterOpen} onOpenChange={handleReminderCenterOpenChange} onOpenReminder={openReminderDetail} />
      )}
      {user && remindersEnabled && (
        <ReminderDetailDialog
          reminder={selectedReminder}
          lists={reminderLists}
          parent={user.name}
          open={!!selectedReminder}
          onOpenChange={handleReminderDetailOpenChange}
        />
      )}
    </div>
  );
};

export default Home;
