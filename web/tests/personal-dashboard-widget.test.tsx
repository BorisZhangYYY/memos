import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PersonalDashboardWidget from "@/components/PersonalDashboardWidget";

vi.mock("@/utils/i18n", () => ({ useTranslate: () => (key: string) => key }));
const { privacyState } = vi.hoisted(() => ({
  privacyState: { privacyMode: 0, requirePasswordForPrivateContent: false },
}));
vi.mock("@/hooks/usePersonalFeatures", () => ({
  default: () => privacyState,
}));

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
    privacyState.privacyMode = 0;
    privacyState.requirePasswordForPrivateContent = false;
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

  it("starts blurred and reveals the dashboard on demand", () => {
    privacyState.privacyMode = 1;
    renderWidget();

    expect(screen.getByRole("tabpanel")).toHaveClass("blur-lg");
    fireEvent.click(screen.getByRole("button", { name: "setting.personal-features.reveal-personal-panels" }));

    expect(screen.getByRole("tabpanel")).not.toHaveClass("blur-lg");
    expect(screen.getByRole("button", { name: "setting.personal-features.hide-again" })).toBeInTheDocument();
  });
});
