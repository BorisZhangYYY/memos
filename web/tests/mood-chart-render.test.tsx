import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MoodChart, type MoodPoint } from "@/components/MoodChart";

vi.mock("@/contexts/InstanceContext", () => ({
  useInstance: () => ({ memoRelatedSetting: {} }),
}));

vi.mock("@/utils/i18n", () => ({
  useTranslate: () => (key: string) => key,
}));

const point = (year: number, month: number, day: number, hour: number, minute: number, level: number): MoodPoint => ({
  createTime: new Date(year, month, day, hour, minute),
  moodLevel: level,
});

const todayPoint = (hour: number, minute: number, level: number): MoodPoint => {
  const today = new Date();
  return point(today.getFullYear(), today.getMonth(), today.getDate(), hour, minute, level);
};

const daysAgoPoint = (daysAgo: number, hour: number, minute: number, level: number): MoodPoint => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return point(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, level);
};

const todayString = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
};

const hitCircles = (container: HTMLElement) => container.querySelectorAll('circle[fill="transparent"]');

describe("<MoodChart> day view (selectedDate)", () => {
  it("renders points for the selected day and shows a hover tooltip with time and mood level", () => {
    const { container } = render(<MoodChart points={[todayPoint(10, 30, 5), todayPoint(14, 15, 6)]} selectedDate={todayString()} />);

    expect(container.querySelector("svg")).not.toBeNull();
    // 2 visible point marks + 2 invisible hit targets.
    expect(container.querySelectorAll("circle").length).toBe(4);
    expect(hitCircles(container).length).toBe(2);

    fireEvent.mouseEnter(hitCircles(container)[0]);
    expect(screen.getByRole("tooltip").textContent).toContain("10:30");
    expect(screen.getByRole("tooltip").textContent).toContain("mood.level-5");
  });

  it("shows an empty state instead of the svg when the selected day has no mood records", () => {
    const { container } = render(<MoodChart points={[daysAgoPoint(1, 9, 0, 5)]} selectedDate={todayString()} />);

    expect(screen.getByText("mood.chart.empty")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("<MoodChart> trend view (7/30-day window)", () => {
  it("shows an empty state when the trend window has no mood records", () => {
    const { container } = render(<MoodChart points={[daysAgoPoint(31, 9, 0, 5)]} />);

    // Default is today's view; switch to the 30-day window first.
    fireEvent.click(screen.getByRole("tab", { name: "mood.chart.trend" }));
    expect(screen.getByText("mood.chart.empty")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders the range band, average line and hover tooltip for recent days", () => {
    const points = [
      daysAgoPoint(2, 9, 0, 3),
      daysAgoPoint(2, 11, 0, 5), // avg 4, range 3-5
      daysAgoPoint(1, 9, 0, 6),
      todayPoint(9, 0, 7),
    ];
    const { container } = render(<MoodChart points={points} />);
    fireEvent.click(screen.getByRole("tab", { name: "mood.chart.trend" }));

    // 3 consecutive days with data form one run: one band polygon and one average line.
    expect(container.querySelector("polygon")).not.toBeNull();
    expect(container.querySelectorAll("polyline").length).toBe(1);
    expect(hitCircles(container).length).toBe(3);

    fireEvent.mouseEnter(hitCircles(container)[0]);
    expect(screen.getByRole("tooltip").textContent).toContain("4.0 (3–5)");
  });

  it("keeps points on their calendar slots when earlier days in the window have no data", () => {
    const points = [daysAgoPoint(1, 9, 0, 6), todayPoint(9, 0, 7)];
    const { container } = render(<MoodChart points={points} />);
    fireEvent.click(screen.getByRole("tab", { name: "mood.chart.trend" }));

    // ViewBox geometry mirrors MoodChart's constants: PLOT_LEFT=34, PLOT_WIDTH=512, window=30.
    const xForDaySlot = (index: number) => 34 + ((index + 0.5) / 30) * 512;
    // Yesterday is slot 28 and today is slot 29 — never the left-shifted 0/1 that a
    // "index among days with data" mapping would produce for a gapped window.
    // Each point renders two circles (visible mark + hit target) at the same cx.
    const pointXs = [...new Set([...container.querySelectorAll("circle")].map((circle) => Number(circle.getAttribute("cx"))))];
    expect(pointXs).toHaveLength(2);
    expect(pointXs[0]).toBeCloseTo(xForDaySlot(28), 1);
    expect(pointXs[1]).toBeCloseTo(xForDaySlot(29), 1);
    expect(pointXs[0]).not.toBeCloseTo(xForDaySlot(0), 1);

    // The MM-DD axis labels sit on the same slots as the points above them.
    const labelXs = screen.getAllByText(/^\d{2}-\d{2}$/).map((label) => Number(label.getAttribute("x")));
    expect(labelXs.at(-1)).toBeCloseTo(xForDaySlot(29), 1);
  });
});
