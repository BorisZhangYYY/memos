import { LockKeyholeIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { authServiceClient } from "@/connect";
import { useTranslate } from "@/utils/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlocked: () => void;
}

const PrivacyUnlockDialog = ({ open, onOpenChange, onUnlocked }: Props) => {
  const t = useTranslate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setError("");
      return;
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const unlock = async () => {
    if (!password || verifying) return;
    setVerifying(true);
    setError("");
    try {
      await authServiceClient.verifyPassword({ password });
      onUnlocked();
      onOpenChange(false);
    } catch {
      setError(t("setting.personal-features.incorrect-password"));
      setPassword("");
      requestAnimationFrame(() => inputRef.current?.focus());
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" className="gap-3 rounded-xl p-4 md:max-w-[20rem]" showCloseButton={false}>
        <DialogHeader className="gap-1 text-left">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <span className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <LockKeyholeIcon className="size-3.5" />
            </span>
            {t("setting.personal-features.unlock-title")}
          </DialogTitle>
          <DialogDescription className="pl-9 text-xs leading-4">{t("setting.personal-features.unlock-description")}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            id="privacy-unlock-password"
            aria-label={t("common.password")}
            type="password"
            autoComplete="current-password"
            className="h-8 min-w-0 flex-1 text-sm"
            placeholder={t("common.password")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void unlock()}
            aria-invalid={!!error}
          />
          <Button size="sm" className="h-8 shrink-0" onClick={() => void unlock()} disabled={!password || verifying}>
            {verifying ? t("setting.personal-features.verifying") : t("setting.personal-features.unlock")}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button
          type="button"
          className="self-center text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onOpenChange(false)}
        >
          {t("common.cancel")}
        </button>
      </DialogContent>
    </Dialog>
  );
};

export default PrivacyUnlockDialog;
