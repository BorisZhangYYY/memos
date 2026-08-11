import { timestampDate } from "@bufbuild/protobuf/wkt";
import { LinkIcon, XIcon } from "lucide-react";
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
import { useMemoFilters, useMemoSorting } from "@/hooks";
import useCurrentUser from "@/hooks/useCurrentUser";
import useNavigateTo from "@/hooks/useNavigateTo";
import { useReminderLists, useReminders, useUpdateReminder } from "@/hooks/useReminderQueries";
import { useUserStats } from "@/hooks/useUserQueries";
import type { MoodPoint } from "@/lib/mood-stats";
import { ROUTES } from "@/router/routes";
import { State } from "@/types/proto/api/v1/common_pb";
import { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { ListRemindersRequest_View } from "@/types/proto/api/v1/reminder_service_pb";
import { useTranslate } from "@/utils/i18n";

const Home = () => {
  const user = useCurrentUser();
  const t = useTranslate();
  const { isUserSettingsInitialized } = useAuth();
  const navigateTo = useNavigateTo();
  const [searchParams, setSearchParams] = useSearchParams();
  const { filters } = useMemoFilterContext();
  const defaultCreateTime = useMemo(() => deriveDefaultCreateTimeFromFilters(filters), [filters]);

  // Shares the React Query cache entry with the sidebar's stats view, so the
  // mood chart does not add a request when the sidebar already fetched it.
  const { data: userStats } = useUserStats(user?.name, { enabled: isUserSettingsInitialized });
  const [financeDialogOpen, setFinanceDialogOpen] = useState(false);
  const [reminderCenterOpen, setReminderCenterOpen] = useState(false);
  const [selectedReminderName, setSelectedReminderName] = useState<string>();
  const linkingReminderUID = searchParams.get("linkReminder") ?? "";
  const { data: pendingReminders = [] } = useReminders(user?.name, { view: ListRemindersRequest_View.ALL });
  const { data: completedReminders = [] } = useReminders(user?.name, { view: ListRemindersRequest_View.COMPLETED });
  const { data: reminderLists = [] } = useReminderLists(user?.name);
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

  useEffect(() => {
    const selected = searchParams.get("selected");
    if (selected) {
      setReminderCenterOpen(false);
      setSelectedReminderName(selected);
      return;
    }
    setSelectedReminderName(undefined);
    setReminderCenterOpen(searchParams.get("reminders") === "1");
  }, [searchParams]);

  const openReminderCenter = () => {
    setSearchParams((params) => {
      params.set("reminders", "1");
      params.delete("selected");
      return params;
    });
  };

  const openReminderDetail = (reminderName: string) => {
    setSearchParams((params) => {
      params.set("selected", reminderName);
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

  const memoFilter = useMemoFilters({
    creatorName: user?.name,
    includeShortcuts: true,
    includePinned: true,
  });

  const { listSort, orderBy } = useMemoSorting({
    pinnedFirst: true,
    state: State.NORMAL,
  });

  return (
    <div className="w-full min-h-full bg-background text-foreground">
      {isUserSettingsInitialized && user && (
        <PersonalDashboardWidget
          className="mb-3"
          labels={[t("mood.chart.title"), t("finance.dashboard.title"), t("reminder.dashboard-title")]}
        >
          <MoodDashboard
            points={moodPoints}
            embedded
            onMemoSelect={(memoName) => navigateTo(`/${memoName}`, { state: { from: ROUTES.HOME } })}
          />
          <FinanceDashboard parent={user.name} onAdd={() => setFinanceDialogOpen(true)} embedded />
          <ReminderDashboard parent={user.name} onOpenCenter={openReminderCenter} onOpenReminder={openReminderDetail} />
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
          renderLeading={({ useGrid }) => {
            if (!isUserSettingsInitialized) return null;

            return (
              <div className={useGrid ? "contents" : undefined}>
                {linkingReminder && (
                  <div className="mb-2 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm">
                    <LinkIcon className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate">{t("reminder.linking-home-banner", { title: linkingReminder.title })}</span>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={cancelMemoLink} aria-label={t("common.cancel")}>
                      <XIcon className="size-4" />
                    </Button>
                  </div>
                )}
                <MemoEditor
                  className={useGrid ? undefined : "mb-2"}
                  cacheKey="home-memo-editor"
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
      {user && <FinanceTransactionDialog open={financeDialogOpen} onOpenChange={setFinanceDialogOpen} parent={user.name} />}
      <ReminderCenterDialog open={reminderCenterOpen} onOpenChange={handleReminderCenterOpenChange} onOpenReminder={openReminderDetail} />
      {user && (
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
