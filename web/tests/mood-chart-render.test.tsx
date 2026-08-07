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

const hitCircles = (container: HTMLElement) => container.querySelectorAll('circle[fill="transparent"]');

describe("<MoodChart> day view", () => {
  it("renders points for today and shows a hover tooltip with time and mood level", () => {
    const { container } = render(<MoodChart points={[todayPoint(10, 30, 5), todayPoint(14, 15, 6)]} />);

    expect(container.querySelector("svg")).not.toBeNull();
    // 2 visible point marks + 2 invisible hit targets.
    expect(container.querySelectorAll("circle").length).toBe(4);
    expect(hitCircles(container).length).toBe(2);

    fireEvent.mouseEnter(hitCircles(container)[0]);
    expect(screen.getByRole("tooltip").textContent).toContain("10:30");
    expect(screen.getByRole("tooltip").textContent).toContain("mood.level-5");
  });

  it("shows an empty state instead of the svg when nothing was recorded today", () => {
    const { container } = render(<MoodChart points={[daysAgoPoint(1, 9, 0, 5)]} />);

    expect(screen.getByText("mood.chart.empty")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("<MoodChart> week view", () => {
  it("switches to the week tab and renders the range band, average line and hover tooltip", () => {
    const points = [
      daysAgoPoint(2, 9, 0, 3),
      daysAgoPoint(2, 11, 0, 5), // avg 4, range 3-5
      daysAgoPoint(1, 9, 0, 6),
      todayPoint(9, 0, 7),
    ];
    const { container } = render(<MoodChart points={points} />);

    fireEvent.click(screen.getByRole("tab", { name: "mood.chart.week" }));

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

    fireEvent.click(screen.getByRole("tab", { name: "mood.chart.week" }));

    // ViewBox geometry mirrors MoodChart's constants: PLOT_LEFT=30, PLOT_WIDTH=516.
    const xForDaySlot = (index: number) => 30 + ((index + 0.5) / 7) * 516;
    // Yesterday is slot 5 and today is slot 6 — never the left-shifted 0/1 that a
    // "index among days with data" mapping would produce for a gapped week.
    // Each point renders two circles (visible mark + hit target) at the same cx.
    const pointXs = [...new Set([...container.querySelectorAll("circle")].map((circle) => Number(circle.getAttribute("cx"))))];
    expect(pointXs).toHaveLength(2);
    expect(pointXs[0]).toBeCloseTo(xForDaySlot(5), 1);
    expect(pointXs[1]).toBeCloseTo(xForDaySlot(6), 1);
    expect(pointXs[0]).not.toBeCloseTo(xForDaySlot(0), 1);

    // The axis labels sit on the same slots as the points above them.
    const labelXs = screen.getAllByText(/^common\.days\./).map((label) => Number(label.getAttribute("x")));
    expect(labelXs.at(-2)).toBeCloseTo(xForDaySlot(5), 1);
    expect(labelXs.at(-1)).toBeCloseTo(xForDaySlot(6), 1);
  });
});
