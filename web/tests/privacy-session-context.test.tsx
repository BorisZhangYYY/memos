import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PrivacySessionProvider, usePrivacySession } from "@/contexts/PrivacySessionContext";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ currentUser: { name: "users/test" } }) }));
vi.mock("@/hooks/usePersonalFeatures", () => ({
  default: () => ({ remindersEnabled: true, privacyMode: 1, requirePasswordForPrivateContent: true }),
}));
vi.mock("@/hooks/useReminderQueries", () => ({
  useReminders: (_parent: string, options: { view: number }) => ({
    data: options.view === 3 ? [{ name: "reminders/1", memo: "memos/linked" }] : [],
  }),
}));

const Consumer = () => {
  const privacy = usePrivacySession();
  return (
    <div>
      <span data-testid="linked">{String(privacy.isReminderLinkedMemo("memos/linked"))}</span>
      <span data-testid="linked-unlocked">{String(privacy.isMemoUnlocked("memos/linked"))}</span>
      <span data-testid="other-unlocked">{String(privacy.isMemoUnlocked("memos/other"))}</span>
      <button type="button" onClick={privacy.unlockAll}>
        unlock all
      </button>
      <button type="button" onClick={() => privacy.lockMemo("memos/linked")}>
        lock linked memo
      </button>
      <button type="button" onClick={privacy.lockAll}>
        lock all
      </button>
    </div>
  );
};

describe("PrivacySessionProvider", () => {
  it("shares one unlock while allowing a memo to be re-locked on its own", () => {
    render(
      <PrivacySessionProvider>
        <Consumer />
      </PrivacySessionProvider>,
    );

    expect(screen.getByTestId("linked")).toHaveTextContent("true");
    expect(screen.getByTestId("linked-unlocked")).toHaveTextContent("false");

    fireEvent.click(screen.getByRole("button", { name: "unlock all" }));
    expect(screen.getByTestId("linked-unlocked")).toHaveTextContent("true");
    expect(screen.getByTestId("other-unlocked")).toHaveTextContent("true");

    fireEvent.click(screen.getByRole("button", { name: "lock linked memo" }));
    expect(screen.getByTestId("linked-unlocked")).toHaveTextContent("false");
    expect(screen.getByTestId("other-unlocked")).toHaveTextContent("true");

    fireEvent.click(screen.getByRole("button", { name: "lock all" }));
    expect(screen.getByTestId("other-unlocked")).toHaveTextContent("false");
  });
});
