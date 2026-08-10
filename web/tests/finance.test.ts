import { describe, expect, it } from "vitest";
import { financeRange, formatCNY, minorToYuanInput, parseYuanToMinor } from "@/lib/finance";

describe("finance amount helpers", () => {
  it("parses yuan exactly into integer fen", () => {
    expect(parseYuanToMinor("12.99")).toBe(1299n);
    expect(parseYuanToMinor("0.1")).toBe(10n);
    expect(parseYuanToMinor("-8.05")).toBe(-805n);
    expect(parseYuanToMinor("1.001")).toBeUndefined();
    expect(parseYuanToMinor("1e3")).toBeUndefined();
  });

  it("formats integer fen without floating-point conversion", () => {
    expect(formatCNY(1299n, "en-US")).toBe("¥12.99");
    expect(formatCNY(-805n, "en-US")).toBe("-¥8.05");
    expect(minorToYuanInput(9007199254740993n)).toBe("90071992547409.93");
  });
});

describe("finance dashboard ranges", () => {
  it("uses the selected local calendar day for today mode", () => {
    const range = financeRange("today", "2026-08-09");
    expect(range.start.getFullYear()).toBe(2026);
    expect(range.start.getMonth()).toBe(7);
    expect(range.start.getDate()).toBe(9);
    expect(range.end.getDate()).toBe(10);
  });

  it("includes seven local calendar days", () => {
    const range = financeRange(7, undefined, new Date(2026, 7, 9, 15, 30));
    expect((range.end.getTime() - range.start.getTime()) / (24 * 60 * 60 * 1000)).toBe(7);
  });
});
