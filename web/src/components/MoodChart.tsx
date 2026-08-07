import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { DEFAULT_MOOD_EMOJIS } from "@/components/MemoEditor/Toolbar/MoodSelector";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
const WEEK_DAYS = 7;
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
 * Daily mood aggregates for the 7 local days ending at `now`. Days without a
 * mood memo are omitted so the line and range band break across them; avg,
 * min and max drive the line and the band respectively.
 */
export const weekViewDays = (points: MoodPoint[], now: Date): DayStats[] => {
  const days: DayStats[] = [];
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let offset = WEEK_DAYS - 1; offset >= 0; offset--) {
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

const VIEWBOX_WIDTH = 560;
const VIEWBOX_HEIGHT = 200;
const PLOT_TOP = 14;
const PLOT_RIGHT = 14;
const PLOT_BOTTOM = 26;
const PLOT_LEFT = 30;
const PLOT_WIDTH = VIEWBOX_WIDTH - PLOT_LEFT - PLOT_RIGHT;
const PLOT_HEIGHT = VIEWBOX_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
const POINT_RADIUS = 4;
const HIT_RADIUS = 11;

const xForMinutes = (minutes: number) => PLOT_LEFT + (minutes / DAY_MINUTES) * PLOT_WIDTH;
const xForDaySlot = (index: number) => PLOT_LEFT + ((index + 0.5) / WEEK_DAYS) * PLOT_WIDTH;
const yForLevel = (level: number) => PLOT_TOP + ((MAX_MOOD_LEVEL - level) / (MAX_MOOD_LEVEL - 1)) * PLOT_HEIGHT;
const formatMinutes = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const DAY_AXIS_LABEL_MINUTES = [0, 6 * 60, 12 * 60, 18 * 60, 24 * 60];
const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
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

type MoodChartView = "day" | "week";

export interface MoodChartProps {
  /** All mood-tagged memos of the current user; the active view windows them. */
  points: MoodPoint[];
}

export const MoodChart = ({ points }: MoodChartProps) => {
  const t = useTranslate();
  const { memoRelatedSetting } = useInstance();
  const emojis = memoRelatedSetting?.moodEmojis?.length === MAX_MOOD_LEVEL ? memoRelatedSetting.moodEmojis : DEFAULT_MOOD_EMOJIS;
  const [view, setView] = useState<MoodChartView>("day");
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const dayPoints = useMemo(() => dayViewPoints(points, new Date()), [points]);
  const weekDays = useMemo(() => weekViewDays(points, new Date()), [points]);
  const weekRuns = useMemo(() => groupIntoRuns(weekDays), [weekDays]);
  // Runs are contiguous slices of weekDays, so each day's slot index is stable.
  const weekSlotByDate = useMemo(() => new Map(weekDays.map((day, index) => [day.date, index])), [weekDays]);
  const weekLabels = useMemo(
    () =>
      Array.from({ length: WEEK_DAYS }, (_, index) => {
        const date = dayjs().subtract(WEEK_DAYS - 1 - index, "day");
        return { label: t(`common.days.${WEEKDAY_KEYS[date.day()]}`), isToday: index === WEEK_DAYS - 1 };
      }),
    [t],
  );

  const viewPoints = view === "day" ? dayPoints : weekDays;
  const isEmpty = viewPoints.length === 0;

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
      <text x={PLOT_LEFT - 6} y={yForLevel(level) + 3.5} textAnchor="end" className="fill-muted-foreground text-[10px]" aria-hidden="true">
        {level}
      </text>
    </g>
  ));

  const dayAxisLabels = DAY_AXIS_LABEL_MINUTES.map((minutes) => (
    <text
      key={minutes}
      x={xForMinutes(minutes)}
      y={VIEWBOX_HEIGHT - 8}
      textAnchor="middle"
      className="fill-muted-foreground text-[10px]"
      aria-hidden="true"
    >
      {formatMinutes(minutes)}
    </text>
  ));

  const weekAxisLabels = weekLabels.map(({ label, isToday }, index) => (
    <text
      key={label}
      x={xForDaySlot(index)}
      y={VIEWBOX_HEIGHT - 8}
      textAnchor="middle"
      className={cn("text-[10px]", isToday ? "fill-primary" : "fill-muted-foreground")}
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

  const weekSeries = weekRuns.map((run) => (
    <g key={run[0].date}>
      {run.length > 1 && (
        <>
          <polygon
            points={[
              ...run.map((day) => `${xForDaySlot(weekSlotByDate.get(day.date) ?? 0)},${yForLevel(day.max)}`),
              ...run.map((day) => `${xForDaySlot(weekSlotByDate.get(day.date) ?? 0)},${yForLevel(day.min)}`).reverse(),
            ].join(" ")}
            className="fill-primary"
            fillOpacity={0.12}
          />
          <polyline
            points={run.map((day) => `${xForDaySlot(weekSlotByDate.get(day.date) ?? 0)},${yForLevel(day.avg)}`).join(" ")}
            fill="none"
            className="stroke-primary"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      )}
      {run.map((day) => {
        const x = xForDaySlot(weekSlotByDate.get(day.date) ?? 0);
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

  return (
    <div className="w-full">
      <div className="mb-2 flex justify-end">
        <Tabs
          value={view}
          onValueChange={(value) => {
            setTooltip(null);
            setView(value as MoodChartView);
          }}
        >
          <TabsList className="gap-0.5">
            <TabsTrigger value="day" className="px-2.5 py-1 text-xs">
              {t("mood.chart.day")}
            </TabsTrigger>
            <TabsTrigger value="week" className="px-2.5 py-1 text-xs">
              {t("mood.chart.week")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isEmpty ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">{t("mood.chart.empty")}</div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
            className="h-auto w-full"
            role="img"
            aria-label={`${t("mood.chart.title")} ${view === "day" ? t("mood.chart.day") : t("mood.chart.week")}`}
            onMouseLeave={() => setTooltip(null)}
          >
            {gridLines}
            {view === "day" ? dayAxisLabels : weekAxisLabels}
            {view === "day" ? daySeries : weekSeries}
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
