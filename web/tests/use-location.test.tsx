import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLocation } from "@/components/MemoEditor/hooks/useLocation";

describe("useLocation", () => {
  it("builds a position when coordinates are entered manually from an empty state", () => {
    const { result } = renderHook(() => useLocation());

    act(() => result.current.updateCoordinate("lat", "31.2304"));
    expect(result.current.state.position).toBeUndefined();

    act(() => result.current.updateCoordinate("lng", "121.4737"));
    expect(result.current.state.position).toEqual({ lat: 31.2304, lng: 121.4737 });
  });

  it("allows coordinates to be saved while reverse geocoding is unavailable", () => {
    const { result } = renderHook(() => useLocation());

    act(() => {
      result.current.handlePositionChange({ lat: 31.2304, lng: 121.4737 });
    });

    expect(result.current.getLocation()).toMatchObject({
      latitude: 31.2304,
      longitude: 121.4737,
      placeholder: "31.230400, 121.473700",
    });
  });
});
