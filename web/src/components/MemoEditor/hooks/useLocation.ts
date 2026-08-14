import { create } from "@bufbuild/protobuf";
import { useCallback, useMemo, useRef, useState } from "react";
import type { MapPoint } from "@/components/map/types";
import { Location, LocationSchema } from "@/types/proto/api/v1/memo_service_pb";
import { LocationState } from "../types/insertMenu";

export const useLocation = (initialLocation?: Location) => {
  const [locationInitialized, setLocationInitialized] = useState(false);
  const locationInitializedRef = useRef(locationInitialized);
  locationInitializedRef.current = locationInitialized;

  const [state, setState] = useState<LocationState>({
    placeholder: initialLocation?.placeholder || "",
    position: initialLocation ? { lat: initialLocation.latitude, lng: initialLocation.longitude } : undefined,
    latInput: initialLocation ? String(initialLocation.latitude) : "",
    lngInput: initialLocation ? String(initialLocation.longitude) : "",
  });

  // Ref to latest state so getLocation can be stable without closing over state.
  const stateRef = useRef(state);
  stateRef.current = state;

  const updatePosition = useCallback((position?: MapPoint) => {
    setState((prev) => ({
      ...prev,
      position,
      latInput: position ? String(position.lat) : "",
      lngInput: position ? String(position.lng) : "",
    }));
  }, []);

  // Stable — reads locationInitialized via ref to avoid recreating on every change.
  const handlePositionChange = useCallback(
    (position: MapPoint) => {
      if (!locationInitializedRef.current) setLocationInitialized(true);
      updatePosition(position);
    },
    [updatePosition],
  );

  // Stable — merges coordinate update into a single functional setState, avoiding closure over state.position.
  const updateCoordinate = useCallback((type: "lat" | "lng", value: string) => {
    const num = parseFloat(value);
    const isValid = type === "lat" ? !isNaN(num) && num >= -90 && num <= 90 : !isNaN(num) && num >= -180 && num <= 180;
    setState((prev) => {
      const next = { ...prev, [type === "lat" ? "latInput" : "lngInput"]: value };
      const nextLat = type === "lat" ? num : Number.parseFloat(prev.latInput);
      const nextLng = type === "lng" ? num : Number.parseFloat(prev.lngInput);
      const hasValidPair =
        isValid &&
        Number.isFinite(nextLat) &&
        nextLat >= -90 &&
        nextLat <= 90 &&
        Number.isFinite(nextLng) &&
        nextLng >= -180 &&
        nextLng <= 180;
      if (hasValidPair) {
        const newPos = { lat: nextLat, lng: nextLng };
        if (!locationInitializedRef.current) setLocationInitialized(true);
        return { ...next, position: newPos, latInput: String(newPos.lat), lngInput: String(newPos.lng) };
      }
      return next;
    });
  }, []);

  // Stable reference — uses functional setState, no closure deps.
  const setPlaceholder = useCallback((placeholder: string) => {
    setState((prev) => ({ ...prev, placeholder }));
  }, []);

  const reset = useCallback(() => {
    setState({
      placeholder: "",
      position: undefined,
      latInput: "",
      lngInput: "",
    });
    setLocationInitialized(false);
  }, []);

  // Stable — reads latest state via ref, no closure over state.
  const getLocation = useCallback((): Location | undefined => {
    const { position, placeholder } = stateRef.current;
    if (!position) {
      return undefined;
    }
    return create(LocationSchema, {
      latitude: position.lat,
      longitude: position.lng,
      placeholder: placeholder.trim() || `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`,
    });
  }, []);

  return useMemo(
    () => ({ state, locationInitialized, handlePositionChange, updateCoordinate, setPlaceholder, reset, getLocation }),
    [state, locationInitialized, handlePositionChange, updateCoordinate, setPlaceholder, reset, getLocation],
  );
};
