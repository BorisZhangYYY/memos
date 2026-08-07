import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { DEFAULT_MOOD_EMOJIS } from "@/components/MemoEditor/Toolbar/MoodSelector";
import { useInstance } from "@/contexts/InstanceContext";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";

export interface MoodPoint {
  createTime: Date;
  moodLevel: number;
}

export interface DayViewPoint extends MoodPoint {
  /** Minutes since local midnight; the 0-24h x-axis value. */
  minutes: number;
}

export interface DayStats {
  /** Browser-local "YYYY-MM-DD" of the aggregated day. */
  date: string;
  count: number;
  avg: number;
  min: number;
  max: number;
}

const MAX_MOOD_LEVEL = 7;
/** One date label per N days on the 30-day trend x-axis. */
const TREND_LABEL_EVERY = 5;
const DAY_MINUTES = 24 * 60;

const isValidMoodLevel = (level: number) => level >= 1 && level <= MAX_MOOD_LEVEL;

const isSameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const toDateString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/**
 * Memos with a valid mood level created on the same local day as `now`,
 * each mapped to minutes since local midnight and sorted chronologically.
 */
export const dayViewPoints = (points: MoodPoint[], now: Date): DayViewPoint[] =>
  points
    .filter((point) => isValidMoodLevel(point.moodLevel) && isSameLocalDay(point.createTime, now))
    .map((point) => ({ ...point, minutes: point.createTime.getHours() * 60 + point.createTime.getMinutes() }))
    .sort((a, b) => a.minutes - b.minutes);

/**
 * Daily mood aggregates for the `windowDays` local days ending at `now`. Days
 * without a mood memo are omitted so the line and range band break across
 * them; avg, min and max drive the line and the band respectively.
 */
export const aggregateDays = (points: MoodPoint[], now: Date, windowDays: number): DayStats[] => {
  const days: DayStats[] = [];
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let offset = windowDays - 1; offset >= 0; offset--) {
    const dayStart = new Date(todayStart);
    dayStart.setDate(todayStart.getDate() - offset);
    const levels = points
      .filter((point) => isValidMoodLevel(point.moodLevel) && isSameLocalDay(point.createTime, dayStart))
      .map((point) => point.moodLevel);
    if (levels.length === 0) {
      continue;
    }
    days.push({
      date: toDateString(dayStart),
      count: levels.length,
      avg: levels.reduce((sum, level) => sum + level, 0) / levels.length,
      min: Math.min(...levels),
      max: Math.max(...levels),
    });
  }
  return days;
};

/** Backward-compatible alias: the 7-day window used before the trend view. */
export const weekViewDays = (points: MoodPoint[], now: Date): DayStats[] => aggregateDays(points, now, 7);

const VIEWBOX_WIDTH = 560;
const VIEWBOX_HEIGHT = 240;
const PLOT_TOP = 20;
const PLOT_RIGHT = 14;
const PLOT_BOTTOM = 44;
const PLOT_LEFT = 38;
// Note: SVG text sizes are viewBox user units; the chart scales down to its
// container, so axis labels use text-[18px] (viewBox units) to render at
// roughly 12px visually at the typical ~0.69 container scale.
const PLOT_WIDTH = VIEWBOX_WIDTH - PLOT_LEFT - PLOT_RIGHT;
const PLOT_HEIGHT = VIEWBOX_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
const POINT_RADIUS = 4;
const HIT_RADIUS = 11;

const xForMinutes = (minutes: number) => PLOT_LEFT + (minutes / DAY_MINUTES) * PLOT_WIDTH;
const xForDaySlot = (index: number, windowDays: number) => PLOT_LEFT + ((index + 0.5) / windowDays) * PLOT_WIDTH;
const yForLevel = (level: number) => PLOT_TOP + ((MAX_MOOD_LEVEL - level) / (MAX_MOOD_LEVEL - 1)) * PLOT_HEIGHT;
const formatMinutes = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const DAY_AXIS_LABEL_MINUTES = [0, 6 * 60, 12 * 60, 18 * 60, 24 * 60];
const MOOD_LEVEL_KEYS = ["level-1", "level-2", "level-3", "level-4", "level-5", "level-6", "level-7"] as const;

/** Contiguous calendar-day runs with data; the line and band break between runs. */
const groupIntoRuns = (days: DayStats[]): DayStats[][] => {
  const runs: DayStats[][] = [];
  for (const day of days) {
    const lastRun = runs[runs.length - 1];
    const previous = lastRun?.[lastRun.length - 1];
    const isAdjacent = previous != null && dayjs(day.date).diff(dayjs(previous.date), "day") === 1;
    if (isAdjacent) {
      lastRun.push(day);
    } else {
      runs.push([day]);
    }
  }
  return runs;
};

interface TooltipState {
  /** Percent of the viewBox width, clamped so the bubble stays on screen. */
  leftPercent: number;
  /** Percent of the viewBox height; the bubble is shown above (or below) this point. */
  topPercent: number;
  content: string;
}

/** Chart window choices: today's minute-level curve, or a trailing-day trend. */
export type ChartWindow = "today" | 7 | 30;

export const WINDOW_OPTIONS: Array<{ value: ChartWindow; labelKey: "mood.chart.today" | "mood.chart.week" | "mood.chart.trend" }> = [
  { value: "today", labelKey: "mood.chart.today" },
  { value: 7, labelKey: "mood.chart.week" },
  { value: 30, labelKey: "mood.chart.trend" },
];

export interface MoodChartProps {
  /** All mood-tagged memos of the current user; the active window windows them. */
  points: MoodPoint[];
  /**
   * Browser-local "YYYY-MM-DD" of the day to show at minute precision (from
   * the calendar's date filter). When unset, the chart shows today.
   */
  selectedDate?: string;
  /** Active chart window (controlled by the parent's header filter). */
  window_: ChartWindow;
}

export const MoodChart = ({ points, selectedDate, window_ }: MoodChartProps) => {
  const t = useTranslate();
  const { memoRelatedSetting } = useInstance();
  const emojis = memoRelatedSetting?.moodEmojis?.length === MAX_MOOD_LEVEL ? memoRelatedSetting.moodEmojis : DEFAULT_MOOD_EMOJIS;
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const now = useMemo(() => new Date(), []);

  // Single-day mode: the selected calendar day (or today) at minute precision.
  const dayAnchor = selectedDate ? new Date(`${selectedDate}T00:00:00`) : now;
  const dayPoints = useMemo(() => dayViewPoints(points, dayAnchor), [points, dayAnchor]);

  // Trend mode: the trailing N-day window aggregated by day.
  const windowDays = window_ === "today" ? 0 : window_;
  const trendDays = useMemo(() => (windowDays > 0 ? aggregateDays(points, now, windowDays) : []), [points, now, windowDays]);
  const trendRuns = useMemo(() => groupIntoRuns(trendDays), [trendDays]);
  const trendWindowStart = useMemo(
    () =>
      dayjs()
        .startOf("day")
        .subtract(Math.max(1, windowDays) - 1, "day"),
    [windowDays],
  );
  const trendSlotOf = (day: DayStats) => dayjs(day.date).diff(trendWindowStart, "day");
  const trendLabels = useMemo(() => {
    // Denser labels for short windows; sparse for the 30-day trend.
    const labelEvery = windowDays <= 7 ? 2 : TREND_LABEL_EVERY;
    return Array.from({ length: windowDays }, (_, index) => {
      const date = trendWindowStart.add(index, "day");
      return { label: date.format("MM-DD"), isToday: index === windowDays - 1, index };
    }).filter((entry) => entry.index % labelEvery === 0 || entry.isToday);
  }, [trendWindowStart, windowDays]);

  const isEmpty = window_ === "today" ? dayPoints.length === 0 : trendDays.length === 0;

  const handlePointHover = (leftPercent: number, topPercent: number, content: string) => {
    setTooltip({ leftPercent: Math.min(92, Math.max(8, leftPercent)), topPercent, content });
  };

  const gridLines = Array.from({ length: MAX_MOOD_LEVEL }, (_, index) => index + 1).map((level) => (
    <g key={level}>
      <line
        x1={PLOT_LEFT}
        x2={VIEWBOX_WIDTH - PLOT_RIGHT}
        y1={yForLevel(level)}
        y2={yForLevel(level)}
        className="stroke-muted-foreground"
        strokeOpacity={0.15}
        strokeWidth={1}
      />
      <text x={PLOT_LEFT - 6} y={yForLevel(level) + 6} textAnchor="end" className="fill-muted-foreground text-[18px]" aria-hidden="true">
        {level}
      </text>
    </g>
  ));

  const dayAxisLabels = DAY_AXIS_LABEL_MINUTES.map((minutes) => (
    <text
      key={minutes}
      x={xForMinutes(minutes)}
      y={VIEWBOX_HEIGHT - 10}
      textAnchor="middle"
      className="fill-muted-foreground text-[18px]"
      aria-hidden="true"
    >
      {formatMinutes(minutes)}
    </text>
  ));

  const trendAxisLabels = trendLabels.map(({ label, isToday, index }) => (
    <text
      key={label}
      x={xForDaySlot(index, windowDays)}
      y={VIEWBOX_HEIGHT - 10}
      textAnchor="middle"
      className={cn("text-[18px]", isToday ? "fill-primary" : "fill-muted-foreground")}
      aria-hidden="true"
    >
      {label}
    </text>
  ));

  const daySeries = (
    <>
      {dayPoints.length > 1 && (
        <polyline
          points={dayPoints.map((point) => `${xForMinutes(point.minutes)},${yForLevel(point.moodLevel)}`).join(" ")}
          fill="none"
          className="stroke-primary"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {dayPoints.map((point, index) => {
        const x = xForMinutes(point.minutes);
        const y = yForLevel(point.moodLevel);
        return (
          <g key={index}>
            <circle cx={x} cy={y} r={POINT_RADIUS} className="fill-primary" />
            <circle
              cx={x}
              cy={y}
              r={HIT_RADIUS}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() =>
                handlePointHover(
                  (x / VIEWBOX_WIDTH) * 100,
                  (y / VIEWBOX_HEIGHT) * 100,
                  `${emojis[point.moodLevel - 1]} ${formatMinutes(point.minutes)} · ${t(`mood.${MOOD_LEVEL_KEYS[point.moodLevel - 1]}`)}`,
                )
              }
              onMouseLeave={() => setTooltip(null)}
            />
          </g>
        );
      })}
    </>
  );

  const trendSeries = trendRuns.map((run) => (
    <g key={run[0].date}>
      {run.length > 1 && (
        <>
          <polygon
            points={[
              ...run.map((day) => `${xForDaySlot(trendSlotOf(day), windowDays)},${yForLevel(day.max)}`),
              ...run.map((day) => `${xForDaySlot(trendSlotOf(day), windowDays)},${yForLevel(day.min)}`).reverse(),
            ].join(" ")}
            className="fill-primary"
            fillOpacity={0.12}
          />
          <polyline
            points={run.map((day) => `${xForDaySlot(trendSlotOf(day), windowDays)},${yForLevel(day.avg)}`).join(" ")}
            fill="none"
            className="stroke-primary"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      )}
      {run.map((day) => {
        const x = xForDaySlot(trendSlotOf(day), windowDays);
        const y = yForLevel(day.avg);
        return (
          <g key={day.date}>
            <circle cx={x} cy={y} r={POINT_RADIUS} className="fill-primary" />
            <circle
              cx={x}
              cy={y}
              r={HIT_RADIUS}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() =>
                handlePointHover(
                  (x / VIEWBOX_WIDTH) * 100,
                  (y / VIEWBOX_HEIGHT) * 100,
                  `${emojis[Math.round(day.avg) - 1]} ${dayjs(day.date).format("MM-DD")} · ${day.avg.toFixed(1)} (${day.min}–${day.max})`,
                )
              }
              onMouseLeave={() => setTooltip(null)}
            />
          </g>
        );
      })}
    </g>
  ));

  const activeOption = WINDOW_OPTIONS.find((option) => option.value === window_);

  return (
    <div className="w-full">
      {isEmpty ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">{t("mood.chart.empty")}</div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
            className="h-auto w-full"
            role="img"
            aria-label={`${t("mood.chart.title")} ${t(activeOption?.labelKey ?? "mood.chart.today")}`}
            onMouseLeave={() => setTooltip(null)}
          >
            {gridLines}
            {window_ === "today" ? dayAxisLabels : trendAxisLabels}
            {window_ === "today" ? daySeries : trendSeries}
          </svg>
          {tooltip && (
            <div
              className={cn(
                "pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm",
                tooltip.topPercent >= 18 ? "-mt-2 -translate-y-full" : "translate-y-1.5",
              )}
              style={{ left: `${tooltip.leftPercent}%`, top: `${tooltip.topPercent}%` }}
              role="tooltip"
            >
              {tooltip.content}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
