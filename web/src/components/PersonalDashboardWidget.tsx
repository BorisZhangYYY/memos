import {
  ChartLineIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  EyeIcon,
  ListTodoIcon,
  LockIcon,
  type LucideIcon,
  WalletCardsIcon,
} from "lucide-react";
import { Children, type ReactNode, useEffect, useState } from "react";
import PrivacyUnlockDialog from "@/components/PrivacyUnlockDialog";
import { Button } from "@/components/ui/button";
import { usePrivacySession } from "@/contexts/PrivacySessionContext";
import usePersonalFeatures from "@/hooks/usePersonalFeatures";
import { cn } from "@/lib/utils";
import { UserSetting_GeneralSetting_PersonalFeaturePrivacy } from "@/types/proto/api/v1/user_service_pb";
import { useTranslate } from "@/utils/i18n";

const STORAGE_KEY = "personal-dashboard-widget";
const EXPANDED_STORAGE_KEY = `${STORAGE_KEY}-expanded`;

interface Props {
  children: ReactNode;
  labels: string[];
  icons?: LucideIcon[];
  className?: string;
}

const PersonalDashboardWidget = ({ children, labels, icons: customIcons, className }: Props) => {
  const t = useTranslate();
  const { privacyMode, requirePasswordForPrivateContent } = usePersonalFeatures();
  const privacySession = usePrivacySession();
  const panels = Children.toArray(children);
  const icons = customIcons ?? [ChartLineIcon, WalletCardsIcon, ListTodoIcon];
  const [activeIndex, setActiveIndex] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(STORAGE_KEY));
      return Number.isInteger(stored) && stored >= 0 && stored < panels.length ? stored : 0;
    } catch {
      return 0;
    }
  });
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(EXPANDED_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [revealed, setRevealed] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const privacyEnabled = privacyMode !== UserSetting_GeneralSetting_PersonalFeaturePrivacy.VISIBLE;
  const visible = requirePasswordForPrivateContent ? privacySession.unlocked : revealed;
  const hidden = privacyEnabled && !visible;

  useEffect(() => setRevealed(false), [privacyMode]);

  useEffect(() => {
    if (activeIndex < panels.length) return;
    setActiveIndex(0);
    try {
      localStorage.setItem(STORAGE_KEY, "0");
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
  }, [activeIndex, panels.length]);

  const selectPanel = (index: number) => {
    setActiveIndex(index);
    try {
      localStorage.setItem(STORAGE_KEY, String(index));
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
  };

  const toggleExpanded = () => {
    setExpanded((current) => {
      const next = !current;
      try {
        localStorage.setItem(EXPANDED_STORAGE_KEY, String(next));
      } catch {
        // Storage can be unavailable in privacy-restricted browser contexts.
      }
      return next;
    });
  };

  const requestReveal = () => {
    if (requirePasswordForPrivateContent) setUnlockOpen(true);
    else setRevealed(true);
  };

  const hideAgain = () => {
    if (requirePasswordForPrivateContent) privacySession.lockAll();
    else setRevealed(false);
  };

  return (
    <section
      className={cn("mx-auto w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card", className)}
      aria-label={labels.join(" / ")}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="inline-flex rounded-lg bg-muted/70 p-1" role="tablist">
            {panels.map((_, index) => {
              const Icon = icons[index];
              return (
                <button
                  key={labels[index] ?? index}
                  type="button"
                  role="tab"
                  aria-selected={activeIndex === index}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
                    activeIndex === index ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => selectPanel(index)}
                >
                  {Icon && <Icon className="size-4" />}
                  {labels[index]}
                </button>
              );
            })}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 gap-1.5 px-2 sm:px-3"
          aria-label={expanded ? t("common.collapse") : t("common.expand")}
          aria-expanded={expanded}
          title={expanded ? t("common.collapse") : t("common.expand")}
          onClick={toggleExpanded}
        >
          {expanded ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
          <span className="hidden sm:inline">{expanded ? t("common.collapse") : t("common.expand")}</span>
        </Button>
        {privacyEnabled && visible && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={hideAgain}
            aria-label={t("setting.personal-features.hide-again")}
            title={t("setting.personal-features.hide-again")}
          >
            <LockIcon className="size-4" />
          </Button>
        )}
      </div>
      <div className="relative">
        <div
          key={activeIndex}
          className={cn(
            "overflow-hidden animate-in fade-in transition-[height,filter] duration-200 ease-out",
            expanded ? "h-[min(36rem,70dvh)]" : "h-64",
            hidden && "pointer-events-none select-none blur-lg",
          )}
          role="tabpanel"
        >
          {panels[activeIndex]}
        </div>
        {hidden && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pt-4">
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer rounded-lg bg-card px-3 text-xs text-foreground shadow-sm hover:-translate-y-0.5 hover:border-ring/40 hover:bg-accent hover:text-accent-foreground hover:shadow-md active:translate-y-0 active:shadow-sm"
              onClick={requestReveal}
            >
              {requirePasswordForPrivateContent ? <LockIcon className="size-4" /> : <EyeIcon className="size-4" />}
              {t("setting.personal-features.reveal-personal-panels")}
            </Button>
          </div>
        )}
      </div>
      {unlockOpen && <PrivacyUnlockDialog open onOpenChange={setUnlockOpen} onUnlocked={privacySession.unlockAll} />}
    </section>
  );
};

export default PersonalDashboardWidget;
