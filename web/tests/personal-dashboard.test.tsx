import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import PersonalDashboard from "@/pages/PersonalDashboard";

const mocks = vi.hoisted(() => ({ stats: vi.fn(), outcomes: vi.fn() }));
const empty = { data: undefined, isError: false, isLoading: false, refetch: vi.fn() };
vi.mock("@/utils/i18n", () => ({ useTranslate: () => (key: string) => key }));
vi.mock("@/hooks/useCurrentUser", () => ({ default: () => ({ name: "users/owner" }) }));
vi.mock("@/contexts/InstanceContext", () => ({ useInstance: () => ({ memoRelatedSetting: { moodEmojis: [] } }) }));
vi.mock("@/hooks/useUserQueries", () => ({ useUserStats: mocks.stats }));
vi.mock("@/hooks/useFinanceQueries", () => ({
  financeKeys: { transactions: (name: string) => ["finance", name] },
  useFinanceWallets: () => empty,
  useFinanceCategories: () => empty,
  useFinanceSummary: () => empty,
}));
vi.mock("@/hooks/useReminderQueries", () => ({
  useReminders: () => empty,
  useReminderStats: mocks.outcomes,
  useCompleteReminder: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => empty }));
vi.mock("@/connect", () => ({ financeServiceClient: {} }));
vi.mock("@/components/ActivityCalendar/MonthCalendar", () => ({ MonthCalendar: () => <div>personal-calendar</div> }));
vi.mock("@/components/Finance/FinanceTransactionDialog", () => ({
  default: ({ inline }: { inline: boolean }) => (
    <div data-testid="entry" data-inline={inline}>
      finance-entry
    </div>
  ),
}));

describe("PersonalDashboard", () => {
  it("shows all personal modules together without a Space provider, with an inclusive reminder range", () => {
    mocks.stats.mockReturnValue(empty);
    mocks.outcomes.mockReturnValue(empty);
    render(
      <MemoryRouter initialEntries={["/personal?date=2026-09-16&range=month"]}>
        <PersonalDashboard />
      </MemoryRouter>,
    );
    for (const name of ["personal.mood", "personal.finance", "personal.reminders"]) {
      expect(screen.getByRole("heading", { name })).toBeVisible();
    }
    expect(mocks.stats).toHaveBeenCalledWith("users/owner");
    expect(mocks.outcomes).toHaveBeenCalledWith("users/owner", "2026-09-01", "2026-09-30");
    expect(screen.getByRole("link", { name: "personal.finance-settings" })).toHaveAttribute("href", "/setting#finance");
    fireEvent.click(screen.getByRole("button", { name: "personal.day" }));
    expect(mocks.outcomes).toHaveBeenLastCalledWith("users/owner", "2026-09-16", "2026-09-16");
  });
  it("opens entry inline while keeping mood and reminder sections visible", () => {
    mocks.stats.mockReturnValue(empty);
    mocks.outcomes.mockReturnValue(empty);
    render(
      <MemoryRouter initialEntries={["/personal?entry=finance"]}>
        <PersonalDashboard />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("entry")).toHaveAttribute("data-inline", "true");
    expect(screen.getByRole("heading", { name: "personal.mood" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "personal.reminders" })).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
