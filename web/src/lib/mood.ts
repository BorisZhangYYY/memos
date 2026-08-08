/** Default palette for the seven mood levels, worst to best. */
export const DEFAULT_MOOD_COLORS = ["#ef4444", "#f97316", "#f59e0b", "#a8a29e", "#22c55e", "#06b6d4", "#8b5cf6"];

/** Hex color for a mood level (1-7), or undefined when the level is invalid. */
export const getMoodColor = (level: number, customColors?: string[]): string | undefined => {
  if (level < 1 || level > 7) return undefined;
  const colors = customColors?.length === 7 ? customColors : DEFAULT_MOOD_COLORS;
  return colors[level - 1];
};
