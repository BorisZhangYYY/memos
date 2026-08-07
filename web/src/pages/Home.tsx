import { timestampDate } from "@bufbuild/protobuf/wkt";
import { ChartLineIcon } from "lucide-react";
import { useMemo } from "react";
import MemoEditor from "@/components/MemoEditor";
import { deriveDefaultCreateTimeFromFilters } from "@/components/MemoEditor/utils/deriveDefaultCreateTime";
import MemoView from "@/components/MemoView";
import { MoodChart, type MoodPoint } from "@/components/MoodChart";
import PagedMemoList, { getMemoKey } from "@/components/PagedMemoList";
import { useAuth } from "@/contexts/AuthContext";
import { useMemoFilterContext } from "@/contexts/MemoFilterContext";
import { NewMemoProvider } from "@/contexts/NewMemoContext";
import { useMemoFilters, useMemoSorting } from "@/hooks";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useUserStats } from "@/hooks/useUserQueries";
import { State } from "@/types/proto/api/v1/common_pb";
import { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";

// The mood trend sits above the memo column grid: it occupies its own row, so
// multi-column memo layouts never affect it. It is always visible (not
// collapsible) and kept compact.
const MoodTrendSection = ({ points, selectedDate }: { points: MoodPoint[]; selectedDate?: string }) => {
  const t = useTranslate();

  return (
    <div className="mb-3 w-full max-w-sm rounded-lg border border-border bg-card px-3 py-2 text-card-foreground">
      <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
        <ChartLineIcon className="size-4 text-primary" />
        {t("mood.chart.title")}
      </div>
      <MoodChart points={points} selectedDate={selectedDate} />
    </div>
  );
};

const Home = () => {
  const user = useCurrentUser();
  const t = useTranslate();
  const { isUserSettingsInitialized } = useAuth();
  const { filters } = useMemoFilterContext();
  const defaultCreateTime = useMemo(() => deriveDefaultCreateTimeFromFilters(filters), [filters]);

  // Shares the React Query cache entry with the sidebar's stats view, so the
  // mood chart does not add a request when the sidebar already fetched it.
  const { data: userStats } = useUserStats(user?.name, { enabled: isUserSettingsInitialized });
  // The calendar's date filter drives the chart: a selected day shows that
  // day's minute-level curve; no selection shows the trailing 30-day trend.
  const selectedDate = filters.find((filter) => filter.factor === "displayTime")?.value;
  const moodPoints = useMemo(() => {
    const timestamps = userStats?.memoCreatedTimestamps ?? [];
    const levels = userStats?.moodLevels ?? [];
    const points: MoodPoint[] = [];
    timestamps.forEach((timestamp, index) => {
      const level = levels[index];
      if (!timestamp || level <= 0 || level > 7) return;
      points.push({ createTime: timestampDate(timestamp), moodLevel: level });
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
      {moodPoints.length > 0 && <MoodTrendSection points={moodPoints} selectedDate={selectedDate} />}
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
    </div>
  );
};

export default Home;
