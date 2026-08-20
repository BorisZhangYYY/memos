import { create } from "@bufbuild/protobuf";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InstanceSection from "@/components/Settings/InstanceSection";
import {
  InstanceSetting_GeneralSettingSchema,
  InstanceSetting_Key,
  InstanceSetting_MemoRelatedSettingSchema,
} from "@/types/proto/api/v1/instance_service_pb";

const { listIdentityProvidersMock, saveInstanceSettingMock } = vi.hoisted(() => ({
  listIdentityProvidersMock: vi.fn(),
  saveInstanceSettingMock: vi.fn(),
}));

const mockInstance = {
  generalSetting: create(InstanceSetting_GeneralSettingSchema, {}),
  memoRelatedSetting: create(InstanceSetting_MemoRelatedSettingSchema, {}),
  profile: { demo: false, instanceUrl: "https://memos.example.com" },
};

vi.mock("@/contexts/InstanceContext", () => ({
  useInstance: () => mockInstance,
}));

vi.mock("@/connect", () => ({
  identityProviderServiceClient: {
    listIdentityProviders: listIdentityProvidersMock,
  },
}));

vi.mock("@/utils/i18n", () => ({
  useTranslate: () => (key: string) => key,
}));

vi.mock("@/components/Settings/useInstanceSettingUpdater", () => ({
  default: () => saveInstanceSettingMock,
  buildInstanceSettingName: (key: InstanceSetting_Key) => `instance/settings/${InstanceSetting_Key[key]}`,
}));

vi.mock("@/components/UpdateCustomizedProfileDialog", () => ({ default: () => null }));
vi.mock("react-hot-toast", () => ({ toast: { success: vi.fn() } }));

describe("<InstanceSection> public access setting", () => {
  beforeEach(() => {
    saveInstanceSettingMock.mockReset();
    saveInstanceSettingMock.mockResolvedValue(true);
    listIdentityProvidersMock.mockReset();
    listIdentityProvidersMock.mockResolvedValue({ identityProviders: [] });
    mockInstance.generalSetting = create(InstanceSetting_GeneralSettingSchema, {});
    mockInstance.memoRelatedSetting = create(InstanceSetting_MemoRelatedSettingSchema, {});
    mockInstance.profile = { demo: false, instanceUrl: "https://memos.example.com" };
  });

  it("stores the off state as PRIVATE plus PROTECTED", async () => {
    render(<InstanceSection />);

    const publicAccessSwitch = screen.getByRole("switch", { name: "setting.instance.public-access" });
    expect(publicAccessSwitch).toBeChecked();

    fireEvent.click(publicAccessSwitch);
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() => expect(saveInstanceSettingMock).toHaveBeenCalledTimes(1));
    const request = saveInstanceSettingMock.mock.calls[0][0];
    expect(request.key).toBe(InstanceSetting_Key.MEMO_RELATED);
    expect(request.setting.value.value.allowedVisibilities).toEqual(["PRIVATE", "PROTECTED"]);
  });

  it("turns a legacy PRIVATE-only setting into the same binary public-access switch", async () => {
    mockInstance.memoRelatedSetting = create(InstanceSetting_MemoRelatedSettingSchema, { allowedVisibilities: ["PRIVATE"] });
    render(<InstanceSection />);

    const publicAccessSwitch = screen.getByRole("switch", { name: "setting.instance.public-access" });
    expect(publicAccessSwitch).not.toBeChecked();

    fireEvent.click(publicAccessSwitch);
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() => expect(saveInstanceSettingMock).toHaveBeenCalledTimes(1));
    expect(saveInstanceSettingMock.mock.calls[0][0].setting.value.value.allowedVisibilities).toEqual([]);
  });

  it("explains that Instance URL is still required before anonymous access opens", () => {
    mockInstance.profile = { demo: false, instanceUrl: "" };
    render(<InstanceSection />);

    expect(screen.getByText(/setting\.instance\.public-access-instance-url-required/)).toBeInTheDocument();
  });

  it("shows the effective startup URL and persists a normalized frontend override", async () => {
    render(<InstanceSection />);

    const input = screen.getByRole("textbox", { name: "setting.instance.instance-url" });
    expect(input).toHaveValue("https://memos.example.com");

    fireEvent.change(input, { target: { value: "  https://notes.example.com/memos/  " } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() => expect(saveInstanceSettingMock).toHaveBeenCalledTimes(1));
    const request = saveInstanceSettingMock.mock.calls[0][0];
    expect(request.key).toBe(InstanceSetting_Key.GENERAL);
    expect(request.setting.value.value.instanceUrl).toBe("https://notes.example.com/memos");
  });

  it("allows an explicit empty URL to disable the startup fallback", async () => {
    render(<InstanceSection />);

    fireEvent.change(screen.getByRole("textbox", { name: "setting.instance.instance-url" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() => expect(saveInstanceSettingMock).toHaveBeenCalledTimes(1));
    expect(saveInstanceSettingMock.mock.calls[0][0].setting.value.value.instanceUrl).toBe("");
  });

  it("rejects an invalid URL before sending a settings update", () => {
    render(<InstanceSection />);

    fireEvent.change(screen.getByRole("textbox", { name: "setting.instance.instance-url" }), {
      target: { value: "javascript:alert(1)" },
    });

    expect(screen.getByText("setting.instance.instance-url-invalid")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "common.save" })).toBeDisabled();
    expect(saveInstanceSettingMock).not.toHaveBeenCalled();
  });

  it("closes public access before changing the URL in a combined save", async () => {
    render(<InstanceSection />);

    fireEvent.change(screen.getByRole("textbox", { name: "setting.instance.instance-url" }), {
      target: { value: "https://private.example.com" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "setting.instance.public-access" }));
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() => expect(saveInstanceSettingMock).toHaveBeenCalledTimes(2));
    expect(saveInstanceSettingMock.mock.calls[0][0].key).toBe(InstanceSetting_Key.MEMO_RELATED);
    expect(saveInstanceSettingMock.mock.calls[1][0].key).toBe(InstanceSetting_Key.GENERAL);
  });
});
