import { ArrowLeftIcon, ChevronRightIcon, HistoryIcon, ListIcon, SmileIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DEFAULT_MOOD_EMOJIS } from "@/components/MemoEditor/Toolbar/MoodSelector";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInstance } from "@/contexts/InstanceContext";
import { getMoodPalette } from "@/lib/mood";
import { aggregateDays, dayViewPoints, type MoodPoint } from "@/lib/mood-stats";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";

const MAX_MOOD_LEVEL = 7;
const MOOD_LEVEL_KEYS = ["level-1", "level-2", "level-3", "level-4", "level-5", "level-6", "level-7"] as const;

interface Props {
  points: MoodPoint[];
  embedded?: boolean;
  onMemoSelect?: (memoName: string) => void;
}

interface HistoryDay {
  date: string;
  count: number;
  avg: number;
  min: number;
  max: number;
}

const localDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const formatDay = (date: Date | string) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", weekday: "short" }).format(
    typeof date === "string" ? new Date(`${date}T00:00:00`) : date,
  );

const formatTime = (date: Date) =>
  new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);

const monthLabel = (year: number, month: number) =>
  new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long" }).format(new Date(year, month, 1));

const MoodDashboard = ({ points, embedded = false, onMemoSelect }: Props) => {
  const t = useTranslate();
  const { memoRelatedSetting } = useInstance();
  const emojis = memoRelatedSetting?.moodEmojis?.length === MAX_MOOD_LEVEL ? memoRelatedSetting.moodEmojis : DEFAULT_MOOD_EMOJIS;
  const colors = getMoodPalette(memoRelatedSetting?.moodColors);
  const today = useMemo(() => new Date(), []);
  const todayPoints = useMemo(() => dayViewPoints(points, today), [points, today]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsView, setDetailsView] = useState<"recent" | "history">("recent");
  const [selectedDate, setSelectedDate] = useState<string>();
  const historyYears = useMemo(() => [...new Set(points.map((point) => point.createTime.getFullYear()))].sort((a, b) => b - a), [points]);
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>();
  const recentDays = useMemo(() => aggregateDays(points, today, 30), [points, today]);
  const recentRecordCount = recentDays.reduce((sum, day) => sum + day.count, 0);
  const recentAverage = recentRecordCount === 0 ? 0 : recentDays.reduce((sum, day) => sum + day.avg * day.count, 0) / recentRecordCount;
  const todayAverage = todayPoints.length === 0 ? 0 : todayPoints.reduce((sum, point) => sum + point.moodLevel, 0) / todayPoints.length;

  useEffect(() => {
    if (historyYears.length > 0 && !historyYears.includes(selectedYear)) setSelectedYear(historyYears[0]);
  }, [historyYears, selectedYear]);

  const recentGroups = useMemo(() => {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    start.setDate(start.getDate() - 29);
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const groups = new Map<string, MoodPoint[]>();
    for (const point of points) {
      if (point.moodLevel < 1 || point.moodLevel > MAX_MOOD_LEVEL || point.createTime < start || point.createTime >= end) continue;
      const date = localDateKey(point.createTime);
      groups.set(date, [...(groups.get(date) ?? []), point]);
    }
    return [...groups.entries()]
      .map(([date, dayPoints]) => ({ date, points: dayPoints.sort((a, b) => b.createTime.getTime() - a.createTime.getTime()) }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [points, today]);

  const yearMonths = useMemo(() => {
    const groups = new Map<number, number[]>();
    for (const point of points) {
      if (point.createTime.getFullYear() !== selectedYear) continue;
      const month = point.createTime.getMonth();
      groups.set(month, [...(groups.get(month) ?? []), point.moodLevel]);
    }
    return Array.from({ length: 12 }, (_, month) => {
      const levels = groups.get(month) ?? [];
      return { month, count: levels.length, avg: levels.length === 0 ? 0 : levels.reduce((sum, level) => sum + level, 0) / levels.length };
    });
  }, [points, selectedYear]);

  const monthDays = useMemo(() => {
    if (selectedMonth === undefined) return [];
    const groups = new Map<string, number[]>();
    for (const point of points) {
      if (point.createTime.getFullYear() !== selectedYear || point.createTime.getMonth() !== selectedMonth) continue;
      const date = localDateKey(point.createTime);
      groups.set(date, [...(groups.get(date) ?? []), point.moodLevel]);
    }
    return [...groups.entries()]
      .map(
        ([date, levels]): HistoryDay => ({
          date,
          count: levels.length,
          avg: levels.reduce((sum, level) => sum + level, 0) / levels.length,
          min: Math.min(...levels),
          max: Math.max(...levels),
        }),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [points, selectedMonth, selectedYear]);

  const selectedDayPoints = useMemo(
    () => (selectedDate ? [...dayViewPoints(points, new Date(`${selectedDate}T00:00:00`))].reverse() : []),
    [points, selectedDate],
  );

  const handleViewChange = (value: string) => {
    setDetailsView(value as "recent" | "history");
    setSelectedDate(undefined);
    setSelectedMonth(undefined);
  };

  const handleMemoSelect = (memoName?: string) => {
    if (!memoName || !onMemoSelect) return;
    setDetailsOpen(false);
    onMemoSelect(memoName);
  };

  const moodRow = (point: MoodPoint, key: string) => (
    <button
      type="button"
      key={key}
      disabled={!point.memoName || !onMemoSelect}
      onClick={() => handleMemoSelect(point.memoName)}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent"
      title={point.memoName ? t("mood.dashboard.open-memo") : undefined}
    >
      <span className="text-lg" aria-hidden="true">
        {emojis[point.moodLevel - 1]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{t(`mood.${MOOD_LEVEL_KEYS[point.moodLevel - 1]}`)}</span>
        <span className="block font-mono text-[11px] text-muted-foreground">{formatTime(point.createTime)}</span>
      </span>
      <span className="font-mono text-xs text-muted-foreground">{point.moodLevel}/7</span>
      {point.memoName && onMemoSelect && <ChevronRightIcon className="size-3.5 text-muted-foreground" />}
    </button>
  );

  return (
    <>
      <div
        className={cn(
          "flex h-full min-h-64 flex-col rounded-xl border border-border bg-card p-4 text-card-foreground",
          embedded && "rounded-none border-0",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-base font-semibold">
              {!embedded && (
                <>
                  <SmileIcon className="size-5 shrink-0 text-primary" />
                  <span className="truncate">{t("mood.chart.title")}</span>
                </>
              )}
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                {t("mood.chart.today")}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{formatDay(today)}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setDetailsOpen(true)}>
            <ListIcon />
            {t("mood.dashboard.view-details")}
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            {
              label: t("mood.dashboard.today-average"),
              value: todayAverage > 0 ? `${emojis[Math.round(todayAverage) - 1]} ${todayAverage.toFixed(1)}` : "—",
            },
            { label: t("mood.dashboard.records"), value: String(todayPoints.length) },
            { label: t("mood.dashboard.recent-average"), value: recentAverage > 0 ? recentAverage.toFixed(1) : "—" },
            { label: t("mood.dashboard.recent-days"), value: String(recentDays.length) },
          ].map((item) => (
            <div key={item.label} className="min-w-0 rounded-lg bg-muted/50 p-3">
              <div className="truncate text-xs text-muted-foreground">{item.label}</div>
              <div className="mt-1 truncate font-mono text-base font-semibold">{item.value}</div>
            </div>
          ))}
        </div>

        {todayPoints.length === 0 ? (
          <div className="flex min-h-28 flex-1 items-center justify-center text-sm text-muted-foreground">
            {t("mood.dashboard.empty-today")}
          </div>
        ) : (
          <div className="mt-3 max-h-48 divide-y overflow-y-auto rounded-lg border bg-background/60">
            {[...todayPoints].reverse().map((point, index) => (
              <div
                key={`${point.createTime.toISOString()}-${index}`}
                style={{ borderLeftColor: colors[point.moodLevel - 1], borderLeftWidth: 3 }}
              >
                {moodRow(point, `${point.memoName}-${point.createTime.toISOString()}`)}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent size="full" className="h-[min(42rem,calc(100vh-2rem))] gap-3 md:max-w-4xl">
          <DialogHeader className="pr-8">
            <DialogTitle className="text-base">{t("mood.insights.title")}</DialogTitle>
            <DialogDescription className="text-xs">{t("mood.insights.description")}</DialogDescription>
          </DialogHeader>

          <Tabs value={detailsView} onValueChange={handleViewChange}>
            <TabsList>
              <TabsTrigger value="recent">
                <ListIcon />
                {t("mood.chart.trend")}
              </TabsTrigger>
              <TabsTrigger value="history">
                <HistoryIcon />
                {t("mood.insights.more-history")}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {selectedDate ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedDate(undefined)}>
                    <ArrowLeftIcon />
                    {detailsView === "recent" ? t("mood.insights.back-to-recent") : t("mood.insights.back-to-month")}
                  </Button>
                  <div className="text-sm font-medium">{formatDay(selectedDate)}</div>
                </div>
                {selectedDayPoints.length === 0 ? (
                  <div className="flex min-h-40 items-center justify-center rounded-xl border text-sm text-muted-foreground">
                    {t("mood.chart.empty")}
                  </div>
                ) : (
                  <div className="divide-y rounded-xl border bg-background">
                    {selectedDayPoints.map((point, index) =>
                      moodRow(point, `${point.memoName}-${point.createTime.toISOString()}-${index}`),
                    )}
                  </div>
                )}
              </div>
            ) : detailsView === "recent" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {[
                    { label: t("mood.insights.average"), value: recentAverage > 0 ? recentAverage.toFixed(1) : "—" },
                    { label: t("mood.insights.recorded-days"), value: String(recentDays.length) },
                    { label: t("mood.dashboard.records"), value: String(recentRecordCount) },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg bg-muted/60 p-2.5">
                      <div className="truncate text-[11px] text-muted-foreground">{item.label}</div>
                      <div className="mt-0.5 text-lg font-semibold">{item.value}</div>
                    </div>
                  ))}
                </div>
                {recentGroups.length === 0 ? (
                  <div className="flex min-h-48 items-center justify-center rounded-xl border text-sm text-muted-foreground">
                    {t("mood.chart.empty")}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentGroups.map((group) => (
                      <section key={group.date} className="overflow-hidden rounded-xl border bg-background">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between bg-muted/40 px-3 py-2 text-left hover:bg-muted"
                          onClick={() => setSelectedDate(group.date)}
                        >
                          <span className="text-xs font-medium">{formatDay(group.date)}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {group.points.length} {t("mood.insights.entries")}
                          </span>
                        </button>
                        <div className="divide-y">
                          {group.points.map((point, index) =>
                            moodRow(point, `${point.memoName}-${point.createTime.toISOString()}-${index}`),
                          )}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {(historyYears.length > 0 ? historyYears : [today.getFullYear()]).map((year) => (
                    <Button
                      key={year}
                      size="sm"
                      variant={selectedYear === year ? "secondary" : "outline"}
                      onClick={() => {
                        setSelectedYear(year);
                        setSelectedMonth(undefined);
                      }}
                    >
                      {year}
                    </Button>
                  ))}
                </div>

                {selectedMonth === undefined ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {yearMonths.map((month) => {
                      const roundedAverage = Math.max(1, Math.min(MAX_MOOD_LEVEL, Math.round(month.avg)));
                      return (
                        <button
                          type="button"
                          key={month.month}
                          disabled={month.count === 0}
                          onClick={() => setSelectedMonth(month.month)}
                          className="rounded-lg border bg-background p-3 text-left transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-45"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">{monthLabel(selectedYear, month.month)}</span>
                            {month.count > 0 && <span className="text-lg">{emojis[roundedAverage - 1]}</span>}
                          </div>
                          <div className="mt-2 text-[11px] text-muted-foreground">
                            {month.count > 0
                              ? `${month.count} ${t("mood.insights.entries")} · ${month.avg.toFixed(1)}`
                              : t("mood.chart.empty")}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedMonth(undefined)}>
                        <ArrowLeftIcon />
                        {t("mood.insights.all-months")}
                      </Button>
                      <span className="text-sm font-medium">{monthLabel(selectedYear, selectedMonth)}</span>
                    </div>
                    {monthDays.length === 0 ? (
                      <div className="flex min-h-48 items-center justify-center rounded-xl border text-sm text-muted-foreground">
                        {t("mood.chart.empty")}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {monthDays.map((day) => {
                          const roundedAverage = Math.max(1, Math.min(MAX_MOOD_LEVEL, Math.round(day.avg)));
                          return (
                            <button
                              type="button"
                              key={day.date}
                              onClick={() => setSelectedDate(day.date)}
                              className="flex items-center gap-2.5 rounded-lg border bg-background p-2.5 text-left transition-colors hover:bg-accent"
                            >
                              <span className="text-lg">{emojis[roundedAverage - 1]}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium">{formatDay(day.date)}</span>
                                <span className="block text-[11px] text-muted-foreground">
                                  {day.count} {t("mood.insights.entries")} · {day.min}–{day.max}
                                </span>
                              </span>
                              <span className="font-mono text-sm font-semibold">{day.avg.toFixed(1)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MoodDashboard;
