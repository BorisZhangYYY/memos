import { memo, useMemo } from "react";
import { DEFAULT_MOOD_EMOJIS } from "@/components/MemoEditor/Toolbar/MoodSelector";
import { useInstance } from "@/contexts/InstanceContext";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";
import { CalendarCell } from "./CalendarCell";
import { useTodayDate, useWeekdayLabels } from "./hooks";
import type { CalendarSize, MonthCalendarProps } from "./types";
import { useCalendarMatrix } from "./useCalendar";
import { getTooltipText } from "./utils";

const GRID_STYLES: Record<CalendarSize, { gap: string; headerText: string }> = {
  small: { gap: "gap-1", headerText: "text-[9px]" },
  default: { gap: "gap-1", headerText: "text-[10px]" },
};

interface WeekdayHeaderProps {
  weekDays: string[];
  size: CalendarSize;
}

const WeekdayHeader = memo(({ weekDays, size }: WeekdayHeaderProps) => (
  <div className={cn("mb-1.5 grid grid-cols-7", GRID_STYLES[size].gap, GRID_STYLES[size].headerText)} role="row">
    {weekDays.map((label, index) => (
      <div
        key={index}
        className="flex h-5 items-center justify-center font-medium uppercase tracking-[0.04em] text-muted-foreground/50"
        role="columnheader"
        aria-label={label}
      >
        {Array.from(label)[0]}
      </div>
    ))}
  </div>
));
WeekdayHeader.displayName = "WeekdayHeader";

export const MonthCalendar = memo((props: MonthCalendarProps) => {
  const {
    month,
    data,
    maxCount,
    size = "default",
    onClick,
    selectedDate,
    className,
    disableTooltips = false,
    timeBasis = "create_time",
    moodData,
  } = props;
  const t = useTranslate();
  const { generalSetting, memoRelatedSetting } = useInstance();
  const today = useTodayDate();
  const weekDays = useWeekdayLabels();
  const gridStyle = GRID_STYLES[size];

  const { weeks, weekDays: rotatedWeekDays } = useCalendarMatrix({
    month,
    data,
    weekDays,
    weekStartDayOffset: generalSetting.weekStartDayOffset,
    today,
    selectedDate: selectedDate ?? "",
    moodData,
  });

  const flatDays = useMemo(() => weeks.flatMap((week) => week.days), [weeks]);

  // Map each day's average mood level to its emoji, using the instance's
  // configured emojis when a full set of 7 is provided.
  const moodEmojisByDate = useMemo(() => {
    if (!moodData) {
      return {};
    }
    const emojis = memoRelatedSetting.moodEmojis?.length === 7 ? memoRelatedSetting.moodEmojis : DEFAULT_MOOD_EMOJIS;
    const byDate: Record<string, string> = {};
    for (const [date, avg] of Object.entries(moodData)) {
      const level = Math.round(avg);
      if (level >= 1 && level <= 7) {
        byDate[date] = emojis[level - 1];
      }
    }
    return byDate;
  }, [moodData, memoRelatedSetting.moodEmojis]);

  return (
    <div className={cn("flex flex-col", className)} role="grid" aria-label={`Calendar for ${month}`}>
      <WeekdayHeader weekDays={rotatedWeekDays} size={size} />

      <div className={cn("grid grid-cols-7", gridStyle.gap)} role="rowgroup">
        {flatDays.map((day) => (
          <CalendarCell
            key={day.date}
            day={day}
            maxCount={maxCount}
            tooltipText={getTooltipText(day.count, day.date, t, timeBasis)}
            onClick={onClick}
            size={size}
            disableTooltip={disableTooltips}
            moodEmoji={moodEmojisByDate[day.date]}
          />
        ))}
      </div>
    </div>
  );
});

MonthCalendar.displayName = "MonthCalendar";
