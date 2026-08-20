import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ReminderListIcon, {
  isDefaultReminderList,
  normalizeReminderListIcon,
  REMINDER_LIST_ICON_OPTIONS,
} from "@/components/Reminder/ReminderListIcon";

describe("ReminderListIcon", () => {
  it("offers the common reminder-list scenarios", () => {
    expect(REMINDER_LIST_ICON_OPTIONS.map((option) => option.value)).toEqual([
      "list",
      "personal",
      "work",
      "home",
      "shopping",
      "fitness",
      "study",
      "travel",
      "tasks",
    ]);
  });

  it("falls back to the list icon for unknown stored values", () => {
    expect(normalizeReminderListIcon("unknown-client-icon")).toBe("list");
    render(<ReminderListIcon icon="unknown-client-icon" aria-label="Reminder list" />);

    expect(screen.getByLabelText("Reminder list")).toBeInTheDocument();
  });

  it("recognizes only the protected default list resource", () => {
    expect(isDefaultReminderList("users/demo/reminderLists/default")).toBe(true);
    expect(isDefaultReminderList("users/demo/reminderLists/work")).toBe(false);
  });
});
