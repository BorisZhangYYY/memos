import { describe, expect, it } from "vitest";
import { dayViewPoints, type MoodPoint, weekViewDays } from "@/lib/mood-stats";

// All dates are built with local-time constructors so the day/window bucketing
// (which follows the browser-local calendar) is timezone-independent.
const point = (year: number, month: number, day: number, hour: number, minute: number, level: number): MoodPoint => ({
  createTime: new Date(year, month, day, hour, minute),
  moodLevel: level,
});

describe("dayViewPoints", () => {
  const now = new Date(2026, 7, 7, 12, 0);

  it("keeps only the same local day, mapping each point to seconds since midnight and sorting by time", () => {
    const points = [
      point(2026, 7, 7, 23, 59, 3),
      point(2026, 7, 7, 0, 1, 5),
      point(2026, 7, 7, 12, 0, 4),
      point(2026, 7, 6, 23, 59, 7), // yesterday
      point(2026, 7, 8, 0, 0, 1), // tomorrow
    ];
    expect(dayViewPoints(points, now)).toEqual([
      { ...point(2026, 7, 7, 0, 1, 5), seconds: 60 },
      { ...point(2026, 7, 7, 12, 0, 4), seconds: 43200 },
      { ...point(2026, 7, 7, 23, 59, 3), seconds: 86340 },
    ]);
  });

  it("drops memos without a valid mood level", () => {
    const points = [point(2026, 7, 7, 8, 0, 0), point(2026, 7, 7, 9, 0, 8), point(2026, 7, 7, 10, 0, 7)];
    expect(dayViewPoints(points, now)).toEqual([{ ...point(2026, 7, 7, 10, 0, 7), seconds: 36000 }]);
  });

  it("returns an empty list when nothing was recorded today", () => {
    expect(dayViewPoints([point(2026, 7, 6, 12, 0, 5)], now)).toEqual([]);
  });
});

describe("weekViewDays", () => {
  const now = new Date(2026, 7, 7, 12, 0);

  it("aggregates avg/min/max over the 7 local days ending at now, oldest first", () => {
    const points = [
      point(2026, 6, 20, 10, 0, 2), // out of window
      point(2026, 7, 1, 10, 0, 2), // day one: avg 3, range 2-4
      point(2026, 7, 1, 12, 0, 4),
      point(2026, 7, 2, 9, 0, 5), // day two: avg 5, range 5-5
      point(2026, 7, 3, 9, 0, 6), // day three: avg 6, range 6-6
      point(2026, 7, 5, 9, 0, 1), // day five: avg 1, range 1-1
      point(2026, 7, 7, 9, 0, 7), // today: avg 7, range 7-7
    ];
    expect(weekViewDays(points, now)).toEqual([
      { date: "2026-08-01", count: 2, avg: 3, min: 2, max: 4 },
      { date: "2026-08-02", count: 1, avg: 5, min: 5, max: 5 },
      { date: "2026-08-03", count: 1, avg: 6, min: 6, max: 6 },
      { date: "2026-08-05", count: 1, avg: 1, min: 1, max: 1 },
      { date: "2026-08-07", count: 1, avg: 7, min: 7, max: 7 },
    ]);
  });

  it("spans a month boundary", () => {
    const firstOfAugust = new Date(2026, 7, 1, 12, 0);
    const points = [
      point(2026, 6, 25, 9, 0, 5), // out of window
      point(2026, 6, 26, 9, 0, 4), // window start
      point(2026, 6, 31, 9, 0, 4), // last day of July
      point(2026, 7, 1, 9, 0, 6), // today
    ];
    expect(weekViewDays(points, firstOfAugust).map((day) => day.date)).toEqual(["2026-07-26", "2026-07-31", "2026-08-01"]);
  });

  it("drops invalid levels and returns an empty list when nothing is in the window", () => {
    const points = [
      point(2026, 7, 3, 9, 0, 0),
      point(2026, 7, 4, 9, 0, 8),
      point(2026, 7, 20, 9, 0, 5), // out of window
    ];
    expect(weekViewDays(points, now)).toEqual([]);
  });
});
