import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import usePersonalFeatures from "@/hooks/usePersonalFeatures";
import { useReminders } from "@/hooks/useReminderQueries";
import { ListRemindersRequest_View } from "@/types/proto/api/v1/reminder_service_pb";
import { UserSetting_GeneralSetting_PersonalFeaturePrivacy } from "@/types/proto/api/v1/user_service_pb";

interface PrivacySessionContextValue {
  unlocked: boolean;
  unlockAll: () => void;
  unlockMemo: (memoName: string) => void;
  lockAll: () => void;
  lockMemo: (memoName: string) => void;
  isMemoUnlocked: (memoName: string) => boolean;
  isReminderLinkedMemo: (memoName: string) => boolean;
}

const fallbackValue: PrivacySessionContextValue = {
  unlocked: false,
  unlockAll: () => undefined,
  unlockMemo: () => undefined,
  lockAll: () => undefined,
  lockMemo: () => undefined,
  isMemoUnlocked: () => false,
  isReminderLinkedMemo: () => false,
};

const PrivacySessionContext = createContext<PrivacySessionContextValue>(fallbackValue);

export const PrivacySessionProvider = ({ children }: { children: ReactNode }) => {
  const { currentUser } = useAuth();
  const { remindersEnabled, privacyMode, requirePasswordForPrivateContent } = usePersonalFeatures();
  const privacyEnabled = privacyMode !== UserSetting_GeneralSetting_PersonalFeaturePrivacy.VISIBLE;
  const resolveReminderLinks = Boolean(currentUser && remindersEnabled && privacyEnabled);
  const { data: pendingReminders = [] } = useReminders(currentUser?.name, {
    view: ListRemindersRequest_View.ALL,
    enabled: resolveReminderLinks,
  });
  const { data: completedReminders = [] } = useReminders(currentUser?.name, {
    view: ListRemindersRequest_View.COMPLETED,
    enabled: resolveReminderLinks,
  });
  const reminderMemoNames = useMemo(
    () => new Set([...pendingReminders, ...completedReminders].flatMap((reminder) => (reminder.memo ? [reminder.memo] : []))),
    [completedReminders, pendingReminders],
  );
  const [unlocked, setUnlocked] = useState(false);
  const [manuallyLockedMemos, setManuallyLockedMemos] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setUnlocked(false);
    setManuallyLockedMemos(new Set());
  }, [currentUser?.name, privacyMode, requirePasswordForPrivateContent]);

  const unlockAll = useCallback(() => setUnlocked(true), []);
  const unlockMemo = useCallback((memoName: string) => {
    setUnlocked(true);
    setManuallyLockedMemos((current) => {
      if (!current.has(memoName)) return current;
      const next = new Set(current);
      next.delete(memoName);
      return next;
    });
  }, []);
  const lockAll = useCallback(() => {
    setUnlocked(false);
    setManuallyLockedMemos(new Set());
  }, []);
  const lockMemo = useCallback((memoName: string) => {
    setManuallyLockedMemos((current) => new Set(current).add(memoName));
  }, []);
  const isMemoUnlocked = useCallback((memoName: string) => unlocked && !manuallyLockedMemos.has(memoName), [manuallyLockedMemos, unlocked]);
  const isReminderLinkedMemo = useCallback((memoName: string) => reminderMemoNames.has(memoName), [reminderMemoNames]);

  const value = useMemo(
    () => ({ unlocked, unlockAll, unlockMemo, lockAll, lockMemo, isMemoUnlocked, isReminderLinkedMemo }),
    [isMemoUnlocked, isReminderLinkedMemo, lockAll, lockMemo, unlockAll, unlockMemo, unlocked],
  );

  return <PrivacySessionContext.Provider value={value}>{children}</PrivacySessionContext.Provider>;
};

export const usePrivacySession = () => useContext(PrivacySessionContext);
