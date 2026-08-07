import type { MemoTimeBasis } from "@/contexts/ViewContext";

export interface StatisticsViewProps {
  className?: string;
}

export interface MonthNavigatorProps {
  visibleMonth: string;
  onMonthChange: (month: string) => void;
  /** Emoji of the visible month's average mood; rendered next to the title. */
  monthlyMoodEmoji?: string;
}

export interface StatisticsData {
  activityStats: Record<string, number>;
  timeBasis: MemoTimeBasis;
}
