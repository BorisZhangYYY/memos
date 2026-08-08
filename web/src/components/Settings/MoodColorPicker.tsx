import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";

/** Curated swatches that blend with the Memos OKLCH palette, warm to cool. */
const PRESET_COLORS = [
  "#ef4444",
  "#f43f5e",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#a8a29e",
  "#22c55e",
  "#10b981",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#78716c",
  "#52525b",
  "#27272a",
  "#fafafa",
];

interface Props {
  value: string;
  onChange: (color: string) => void;
  ariaLabel?: string;
}

/** A square swatch that opens a Memos-styled palette popover. */
const MoodColorPicker = ({ value, onChange, ariaLabel }: Props) => {
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  const [hexInput, setHexInput] = useState(value);

  // Keep the manual hex input in sync when a preset is picked.
  useEffect(() => {
    setHexInput(value);
  }, [value]);

  // Apply any valid hex as the user types, so custom colors take effect
  // immediately without a confirm step.
  const handleHexChange = (raw: string) => {
    setHexInput(raw);
    const normalized = raw.trim().replace(/^#?/, "#");
    if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
      onChange(normalized);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        nativeButton={false}
        render={
          <button
            type="button"
            aria-label={ariaLabel}
            className="size-6 shrink-0 cursor-pointer rounded-md border border-border/60 transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            style={{ backgroundColor: value }}
          />
        }
      />
      <PopoverContent align="start" sideOffset={6} className="w-52 p-2">
        <div className="grid grid-cols-6 gap-1.5">
          {PRESET_COLORS.map((color) => {
            const selected = color.toLowerCase() === value.toLowerCase();
            return (
              <button
                type="button"
                key={color}
                aria-label={color}
                aria-pressed={selected || undefined}
                className={cn(
                  "size-6 cursor-pointer rounded-md border border-border/40 transition-transform hover:scale-110",
                  selected && "ring-2 ring-ring ring-offset-1 ring-offset-background",
                )}
                style={{ backgroundColor: color }}
                onClick={() => {
                  onChange(color);
                  setOpen(false);
                }}
              />
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-1.5 border-t border-border/60 pt-2">
          <Input
            className="h-7 w-full font-mono text-xs"
            value={hexInput}
            placeholder="#rrggbb"
            aria-label={t("setting.memo.custom-color")}
            onChange={(e) => handleHexChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setOpen(false);
              }
            }}
          />
          <span className="size-5 shrink-0 rounded-sm border border-border/60" style={{ backgroundColor: value }} aria-hidden="true" />
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default MoodColorPicker;
