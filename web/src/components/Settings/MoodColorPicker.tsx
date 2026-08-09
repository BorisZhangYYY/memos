import { useEffect, useId, useState } from "react";
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

const HUE_STOPS = [
  { offset: "0%", color: "#ff0000" },
  { offset: "16.67%", color: "#ffff00" },
  { offset: "33.33%", color: "#00ff00" },
  { offset: "50%", color: "#00ffff" },
  { offset: "66.67%", color: "#0000ff" },
  { offset: "83.33%", color: "#ff00ff" },
  { offset: "100%", color: "#ff0000" },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** HSV → hex (#rrggbb). h in degrees, s/v in 0-1. */
const hsvToHex = (h: number, s: number, v: number): string => {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

/** hex (#rrggbb or #rgb) → HSV. */
const hexToHsv = (hex: string): { h: number; s: number; v: number } => {
  const normalized = hex.replace(/^#?/, "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
};

const PANEL_WIDTH = 200;
const PANEL_HEIGHT = 120;
const HUE_STRIP_HEIGHT = 14;

interface Props {
  value: string;
  onChange: (color: string) => void;
  ariaLabel?: string;
}

/** A square swatch that opens a Memos-styled palette popover with a free HSV picker. */
const MoodColorPicker = ({ value, onChange, ariaLabel }: Props) => {
  const t = useTranslate();
  const gradientId = useId();
  const [open, setOpen] = useState(false);
  const [hexInput, setHexInput] = useState(value);
  const [hsv, setHsv] = useState(() => hexToHsv(value));

  // Keep the manual hex input and the HSV sliders in sync with the applied color.
  useEffect(() => {
    setHexInput(value);
    setHsv(hexToHsv(value));
  }, [value]);

  const hueColor = hsvToHex(hsv.h, 1, 1);

  const pickSVPanel = (clientX: number, clientY: number, rect: DOMRect) => {
    const s = clamp((clientX - rect.left) / rect.width, 0, 1);
    const v = 1 - clamp((clientY - rect.top) / rect.height, 0, 1);
    onChange(hsvToHex(hsv.h, s, v));
  };

  const pickHue = (clientX: number, rect: DOMRect) => {
    const h = clamp((clientX - rect.left) / rect.width, 0, 1) * 360;
    onChange(hsvToHex(h, hsv.s, hsv.v));
  };

  const handleSVPointerDown = (e: React.PointerEvent<SVGRectElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pickSVPanel(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
  };

  const handleSVPointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      pickSVPanel(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
    }
  };

  const handleHuePointerDown = (e: React.PointerEvent<SVGRectElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pickHue(e.clientX, e.currentTarget.getBoundingClientRect());
  };

  const handleHuePointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      pickHue(e.clientX, e.currentTarget.getBoundingClientRect());
    }
  };

  const handleHexSubmit = () => {
    const normalized = hexInput.trim().replace(/^#?/, "#");
    if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
      onChange(normalized);
    }
    setOpen(false);
  };

  const sx = hsv.s * PANEL_WIDTH;
  const sy = (1 - hsv.v) * PANEL_HEIGHT;
  const hueX = (hsv.h / 360) * PANEL_WIDTH;

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
      <PopoverContent align="start" sideOffset={6} className="w-64 p-2.5">
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

        {/* Free HSV picker: saturation × value panel over a hue strip. */}
        <svg
          viewBox={`0 0 ${PANEL_WIDTH} ${PANEL_HEIGHT}`}
          className="mt-2 w-full rounded-md border border-border/60"
          aria-label={t("setting.memo.color-panel")}
        >
          <defs>
            <linearGradient id={`${gradientId}-x`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor={hueColor} />
            </linearGradient>
            <linearGradient id={`${gradientId}-y`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="#000000" />
            </linearGradient>
          </defs>
          <rect width={PANEL_WIDTH} height={PANEL_HEIGHT} fill={`url(#${gradientId}-x)`} />
          <rect width={PANEL_WIDTH} height={PANEL_HEIGHT} fill={`url(#${gradientId}-y)`} />
          <rect
            width={PANEL_WIDTH}
            height={PANEL_HEIGHT}
            fill="transparent"
            className="cursor-crosshair"
            onPointerDown={handleSVPointerDown}
            onPointerMove={handleSVPointerMove}
          />
          <circle
            cx={sx}
            cy={sy}
            r={5}
            fill="none"
            stroke="rgba(0,0,0,0.4)"
            strokeWidth={3}
            className="pointer-events-none"
            opacity={0.35}
          />
          <circle cx={sx} cy={sy} r={5} fill="none" stroke="#ffffff" strokeWidth={1.5} className="pointer-events-none" />
        </svg>

        <svg
          viewBox={`0 0 ${PANEL_WIDTH} ${HUE_STRIP_HEIGHT}`}
          className="mt-1.5 w-full rounded-sm"
          aria-label={t("setting.memo.color-hue")}
        >
          <defs>
            <linearGradient id={`${gradientId}-hue`} x1="0" y1="0" x2="1" y2="0">
              {HUE_STOPS.map((stop) => (
                <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
              ))}
            </linearGradient>
          </defs>
          <rect width={PANEL_WIDTH} height={HUE_STRIP_HEIGHT} rx="3" fill={`url(#${gradientId}-hue)`} />
          <rect
            width={PANEL_WIDTH}
            height={HUE_STRIP_HEIGHT}
            fill="transparent"
            className="cursor-pointer"
            onPointerDown={handleHuePointerDown}
            onPointerMove={handleHuePointerMove}
          />
          <line x1={hueX} y1={1} x2={hueX} y2={HUE_STRIP_HEIGHT - 1} stroke="#ffffff" strokeWidth={2} className="pointer-events-none" />
        </svg>

        <div className="mt-2 flex items-center gap-1.5 border-t border-border/60 pt-2">
          <Input
            className="h-7 w-full font-mono text-xs"
            value={hexInput}
            placeholder="#rrggbb"
            aria-label={t("setting.memo.custom-color")}
            onChange={(e) => setHexInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleHexSubmit();
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
