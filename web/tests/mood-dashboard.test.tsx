import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MoodDashboard from "@/components/MoodDashboard";

vi.mock("@/contexts/InstanceContext", () => ({
  useInstance: () => ({ memoRelatedSetting: {} }),
}));

vi.mock("@/utils/i18n", () => ({
  useTranslate: () => (key: string) => key,
}));

describe("<MoodDashboard>", () => {
  it("opens the exact memo associated with a mood record", () => {
    const onMemoSelect = vi.fn();
    const createTime = new Date();
    createTime.setHours(10, 30, 15, 0);

    render(<MoodDashboard points={[{ createTime, moodLevel: 6, memoName: "memos/mood-123" }]} onMemoSelect={onMemoSelect} />);

    fireEvent.click(screen.getByTitle("mood.dashboard.open-memo"));
    expect(onMemoSelect).toHaveBeenCalledOnce();
    expect(onMemoSelect).toHaveBeenCalledWith("memos/mood-123");
  });
});
