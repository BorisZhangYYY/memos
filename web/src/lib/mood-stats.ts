export interface MoodPoint {
  createTime: Date;
  moodLevel: number;
  memoName?: string;
}

export interface DayViewPoint extends MoodPoint {
  /** Seconds since local midnight; keeps same-minute mood entries distinct. */
  seconds: number;
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

const isValidMoodLevel = (level: number) => level >= 1 && level <= MAX_MOOD_LEVEL;

const isSameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const toDateString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Moods created on the same local day as `now`, sorted chronologically. */
export const dayViewPoints = (points: MoodPoint[], now: Date): DayViewPoint[] =>
  points
    .filter((point) => isValidMoodLevel(point.moodLevel) && isSameLocalDay(point.createTime, now))
    .map((point) => ({
      ...point,
      seconds: point.createTime.getHours() * 60 * 60 + point.createTime.getMinutes() * 60 + point.createTime.getSeconds(),
    }))
    .sort((a, b) => a.seconds - b.seconds);

/** Daily mood aggregates for the `windowDays` local days ending at `now`. */
export const aggregateDays = (points: MoodPoint[], now: Date, windowDays: number): DayStats[] => {
  const days: DayStats[] = [];
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let offset = windowDays - 1; offset >= 0; offset--) {
    const dayStart = new Date(todayStart);
    dayStart.setDate(todayStart.getDate() - offset);
    const levels = points
      .filter((point) => isValidMoodLevel(point.moodLevel) && isSameLocalDay(point.createTime, dayStart))
      .map((point) => point.moodLevel);
    if (levels.length === 0) continue;
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

export const weekViewDays = (points: MoodPoint[], now: Date): DayStats[] => aggregateDays(points, now, 7);
