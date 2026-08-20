import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import ReminderListDialog from "@/components/Reminder/ReminderListDialog";

vi.mock("@/utils/i18n", () => ({ useTranslate: () => (key: string) => key }));

describe("<ReminderListDialog>", () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  it("creates a list with its selected name, color, and icon", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(<ReminderListDialog open onOpenChange={onOpenChange} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("reminder.list-name"), { target: { value: "Work" } });
    fireEvent.click(screen.getByRole("button", { name: "reminder.list-color: #FF453A" }));
    fireEvent.click(screen.getByRole("button", { name: "reminder.list-icon.work" }));
    fireEvent.click(screen.getByRole("button", { name: "common.create" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ displayName: "Work", color: "#FF453A", icon: "work" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
