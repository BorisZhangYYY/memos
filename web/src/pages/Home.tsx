import { timestampDate } from "@bufbuild/protobuf/wkt";
import { ChartLineIcon, ChevronDownIcon } from "lucide-react";
import { useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";
import { State } from "@/types/proto/api/v1/common_pb";
import { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";

const MoodTrendSection = ({ points }: { points: MoodPoint[] }) => {
  const t = useTranslate();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mx-auto mb-3 w-full max-w-2xl rounded-lg border border-border bg-card px-4 py-3 text-card-foreground">
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={t("mood.chart.expand")}
        onClick={() => setExpanded((isExpanded) => !isExpanded)}
        className="flex w-full items-center justify-between gap-2"
      >
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <ChartLineIcon className="size-4 text-primary" />
          {t("mood.chart.title")}
        </span>
        <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <div className="mt-3">
          <MoodChart points={points} />
        </div>
      )}
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
      {moodPoints.length > 0 && <MoodTrendSection points={moodPoints} />}
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
