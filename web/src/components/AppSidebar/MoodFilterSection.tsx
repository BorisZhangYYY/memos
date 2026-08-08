import { XIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useInstance } from "@/contexts/InstanceContext";
import { replaceFiltersByFactor, stringifyFilters, useMemoFilterContext } from "@/contexts/MemoFilterContext";
import { formatMoodLevelList, MOOD_LEVEL_KEYS, parseMoodLevelList } from "@/hooks/useMemoFilters";
import { getMoodPalette } from "@/lib/mood";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";
import { DEFAULT_MOOD_EMOJIS } from "../MemoEditor/Toolbar/MoodSelector";
import SidebarSectionHeader from "./SidebarSectionHeader";

interface Props {
  /** When set, mood clicks land on this route with the mood filter instead of filtering the current one. */
  navigationTarget?: string;
  onSelect?: () => void;
}

const MoodFilterSection = ({ navigationTarget, onSelect }: Props) => {
  const t = useTranslate();
  const navigate = useNavigate();
  const { filters, setFilters, getFiltersByFactor } = useMemoFilterContext();
  const { memoRelatedSetting } = useInstance();
  const emojis = memoRelatedSetting?.moodEmojis?.length === 7 ? memoRelatedSetting.moodEmojis : DEFAULT_MOOD_EMOJIS;
  const moodColors = getMoodPalette(memoRelatedSetting?.moodColors);

  // Multiple levels can be selected at once; the filter value is a comma-separated list.
  const activeFilter = getFiltersByFactor("moodLevel")[0];
  const activeLevels = activeFilter ? parseMoodLevelList(activeFilter.value) : undefined;

  const applyLevels = (levels: number[]) => {
    const nextFilters =
      levels.length > 0
        ? replaceFiltersByFactor(filters, "moodLevel", [{ factor: "moodLevel", value: formatMoodLevelList(levels) }])
        : replaceFiltersByFactor(filters, "moodLevel", []);
    if (navigationTarget) {
      setFilters(nextFilters);
      navigate({ pathname: navigationTarget, search: `?filter=${stringifyFilters(nextFilters)}` });
      onSelect?.();
      return;
    }
    setFilters(nextFilters);
    onSelect?.();
  };

  const handleToggle = (level: number) => {
    const current = new Set(activeLevels ?? []);
    if (current.has(level)) {
      current.delete(level);
    } else {
      current.add(level);
    }
    applyLevels([...current]);
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
              onClick={() => applyLevels([])}
            >
              <XIcon className="size-3.5" strokeWidth={1.8} />
            </Button>
          )
        }
      >
        {t("mood.filter")}
      </SidebarSectionHeader>
      <div className="flex items-center justify-between gap-1 px-2" role="group" aria-label={t("mood.filter")}>
        {emojis.map((emoji, i) => {
          const level = i + 1;
          const active = activeLevels?.includes(level) ?? false;
          return (
            <button
              type="button"
              key={`${emoji}-${level}`}
              aria-label={`${t(MOOD_LEVEL_KEYS[i])} (${level})`}
              aria-pressed={active || undefined}
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-md text-sm cursor-pointer transition-all hover:opacity-80",
                active && "text-foreground",
              )}
              style={{ border: `1px solid ${moodColors[i]}`, backgroundColor: active ? `${moodColors[i]}1f` : "transparent" }}
              onClick={() => handleToggle(level)}
            >
              {emoji}
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default MoodFilterSection;
