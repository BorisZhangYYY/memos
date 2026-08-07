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
});
