import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PrivacyUnlockDialog from "@/components/PrivacyUnlockDialog";

const { verifyPassword } = vi.hoisted(() => ({ verifyPassword: vi.fn() }));

vi.mock("@/connect", () => ({ authServiceClient: { verifyPassword } }));
vi.mock("@/utils/i18n", () => ({ useTranslate: () => (key: string) => key }));

describe("PrivacyUnlockDialog", () => {
  beforeEach(() => {
    verifyPassword.mockReset();
  });

  it("verifies the current password before revealing content", async () => {
    verifyPassword.mockResolvedValue({});
    const onOpenChange = vi.fn();
    const onUnlocked = vi.fn();
    render(<PrivacyUnlockDialog open onOpenChange={onOpenChange} onUnlocked={onUnlocked} />);

    const password = screen.getByLabelText("common.password");
    fireEvent.change(password, { target: { value: "account password" } });
    fireEvent.click(screen.getByRole("button", { name: "setting.personal-features.unlock" }));

    await waitFor(() => expect(verifyPassword).toHaveBeenCalledWith({ password: "account password" }));
    expect(onUnlocked).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the content locked after an incorrect password", async () => {
    verifyPassword.mockRejectedValue(new Error("incorrect password"));
    const onUnlocked = vi.fn();
    render(<PrivacyUnlockDialog open onOpenChange={vi.fn()} onUnlocked={onUnlocked} />);

    fireEvent.change(screen.getByLabelText("common.password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "setting.personal-features.unlock" }));

    expect(await screen.findByText("setting.personal-features.incorrect-password")).toBeInTheDocument();
    expect(onUnlocked).not.toHaveBeenCalled();
    expect(screen.getByLabelText("common.password")).toHaveValue("");
  });
});
