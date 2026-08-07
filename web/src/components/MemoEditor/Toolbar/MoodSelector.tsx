import { HeartIcon } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useInstance } from "@/contexts/InstanceContext";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";

export const DEFAULT_MOOD_EMOJIS = ["😫", "😟", "😔", "😐", "😌", "☺️", "😆"];

interface Props {
  moodLevel: number;
  onChange: (moodLevel: number) => void;
  className?: string;
}

const MoodSelector = ({ moodLevel, onChange, className }: Props) => {
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  const { memoRelatedSetting } = useInstance();
  const emojis = memoRelatedSetting?.moodEmojis?.length === 7 ? memoRelatedSetting.moodEmojis : DEFAULT_MOOD_EMOJIS;

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
  };

  const handleSelect = (level: number) => {
    onChange(moodLevel === level ? 0 : level); // toggle off if same level
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        nativeButton={false}
        render={
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full border cursor-pointer transition-all hover:opacity-80",
              moodLevel > 0 && "bg-secondary text-secondary-foreground",
              className,
            )}
          />
        }
        aria-label={t("mood.select")}
      >
        {moodLevel > 0 ? <span className="text-sm">{emojis[moodLevel - 1]}</span> : <HeartIcon className="size-4 text-muted-foreground" />}
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-auto p-1">
        <div className="flex gap-1">
          {emojis.map((emoji, i) => (
            <button
              type="button"
              key={`${emoji}-${i}`}
              className={cn(
                "inline-flex w-8 h-8 items-center justify-center rounded-md text-base cursor-pointer text-muted-foreground transition-all hover:bg-accent hover:text-foreground",
                moodLevel === i + 1 && "bg-secondary text-secondary-foreground",
              )}
              onClick={() => handleSelect(i + 1)}
              aria-label={`${t("mood.level")} ${i + 1}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default MoodSelector;
