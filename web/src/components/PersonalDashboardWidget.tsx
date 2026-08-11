import { ChartLineIcon, ListTodoIcon, WalletCardsIcon } from "lucide-react";
import { Children, type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "personal-dashboard-widget";

interface Props {
  children: ReactNode;
  labels: string[];
  className?: string;
}

const PersonalDashboardWidget = ({ children, labels, className }: Props) => {
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

  const selectPanel = (index: number) => {
    setActiveIndex(index);
    try {
      localStorage.setItem(STORAGE_KEY, String(index));
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
  };

  return (
    <section
      className={cn("mx-auto w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card", className)}
      aria-label={labels.join(" / ")}
    >
      <div className="flex items-center border-b border-border px-3 py-2">
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
      <div key={activeIndex} className="h-64 overflow-hidden animate-in fade-in duration-150" role="tabpanel">
        {panels[activeIndex]}
      </div>
    </section>
  );
};

export default PersonalDashboardWidget;
