import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MemoRelatedSettings from "@/components/Settings/MemoRelatedSettings";
import { InstanceSetting_Key } from "@/types/proto/api/v1/instance_service_pb";

const DEFAULT_MOOD_EMOJIS = ["😫", "😟", "😔", "😐", "😌", "☺️", "😆"];

const { saveInstanceSettingMock } = vi.hoisted(() => ({ saveInstanceSettingMock: vi.fn() }));

const mockInstance = {
  memoRelatedSetting: {
    reactions: ["👍"],
  },
};

vi.mock("@/contexts/InstanceContext", () => ({
  useInstance: () => mockInstance,
}));

vi.mock("@/utils/i18n", () => ({
  useTranslate: () => (key: string) => key,
}));

vi.mock("@/components/Settings/useInstanceSettingUpdater", () => ({
  default: () => saveInstanceSettingMock,
  buildInstanceSettingName: (key: InstanceSetting_Key) => `instance/settings/${key}`,
}));

const renderSettings = () => render(<MemoRelatedSettings />);

const moodInputs = (): HTMLInputElement[] => {
  const textboxes = screen.getAllByRole("textbox");
  return textboxes.slice(1) as HTMLInputElement[];
};

const savedMoodEmojis = (): string[] => {
  const call = saveInstanceSettingMock.mock.calls[0][0];
  return call.setting.value.value.moodEmojis as string[];
};

describe("<MemoRelatedSettings> mood emojis", () => {
  beforeEach(() => {
    saveInstanceSettingMock.mockReset();
  });

  it("shows the 7 default emojis when the setting has no moodEmojis", () => {
    mockInstance.memoRelatedSetting = { reactions: ["👍"] };
    renderSettings();

    expect(moodInputs()).toHaveLength(7);
    expect(moodInputs().map((input) => input.value)).toEqual(DEFAULT_MOOD_EMOJIS);
  });

  it("restores the default emoji when a mood emoji is cleared before saving", () => {
    mockInstance.memoRelatedSetting = { reactions: ["👍"], moodEmojis: DEFAULT_MOOD_EMOJIS };
    renderSettings();

    fireEvent.change(moodInputs()[2], { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    expect(saveInstanceSettingMock).toHaveBeenCalledTimes(1);
    expect(savedMoodEmojis()[2]).toBe("😔");
    expect(savedMoodEmojis()).toEqual(DEFAULT_MOOD_EMOJIS);
  });

  it("keeps custom non-empty mood emojis when saving", () => {
    const custom = ["💀", "😡", "😕", "😐", "🙂", "😊", "🤩"];
    mockInstance.memoRelatedSetting = { reactions: ["👍"], moodEmojis: custom };
    renderSettings();

    // Dirty the form via the content length field so saving does not short-circuit on the unchanged state.
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "42" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    expect(saveInstanceSettingMock).toHaveBeenCalledTimes(1);
    expect(savedMoodEmojis()).toEqual(custom);
  });
});
