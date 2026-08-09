import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { describe, expect, it } from "vitest";
import { dailyMoodStatsFromLevels } from "@/hooks/useFilteredMemoStats";
import { UserStatsSchema } from "@/types/proto/api/v1/user_service_pb";

const makeStats = (dates: Date[], levels: number[]) =>
  create(UserStatsSchema, {
    memoCreatedTimestamps: dates.map((date) => timestampFromDate(date)),
    moodLevels: levels,
  });

describe("dailyMoodStatsFromLevels", () => {
  it("averages mood levels per browser-local day, skipping non-mooded memos", () => {
    const stats = makeStats(
      [new Date(2026, 7, 7, 23, 59), new Date(2026, 7, 7, 0, 1), new Date(2026, 7, 7, 12, 0)],
      [3, 5, 0],
    );
    expect(dailyMoodStatsFromLevels(stats)).toEqual({ "2026-08-07": 4 });
  });

  it("buckets by the browser-local calendar date, not the UTC date", () => {
    // 23:30 local on the 7th and 00:30 local on the 8th must land on
    // different days regardless of the runner's timezone.
    const stats = makeStats([new Date(2026, 7, 7, 23, 30), new Date(2026, 7, 8, 0, 30)], [7, 1]);
    expect(dailyMoodStatsFromLevels(stats)).toEqual({ "2026-08-07": 7, "2026-08-08": 1 });
  });

  it("returns an empty map for empty or misaligned arrays", () => {
    expect(dailyMoodStatsFromLevels(create(UserStatsSchema, {}))).toEqual({});
    const misaligned = create(UserStatsSchema, {
      memoCreatedTimestamps: [timestampFromDate(new Date(2026, 7, 7, 12, 0))],
      moodLevels: [],
    });
    expect(dailyMoodStatsFromLevels(misaligned)).toEqual({});
  });
});
