import { ChartLineIcon, ChevronDownIcon, ChevronUpIcon, ListTodoIcon, WalletCardsIcon } from "lucide-react";
import { Children, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";

const STORAGE_KEY = "personal-dashboard-widget";
const EXPANDED_STORAGE_KEY = `${STORAGE_KEY}-expanded`;

interface Props {
  children: ReactNode;
  labels: string[];
  className?: string;
}

const PersonalDashboardWidget = ({ children, labels, className }: Props) => {
  const t = useTranslate();
  const panels = Children.toArray(children);
  const icons = [ChartLineIcon, WalletCardsIcon, ListTodoIcon];
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
      </div>
      <div
        key={activeIndex}
        className={cn(
          "overflow-hidden animate-in fade-in transition-[height] duration-200 ease-out",
          expanded ? "h-[min(36rem,70dvh)]" : "h-64",
        )}
        role="tabpanel"
      >
        {panels[activeIndex]}
      </div>
    </section>
  );
};

export default PersonalDashboardWidget;
