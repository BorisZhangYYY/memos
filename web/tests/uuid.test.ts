import { afterEach, describe, expect, it, vi } from "vitest";
import { generateUUID } from "@/utils/uuid";

describe("generateUUID", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses crypto.randomUUID when it is available", () => {
    const randomUUID = vi.fn(() => "123e4567-e89b-42d3-a456-426614174000" as `${string}-${string}-${string}-${string}-${string}`);
    vi.stubGlobal("crypto", { randomUUID, getRandomValues: vi.fn() });

    expect(generateUUID()).toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("builds an RFC 4122 UUID v4 with getRandomValues when randomUUID is unavailable", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.set([0, 1, 2, 3, 4, 5, 0xff, 7, 0xff, 9, 10, 11, 12, 13, 14, 15]);
      return bytes;
    });
    vi.stubGlobal("crypto", { getRandomValues });

    expect(generateUUID()).toBe("00010203-0405-4f07-bf09-0a0b0c0d0e0f");
    expect(getRandomValues).toHaveBeenCalledOnce();
  });
});
