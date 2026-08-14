import L, { LatLng } from "leaflet";
import "leaflet/dist/leaflet.css";
import { ExternalLinkIcon, LocateFixedIcon, MinusIcon, PlusIcon } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MapContainer, Marker, useMap, useMapEvents } from "react-leaflet";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";
import { defaultMarkerIcon, ThemedTileLayer } from "./map-utils";
import type { MapPoint } from "./types";

const toLatLng = (point: MapPoint): LatLng => new LatLng(point.lat, point.lng);
const fromLatLng = (latlng: LatLng): MapPoint => ({ lat: latlng.lat, lng: latlng.lng });

interface LocationMarkerProps {
  position: LatLng | undefined;
  onChange: (position: MapPoint) => void;
  readonly?: boolean;
  onLocationStatusChange: (status: LocationStatus) => void;
}

type LocationStatus = "idle" | "locating" | "selected" | "error";

const LocationMarker = ({ position: initialPosition, onChange, readonly: readOnly, onLocationStatusChange }: LocationMarkerProps) => {
  const [position, setPosition] = useState(initialPosition);
  const lastExternalPositionRef = useRef<string | undefined>(undefined);

  const map = useMapEvents({
    click(e) {
      if (readOnly) {
        return;
      }

      setPosition(e.latlng);
      onChange(fromLatLng(e.latlng));
      onLocationStatusChange("selected");
    },
    locationfound(e) {
      if (readOnly) return;
      setPosition(e.latlng);
      map.setView(e.latlng, 15);
      onChange(fromLatLng(e.latlng));
      onLocationStatusChange("selected");
    },
    locationerror() {
      onLocationStatusChange("error");
    },
  });

  useEffect(() => {
    if (initialPosition) {
      setPosition(initialPosition);
      const positionKey = `${initialPosition.lat},${initialPosition.lng}`;
      if (lastExternalPositionRef.current !== positionKey) {
        map.setView(initialPosition, 13);
        lastExternalPositionRef.current = positionKey;
      }
    } else {
      setPosition(undefined);
      lastExternalPositionRef.current = undefined;
    }
  }, [initialPosition, map]);

  return position === undefined ? null : <Marker position={position} icon={defaultMarkerIcon}></Marker>;
};

// Reusable glass-style button component
interface GlassButtonProps {
  icon: ReactNode;
  onClick: () => void;
  ariaLabel: string;
  title: string;
}

const GlassButton = ({ icon, onClick, ariaLabel, title }: GlassButtonProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      className={cn(
        "inline-flex items-center justify-center h-8 w-8 rounded-lg",
        "border border-border/80 bg-background/88 text-foreground shadow-sm backdrop-blur-md",
        "hover:scale-105 hover:bg-background hover:shadow-md active:scale-95",
      )}
    >
      {icon}
    </button>
  );
};

// Container for all map control buttons
interface ControlButtonsProps {
  position: MapPoint | undefined;
  readOnly: boolean;
  labels: {
    currentLocation: string;
    openMap: string;
    zoomIn: string;
    zoomOut: string;
  };
  onLocate: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onOpenGoogleMaps: () => void;
}

const ControlButtons = ({ position, readOnly, labels, onLocate, onZoomIn, onZoomOut, onOpenGoogleMaps }: ControlButtonsProps) => {
  return (
    <div className="flex flex-col gap-1.5">
      {!readOnly && (
        <GlassButton
          icon={<LocateFixedIcon size={16} className="text-foreground" />}
          onClick={onLocate}
          ariaLabel={labels.currentLocation}
          title={labels.currentLocation}
        />
      )}
      {position && (
        <GlassButton
          icon={<ExternalLinkIcon size={16} className="text-foreground" />}
          onClick={onOpenGoogleMaps}
          ariaLabel={labels.openMap}
          title={labels.openMap}
        />
      )}
      <GlassButton
        icon={<PlusIcon size={16} className="text-foreground" />}
        onClick={onZoomIn}
        ariaLabel={labels.zoomIn}
        title={labels.zoomIn}
      />
      <GlassButton
        icon={<MinusIcon size={16} className="text-foreground" />}
        onClick={onZoomOut}
        ariaLabel={labels.zoomOut}
        title={labels.zoomOut}
      />
    </div>
  );
};

// Custom Leaflet Control class
class MapControlsContainer extends L.Control {
  private container: HTMLDivElement | undefined = undefined;

  onAdd() {
    this.container = L.DomUtil.create("div", "");
    this.container.style.pointerEvents = "auto";

    // Prevent map interactions when clicking controls
    L.DomEvent.disableClickPropagation(this.container);
    L.DomEvent.disableScrollPropagation(this.container);

    return this.container;
  }

  onRemove() {
    this.container = undefined;
  }

  getContainer() {
    return this.container;
  }
}

interface MapControlsProps {
  position: MapPoint | undefined;
  readOnly: boolean;
  onLocateStart: () => void;
  labels: ControlButtonsProps["labels"];
}

const MapControls = ({ position, readOnly, onLocateStart, labels }: MapControlsProps) => {
  const map = useMap();
  const controlRef = useRef<MapControlsContainer | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  const handleOpenInMap = () => {
    if (!position) return;
    const url = `https://www.openstreetmap.org/?mlat=${position.lat}&mlon=${position.lng}#map=16/${position.lat}/${position.lng}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleLocate = () => {
    onLocateStart();
    map.locate({ enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 });
  };

  const handleZoomIn = () => {
    map.zoomIn();
  };

  const handleZoomOut = () => {
    map.zoomOut();
  };

  useEffect(() => {
    // Create custom Leaflet control
    const control = new MapControlsContainer({ position: "topright" });
    controlRef.current = control;
    control.addTo(map);
    setContainer(control.getContainer() ?? null);

    return () => {
      if (controlRef.current) {
        controlRef.current.remove();
        controlRef.current = null;
      }
      setContainer(null);
    };
  }, [map]);

  if (!container) {
    return null;
  }

  return createPortal(
    <ControlButtons
      position={position}
      readOnly={readOnly}
      labels={labels}
      onLocate={handleLocate}
      onZoomIn={handleZoomIn}
      onZoomOut={handleZoomOut}
      onOpenGoogleMaps={handleOpenInMap}
    />,
    container,
  );
};

const MapCleanup = () => {
  const map = useMap();

  useEffect(() => {
    return () => {
      // Cleanup map instance when component unmounts
      setTimeout(() => {
        if (map) {
          try {
            map.remove();
          } catch {
            // Ignore errors during cleanup
          }
        }
      }, 0);
    };
  }, [map]);

  return null;
};

interface LocationPickerProps {
  readonly?: boolean;
  latlng?: MapPoint;
  onChange?: (position: MapPoint) => void;
  className?: string;
}

const DEFAULT_CENTER: MapPoint = { lat: 20, lng: 0 };
const noopOnLocationChange = () => {};

const LocationPicker = ({ readonly: readOnly = false, latlng, onChange = noopOnLocationChange, className }: LocationPickerProps) => {
  const t = useTranslate();
  const [locationStatus, setLocationStatus] = useState<LocationStatus>(latlng ? "selected" : "idle");
  const mapCenter = useMemo(() => toLatLng(latlng ?? DEFAULT_CENTER), [latlng?.lat, latlng?.lng]);
  const markerPosition = latlng ? mapCenter : undefined;
  const statusLabel = readOnly
    ? t("editor.location-picker.pinned")
    : locationStatus === "locating"
      ? t("editor.location-picker.locating")
      : locationStatus === "error"
        ? t("editor.location-picker.location-error")
        : latlng || locationStatus === "selected"
          ? t("editor.location-picker.selected")
          : t("editor.location-picker.choose");
  const labels = {
    currentLocation: t("editor.location-picker.current-location"),
    openMap: t("editor.location-picker.open-map"),
    zoomIn: t("editor.location-picker.zoom-in"),
    zoomOut: t("editor.location-picker.zoom-out"),
  };

  return (
    <div
      className={cn(
        "memo-location-map relative isolate h-72 w-full overflow-hidden rounded-xl border border-border bg-background shadow-sm",
        "[&_.leaflet-control-attribution]:!bg-background/90 [&_.leaflet-control-attribution]:!text-[10px] [&_.leaflet-control-attribution]:!text-muted-foreground",
        "[&_.leaflet-control-attribution_a]:!text-primary",
        className,
      )}
    >
      <MapContainer
        className="h-full w-full !bg-muted"
        center={mapCenter}
        zoom={latlng ? 13 : 2}
        scrollWheelZoom={false}
        zoomControl={false}
        attributionControl
      >
        <ThemedTileLayer />
        <LocationMarker position={markerPosition} readonly={readOnly} onChange={onChange} onLocationStatusChange={setLocationStatus} />
        <MapControls position={latlng} readOnly={readOnly} labels={labels} onLocateStart={() => setLocationStatus("locating")} />
        <MapCleanup />
      </MapContainer>

      <div className="pointer-events-none absolute left-3 top-3 z-[450] flex items-center gap-2" role="status" aria-live="polite">
        <div
          className={cn(
            "rounded-full border bg-background/92 px-2.5 py-1 text-[11px] font-medium tracking-[0.02em] shadow-sm backdrop-blur-sm",
            locationStatus === "error" ? "border-destructive/40 text-destructive" : "border-border text-foreground/80",
          )}
        >
          {statusLabel}
        </div>
      </div>
    </div>
  );
};

export default LocationPicker;
