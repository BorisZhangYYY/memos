import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { calculateMaxCount, MonthCalendar } from "@/components/ActivityCalendar";
import { DEFAULT_MOOD_EMOJIS } from "@/components/MemoEditor/Toolbar/MoodSelector";
import { useInstance } from "@/contexts/InstanceContext";
import { useMemoFilterContext } from "@/contexts/MemoFilterContext";
import { useDateFilterNavigation } from "@/hooks";
import type { StatisticsData } from "@/types/statistics";
import { MonthNavigator } from "./MonthNavigator";

interface Props {
  statisticsData: StatisticsData;
  /** Average mood level (1-7) per day, keyed by "YYYY-MM-DD"; shown as an emoji on calendar days. */
  dailyMoodStats?: Record<string, number>;
  onDateSelect?: () => void;
  /** When set, day clicks land on this route with the date filter instead of filtering the current one. */
  navigationTarget?: string;
}

const StatisticsView = (props: Props) => {
  const { statisticsData, dailyMoodStats } = props;
  const { activityStats, timeBasis } = statisticsData;
  const { filters } = useMemoFilterContext();
  const navigateToDateFilter = useDateFilterNavigation(props.navigationTarget);
  const { memoRelatedSetting } = useInstance();
  const emojis = memoRelatedSetting?.moodEmojis?.length === 7 ? memoRelatedSetting.moodEmojis : DEFAULT_MOOD_EMOJIS;
  const [visibleMonthString, setVisibleMonthString] = useState(dayjs().format("YYYY-MM"));
  const selectedDate = filters.find((filter) => filter.factor === "displayTime")?.value;

  // Average mood emoji for the visible month, shown next to the month title.
  const monthlyMoodEmoji = useMemo(() => {
    if (!dailyMoodStats) return undefined;
    const prefix = `${visibleMonthString}-`;
    const monthDays = Object.entries(dailyMoodStats).filter(([date]) => date.startsWith(prefix));
    if (monthDays.length === 0) return undefined;
    const avg = monthDays.reduce((sum, [, value]) => sum + value, 0) / monthDays.length;
    const level = Math.round(avg);
    return level >= 1 && level <= 7 ? emojis[level - 1] : undefined;
  }, [dailyMoodStats, visibleMonthString, emojis]);

  return (
    <div className="group mt-0.5 flex w-full flex-col text-muted-foreground animate-fade-in">
      <MonthNavigator visibleMonth={visibleMonthString} onMonthChange={setVisibleMonthString} monthlyMoodEmoji={monthlyMoodEmoji} />

      <div className="w-full animate-scale-in">
        <MonthCalendar
          month={visibleMonthString}
          data={activityStats}
          maxCount={calculateMaxCount(activityStats)}
          selectedDate={selectedDate}
          onClick={(date) => {
            navigateToDateFilter(date);
            props.onDateSelect?.();
          }}
          timeBasis={timeBasis}
          moodData={dailyMoodStats}
        />
      </div>
    </div>
  );
};

export default StatisticsView;
