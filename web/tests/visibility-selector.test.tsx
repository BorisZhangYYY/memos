import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VisibilitySelector from "@/components/MemoEditor/Toolbar/VisibilitySelector";
import { Visibility } from "@/types/proto/api/v1/memo_service_pb";

const instance = vi.hoisted(() => ({ allowedVisibilities: [] as string[] }));

vi.mock("@/contexts/InstanceContext", () => ({
  useInstance: () => ({ memoRelatedSetting: instance }),
}));

vi.mock("@/utils/i18n", () => ({
  useTranslate: () => (key: string, params?: Record<string, unknown>) => (params?.visibility ? `${key}:${params.visibility}` : key),
}));

describe("<VisibilitySelector>", () => {
  beforeEach(() => {
    instance.allowedVisibilities = [];
  });

  it("shows the current visibility normally while it remains allowed", () => {
    render(<VisibilitySelector value={Visibility.PUBLIC} onChange={vi.fn()} />);

    expect(screen.getByRole("button")).toHaveTextContent("memo.visibility.public");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("explains a legacy visibility that the instance has disabled", async () => {
    instance.allowedVisibilities = ["PRIVATE"];
    render(<VisibilitySelector value={Visibility.PUBLIC} onChange={vi.fn()} />);

    const trigger = screen.getByRole("button");
    expect(trigger).toHaveTextContent("memo.visibility.public");
    expect(trigger).toHaveAttribute("title", "memo.visibility.disabled-current-title:memo.visibility.public");

    fireEvent.click(trigger);

    expect(await screen.findByRole("note")).toHaveTextContent("memo.visibility.disabled-current-description:memo.visibility.public");
    expect(screen.getByRole("menuitem", { name: /memo\.visibility\.public/ })).toHaveAttribute("data-disabled");
    expect(screen.getByRole("menuitem", { name: /memo\.visibility\.protected/ })).toBeInTheDocument();
  });

  it("still lets the user downgrade to an allowed visibility", async () => {
    instance.allowedVisibilities = ["PRIVATE"];
    const onChange = vi.fn();
    render(<VisibilitySelector value={Visibility.PUBLIC} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /memo\.visibility\.private/ }));

    expect(onChange).toHaveBeenCalledWith(Visibility.PRIVATE);
  });
});
