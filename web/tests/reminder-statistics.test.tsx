import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ReminderStatistics from "@/components/Reminder/ReminderStatistics";

const reminderStats = vi.hoisted(() => ({ list: vi.fn(), stats: vi.fn() }));

vi.mock("@/hooks/useReminderQueries", () => ({
  useReminderOccurrences: (...args: unknown[]) => {
    reminderStats.list(...args);
    return { data: [] };
  },
  useReminderStats: (...args: unknown[]) => {
    reminderStats.stats(...args);
    return { data: { completedOnTimeCount: 3, completedLateCount: 2, skippedCount: 1, finalCompletionRate: 5 / 6 }, isLoading: false };
  },
}));

vi.mock("@/utils/i18n", () => ({
  useTranslate: () => (key: string) => key,
}));

describe("<ReminderStatistics>", () => {
  it("owns its seven-day, thirty-day, and history filters", () => {
    render(<ReminderStatistics parent="users/demo" />);

    expect(screen.getByRole("tab", { name: "mood.chart.week" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "mood.chart.trend" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "reminder.stats-more-history" })).toBeInTheDocument();
    expect(screen.getByText("reminder.stats-status-on-time")).toBeInTheDocument();
    expect(screen.getByText("reminder.stats-late")).toBeInTheDocument();
    expect(screen.getByText("reminder.stats-skipped")).toBeInTheDocument();
    expect(screen.getByText("reminder.stats-final-rate")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "reminder.stats-more-history" }));
    const latest = reminderStats.stats.mock.calls.at(-1);
    expect(latest?.[1]).toBe("1970-01-01");
  });
});
