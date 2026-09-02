import { describe, expect, it } from "vitest";
import { Reminder_Status } from "@/types/proto/api/v1/reminder_service_pb";
import { dateKeyInTimeZone, isReminderOverdue } from "@/utils/reminder-overdue";

describe("reminder overdue state", () => {
  const now = new Date("2026-08-30T16:30:00Z");

  it("uses the reminder time zone at the calendar-day boundary", () => {
    expect(dateKeyInTimeZone(now, "Asia/Shanghai")).toBe("2026-08-31");
    expect(dateKeyInTimeZone(now, "America/Los_Angeles")).toBe("2026-08-30");
  });

  it("marks only pending reminders before today as overdue", () => {
    expect(isReminderOverdue({ dueDate: "2026-08-30", timeZone: "Asia/Shanghai", status: Reminder_Status.PENDING }, now)).toBe(true);
    expect(isReminderOverdue({ dueDate: "2026-08-30", timeZone: "America/Los_Angeles", status: Reminder_Status.PENDING }, now)).toBe(false);
    expect(isReminderOverdue({ dueDate: "2026-08-30", timeZone: "Asia/Shanghai", status: Reminder_Status.COMPLETED }, now)).toBe(false);
  });
});
