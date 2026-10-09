import { create } from "@bufbuild/protobuf";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { CalendarDayCell as CalendarDayCellData } from "@/components/ActivityCalendar/types";
import { CalendarDayCell } from "@/components/CalendarView/CalendarDayCell";
import type { CalendarDaySummary } from "@/components/CalendarView/dayModel";
import { MemoSchema } from "@/types/proto/api/v1/memo_service_pb";

const day: CalendarDayCellData = {
  date: "2026-08-02",
  label: 2,
  count: 2,
  isCurrentMonth: true,
  isToday: false,
  isSelected: false,
};

const summary: CalendarDaySummary = {
  memos: [create(MemoSchema, { name: "memos/one" }), create(MemoSchema, { name: "memos/two" })],
  entries: [
    { memoName: "memos/one", text: "First", moodLevel: 1 },
    { memoName: "memos/two", text: "Second", moodLevel: 7 },
  ],
  moodLevels: [1, 7],
};

const moodEmojis = ["🥶", "😨", "😟", "🌤️", "🙂", "😄", "🤩"];

const renderDay = (emojis?: string[]) =>
  render(
    <MemoryRouter>
      <CalendarDayCell
        day={day}
        summary={summary}
        moodEmojis={emojis}
        visibleRows={2}
        pending={false}
        timeBasis="create_time"
        tabIndex={0}
        isLastColumn={false}
        isLastRow={false}
      />
    </MemoryRouter>,
  );

describe("calendar day mood", () => {
  it("shows configured mood icons for memo rows and the day's average", () => {
    renderDay(moodEmojis);

    expect(screen.getByText("🥶")).toBeInTheDocument();
    expect(screen.getByText("🤩")).toBeInTheDocument();
    expect(screen.getByText("🌤️")).toBeInTheDocument();
    expect(screen.getByRole("link").getAttribute("aria-label")).toContain("4");
  });

  it("hides mood icons when the mood feature is disabled", () => {
    renderDay();

    expect(screen.queryByText("🥶")).not.toBeInTheDocument();
    expect(screen.queryByText("🤩")).not.toBeInTheDocument();
    expect(screen.queryByText("🌤️")).not.toBeInTheDocument();
  });
});
