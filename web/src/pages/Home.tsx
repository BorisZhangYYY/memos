import { timestampDate } from "@bufbuild/protobuf/wkt";
import { useMemo, useState } from "react";
import FinanceDashboard from "@/components/Finance/FinanceDashboard";
import FinanceTransactionDialog from "@/components/Finance/FinanceTransactionDialog";
import MemoEditor from "@/components/MemoEditor";
import { deriveDefaultCreateTimeFromFilters } from "@/components/MemoEditor/utils/deriveDefaultCreateTime";
import MemoView from "@/components/MemoView";
import MoodDashboard from "@/components/MoodDashboard";
import PagedMemoList, { getMemoKey } from "@/components/PagedMemoList";
import PersonalDashboardWidget from "@/components/PersonalDashboardWidget";
import { useAuth } from "@/contexts/AuthContext";
import { useMemoFilterContext } from "@/contexts/MemoFilterContext";
import { NewMemoProvider } from "@/contexts/NewMemoContext";
import { useMemoFilters, useMemoSorting } from "@/hooks";
import useCurrentUser from "@/hooks/useCurrentUser";
import useNavigateTo from "@/hooks/useNavigateTo";
import { useUserStats } from "@/hooks/useUserQueries";
import type { MoodPoint } from "@/lib/mood-stats";
import { ROUTES } from "@/router/routes";
import { State } from "@/types/proto/api/v1/common_pb";
import { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";

const Home = () => {
  const user = useCurrentUser();
  const t = useTranslate();
  const { isUserSettingsInitialized } = useAuth();
  const navigateTo = useNavigateTo();
  const { filters } = useMemoFilterContext();
  const defaultCreateTime = useMemo(() => deriveDefaultCreateTimeFromFilters(filters), [filters]);

  // Shares the React Query cache entry with the sidebar's stats view, so the
  // mood chart does not add a request when the sidebar already fetched it.
  const { data: userStats } = useUserStats(user?.name, { enabled: isUserSettingsInitialized });
  const [financeDialogOpen, setFinanceDialogOpen] = useState(false);
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
        <PersonalDashboardWidget className="mb-3" labels={[t("mood.chart.title"), t("finance.dashboard.title")]}>
          <MoodDashboard
            points={moodPoints}
            embedded
            onMemoSelect={(memoName) => navigateTo(`/${memoName}`, { state: { from: ROUTES.HOME } })}
          />
          <FinanceDashboard parent={user.name} onAdd={() => setFinanceDialogOpen(true)} embedded />
        </PersonalDashboardWidget>
      )}
      <NewMemoProvider>
        <PagedMemoList
          renderer={(memo: Memo, { compact }) => (
            <MemoView key={getMemoKey(memo)} memo={memo} showVisibility showPinned compact={compact} />
          )}
          listSort={listSort}
          orderBy={orderBy}
          filter={memoFilter}
          renderLeading={({ useGrid }) => {
            if (!isUserSettingsInitialized) return null;

            return (
              <MemoEditor
                className={useGrid ? undefined : "mb-2"}
                cacheKey="home-memo-editor"
                placeholder={t("editor.any-thoughts")}
                defaultCreateTime={defaultCreateTime}
              />
            );
          }}
        />
      </NewMemoProvider>
      {user && <FinanceTransactionDialog open={financeDialogOpen} onOpenChange={setFinanceDialogOpen} parent={user.name} />}
    </div>
  );
};

export default Home;
