import { timestampDate } from "@bufbuild/protobuf/wkt";
import { ChartLineIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import MemoEditor from "@/components/MemoEditor";
import { deriveDefaultCreateTimeFromFilters } from "@/components/MemoEditor/utils/deriveDefaultCreateTime";
import MemoView from "@/components/MemoView";
import { type ChartWindow, MoodChart, type MoodPoint, WINDOW_OPTIONS } from "@/components/MoodChart";
import PagedMemoList, { getMemoKey } from "@/components/PagedMemoList";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
// collapsible) and kept compact. The window filter shares the title row so the
// chart below gets the full height.
const MoodTrendSection = ({
  points,
  selectedDate,
  window_,
  onWindowChange,
}: {
  points: MoodPoint[];
  selectedDate?: string;
  window_: ChartWindow;
  onWindowChange: (window: ChartWindow) => void;
}) => {
  const t = useTranslate();

  return (
    <div className="mb-3 w-full max-w-md rounded-lg border border-border bg-card px-3 py-2 text-card-foreground">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <ChartLineIcon className="size-4 shrink-0 text-primary" />
          {t("mood.chart.title")}
        </span>
        <Tabs
          value={String(window_)}
          onValueChange={(value) => {
            onWindowChange(value === "today" ? "today" : (Number(value) as 7 | 30));
          }}
        >
          <TabsList className="gap-0.5">
            {WINDOW_OPTIONS.map((option) => (
              <TabsTrigger key={String(option.value)} value={String(option.value)} className="px-2 py-0.5 text-xs">
                {t(option.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <MoodChart points={points} selectedDate={selectedDate} window_={window_} />
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
  // day's minute-level curve; no selection shows today by default.
  const selectedDate = filters.find((filter) => filter.factor === "displayTime")?.value;
  const [chartWindow, setChartWindow] = useState<ChartWindow>("today");
  // Selecting a calendar day forces the chart into single-day mode.
  useEffect(() => {
    if (selectedDate) {
      setChartWindow("today");
    }
  }, [selectedDate]);
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
      {moodPoints.length > 0 && (
        <MoodTrendSection points={moodPoints} selectedDate={selectedDate} window_={chartWindow} onWindowChange={setChartWindow} />
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
    </div>
  );
};

export default Home;
