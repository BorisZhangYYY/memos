import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReminderDashboard from "@/components/Reminder/ReminderDashboard";

const reminderState = vi.hoisted(() => ({ complete: vi.fn(), reminders: [] as Array<Record<string, unknown>> }));

vi.mock("@/hooks/useReminderQueries", () => ({
  useCompleteReminder: () => ({ mutate: reminderState.complete }),
  useReminderLists: () => ({ data: [] }),
  useReminders: () => ({ data: reminderState.reminders }),
}));

vi.mock("@/utils/i18n", () => ({ useTranslate: () => (key: string) => key }));

describe("<ReminderDashboard>", () => {
  beforeEach(() => {
    reminderState.complete.mockReset();
    reminderState.reminders = [];
  });

  it("keeps the empty dashboard completion-only", () => {
    render(<ReminderDashboard parent="users/demo" onOpenCenter={vi.fn()} onOpenReminder={vi.fn()} />);

    expect(screen.getByText("reminder.dashboard-empty")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "reminder.click-empty-to-create" })).not.toBeInTheDocument();
  });

  it("lets the dashboard complete existing reminders without exposing a create action", () => {
    reminderState.reminders = [
      {
        name: "users/demo/reminders/one",
        title: "Buy milk",
        reminderList: "users/demo/reminderLists/default",
        priority: 0,
        flagged: false,
      },
    ];
    render(<ReminderDashboard parent="users/demo" onOpenCenter={vi.fn()} onOpenReminder={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "reminder.complete" }));
    expect(reminderState.complete).toHaveBeenCalledWith("users/demo/reminders/one");
    expect(screen.queryByRole("button", { name: "reminder.click-empty-to-create" })).not.toBeInTheDocument();
  });
});
