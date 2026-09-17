import { DivIcon } from "leaflet";
import { useMemo } from "react";
import ReactDOMServer from "react-dom/server";
import { AttributionControl, TileLayer } from "react-leaflet";
import { useAuth } from "@/contexts/AuthContext";
import { resolveTheme } from "@/utils/theme";

const TILE_URLS = {
  light: import.meta.env.VITE_MAP_TILE_URL_LIGHT || "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  dark: import.meta.env.VITE_MAP_TILE_URL_DARK || "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
} as const;
const TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export const ThemedTileLayer = () => {
  const { userGeneralSetting } = useAuth();
  const isDark = useMemo(() => resolveTheme(userGeneralSetting?.theme || "system").includes("dark"), [userGeneralSetting?.theme]);
  return <TileLayer url={isDark ? TILE_URLS.dark : TILE_URLS.light} attribution={TILE_ATTRIBUTION} />;
};
const OPENSTREETMAP_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const OPENSTREETMAP_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export const OpenStreetMapTileLayer = () => <TileLayer url={OPENSTREETMAP_TILE_URL} attribution={OPENSTREETMAP_ATTRIBUTION} maxZoom={19} />;

export const MinimalAttributionControl = () => <AttributionControl prefix={false} />;

interface MarkerIconOptions {
  fill?: string;
  size?: number;
  className?: string;
}

export const createMarkerIcon = (options?: MarkerIconOptions): DivIcon => {
  const { fill = "var(--primary)", size = 24, className = "" } = options || {};
  return new DivIcon({
    className: "relative border-none bg-transparent",
    html: ReactDOMServer.renderToString(
      <div aria-hidden="true" className={`grid place-items-center ${className}`.trim()} style={{ width: size, height: size }}>
        <span
          className="rounded-full border-2 border-white shadow-[0_2px_7px_rgba(15,23,42,0.4)]"
          style={{ width: size - 4, height: size - 4, backgroundColor: fill }}
        />
      </div>,
    ),
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 6)],
  });
};

export const defaultMarkerIcon = createMarkerIcon();
