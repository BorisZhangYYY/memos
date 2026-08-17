import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PersonalDashboardWidget from "@/components/PersonalDashboardWidget";

vi.mock("@/utils/i18n", () => ({ useTranslate: () => (key: string) => key }));

const renderWidget = () =>
  render(
    <PersonalDashboardWidget labels={["Mood", "Finance", "Reminders"]}>
      <div>Mood panel</div>
      <div>Finance panel</div>
      <div>Reminder panel</div>
    </PersonalDashboardWidget>,
  );

describe("PersonalDashboardWidget", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("expands the active dashboard and remembers the preference", () => {
    const firstRender = renderWidget();
    const expandButton = screen.getByRole("button", { expanded: false });

    expect(screen.getByRole("tabpanel")).toHaveClass("h-64");

    fireEvent.click(expandButton);

    expect(screen.getByRole("tabpanel")).toHaveClass("h-[min(36rem,70dvh)]");
    expect(expandButton).toHaveAttribute("aria-expanded", "true");

    firstRender.unmount();
    renderWidget();

    expect(screen.getByRole("tabpanel")).toHaveClass("h-[min(36rem,70dvh)]");
    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
  });
});
