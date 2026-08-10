import dayjs from "dayjs";

type FinanceWindow = "today" | 7 | 30;

const MINOR_UNITS = 100n;

/** Parses an exact yuan value such as "12.99" into integer fen. */
export const parseYuanToMinor = (value: string): bigint | undefined => {
  const normalized = value.trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return undefined;
  const sign = match[1] === "-" ? -1n : 1n;
  const whole = BigInt(match[2]);
  const fraction = BigInt((match[3] ?? "").padEnd(2, "0") || "0");
  return sign * (whole * MINOR_UNITS + fraction);
};

/** Formats integer fen as a Chinese-yuan amount without floating-point conversion. */
export const formatCNY = (minor: bigint, locale = "zh-CN"): string => {
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const whole = absolute / MINOR_UNITS;
  const fraction = String(absolute % MINOR_UNITS).padStart(2, "0");
  const groupedWhole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(whole);
  return `${negative ? "-" : ""}¥${groupedWhole}.${fraction}`;
};

/** Formats integer fen as an exact decimal yuan value suitable for an input. */
export const minorToYuanInput = (minor: bigint): string => {
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  return `${negative ? "-" : ""}${absolute / MINOR_UNITS}.${String(absolute % MINOR_UNITS).padStart(2, "0")}`;
};

export const financeRange = (window_: FinanceWindow, selectedDate?: string, now = new Date()) => {
  if (window_ === "today") {
    const anchor = selectedDate ? dayjs(`${selectedDate}T00:00:00`) : dayjs(now);
    return { start: anchor.startOf("day").toDate(), end: anchor.add(1, "day").startOf("day").toDate() };
  }
  return {
    start: dayjs(now)
      .startOf("day")
      .subtract(window_ - 1, "day")
      .toDate(),
    end: dayjs(now).add(1, "day").startOf("day").toDate(),
  };
};

export const localDateTimeInputValue = (date = new Date()) => dayjs(date).format("YYYY-MM-DDTHH:mm");
