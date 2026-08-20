import { Code, ConnectError } from "@connectrpc/connect";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useMemoDetailError from "@/hooks/useMemoDetailError";

const toastError = vi.hoisted(() => vi.fn());

vi.mock("react-hot-toast", () => ({ toast: { error: toastError } }));
vi.mock("@/utils/i18n", () => ({ useTranslate: () => (key: string) => key }));

describe("useMemoDetailError", () => {
  beforeEach(() => {
    toastError.mockClear();
  });

  it.each([Code.Unauthenticated, Code.PermissionDenied, Code.NotFound])("shows a localized not-found message for code %s", (code) => {
    renderHook(() => useMemoDetailError({ error: new ConnectError("hidden", code) }));

    expect(toastError).toHaveBeenCalledWith("message.memo-not-found");
  });

  it("keeps the server message for other errors", () => {
    const error = new ConnectError("try again", Code.Unavailable);
    renderHook(() => useMemoDetailError({ error }));

    expect(toastError).toHaveBeenCalledWith(error.message);
  });
});
