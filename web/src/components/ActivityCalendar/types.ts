import type { MemoTimeBasis } from "@/contexts/ViewContext";

export type CalendarSize = "default" | "small";
export type CalendarData = Record<string, number>;

export interface CalendarDayCell {
  date: string;
  label: number;
  count: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  /** Average mood level (1-7) of the day's memos; undefined when the day has no mood data. */
  moodAvg?: number;
}

export interface CalendarDayRow {
  days: CalendarDayCell[];
}

export interface CalendarMatrixResult {
  weeks: CalendarDayRow[];
  weekDays: string[];
}

export interface MonthCalendarProps {
  month: string;
  data: CalendarData;
  maxCount: number;
  size?: CalendarSize;
  onClick?: (date: string) => void;
  selectedDate?: string;
  className?: string;
  disableTooltips?: boolean;
  timeBasis?: MemoTimeBasis;
  /** Average mood level (1-7) per day, keyed by "YYYY-MM-DD". */
  moodData?: CalendarData;
}

export interface YearCalendarProps {
  selectedYear: number;
  data: CalendarData;
  onYearChange: (year: number) => void;
  onDateClick: (date: string) => void;
  className?: string;
  timeBasis?: MemoTimeBasis;
}
