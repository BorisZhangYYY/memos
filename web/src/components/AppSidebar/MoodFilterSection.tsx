import { XIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useInstance } from "@/contexts/InstanceContext";
import { replaceFiltersByFactor, stringifyFilters, useMemoFilterContext } from "@/contexts/MemoFilterContext";
import { formatMoodLevelValue, MOOD_LEVEL_KEYS, parseMoodLevelRange } from "@/hooks/useMemoFilters";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";
import { DEFAULT_MOOD_EMOJIS } from "../MemoEditor/Toolbar/MoodSelector";
import SidebarSectionHeader from "./SidebarSectionHeader";

interface Props {
  /** When set, mood clicks land on this route with the mood filter instead of filtering the current one. */
  navigationTarget?: string;
  onSelect?: () => void;
}

// Quick range presets cover the mood spectrum in three buckets.
const MOOD_RANGE_PRESETS: Array<{ min: number; max: number }> = [
  { min: 1, max: 3 },
  { min: 4, max: 4 },
  { min: 5, max: 7 },
];

const getPresetLabel = (range: { min: number; max: number }, t: ReturnType<typeof useTranslate>): string => {
  const minLabel = t(MOOD_LEVEL_KEYS[range.min - 1]);
  const maxLabel = t(MOOD_LEVEL_KEYS[range.max - 1]);
  return range.min === range.max ? minLabel : `${minLabel} ~ ${maxLabel}`;
};

const MoodFilterSection = ({ navigationTarget, onSelect }: Props) => {
  const t = useTranslate();
  const navigate = useNavigate();
  const { filters, setFilters, getFiltersByFactor } = useMemoFilterContext();
  const { memoRelatedSetting } = useInstance();
  const emojis = memoRelatedSetting?.moodEmojis?.length === 7 ? memoRelatedSetting.moodEmojis : DEFAULT_MOOD_EMOJIS;

  const activeFilter = getFiltersByFactor("moodLevel")[0];
  const activeRange = activeFilter ? parseMoodLevelRange(activeFilter.value) : undefined;

  const handleSelect = (min: number, max: number) => {
    const value = formatMoodLevelValue(min, max);
    const nextFilters = replaceFiltersByFactor(filters, "moodLevel", [{ factor: "moodLevel", value }]);
    if (navigationTarget) {
      setFilters(nextFilters);
      navigate({ pathname: navigationTarget, search: `?filter=${stringifyFilters(nextFilters)}` });
      onSelect?.();
      return;
    }
    // Toggle off when the exact range is already active.
    if (activeFilter?.value === value) {
      setFilters(replaceFiltersByFactor(filters, "moodLevel", []));
    } else {
      setFilters(nextFilters);
    }
    onSelect?.();
  };

  return (
    <section>
      <SidebarSectionHeader
        action={
          activeFilter && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-5 rounded text-muted-foreground"
              aria-label="Remove filter"
              onClick={() => setFilters(replaceFiltersByFactor(filters, "moodLevel", []))}
            >
              <XIcon className="size-3.5" strokeWidth={1.8} />
            </Button>
          )
        }
      >
        {t("mood.filter")}
      </SidebarSectionHeader>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-1 px-2" role="group" aria-label={t("mood.filter")}>
          {emojis.map((emoji, i) => {
            const level = i + 1;
            const active = activeRange?.min === level && activeRange?.max === level;
            return (
              <button
                type="button"
                key={`${emoji}-${level}`}
                aria-label={`${t(MOOD_LEVEL_KEYS[i])} (${level})`}
                aria-pressed={active || undefined}
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-md text-sm cursor-pointer text-muted-foreground transition-all hover:bg-accent hover:text-foreground",
                  active && "bg-accent text-foreground",
                )}
                onClick={() => handleSelect(level, level)}
              >
                {emoji}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-1 px-2">
          {MOOD_RANGE_PRESETS.map((range) => {
            const value = formatMoodLevelValue(range.min, range.max);
            const active = activeFilter?.value === value;
            return (
              <button
                type="button"
                key={value}
                aria-pressed={active || undefined}
                className={cn(
                  "inline-flex h-5 items-center rounded-full border border-border/60 px-2 text-[11px] cursor-pointer text-muted-foreground transition-all hover:bg-accent hover:text-foreground",
                  active && "bg-accent text-foreground",
                )}
                onClick={() => handleSelect(range.min, range.max)}
              >
                {getPresetLabel(range, t)}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default MoodFilterSection;
