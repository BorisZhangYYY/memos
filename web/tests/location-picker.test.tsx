import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LocationPicker from "@/components/map/LocationPicker";

const setView = vi.fn();
const locate = vi.fn();
const zoomIn = vi.fn();
const zoomOut = vi.fn();
const eventMap = { setView, locate };
const controlMap = { locate, zoomIn, zoomOut };
interface MockMapEvent {
  latlng: { lat: number; lng: number };
}
let mapEventHandlers: Record<string, (event: MockMapEvent) => void> = {};

vi.mock("leaflet", () => {
  class LatLng {
    lat: number;
    lng: number;

    constructor(lat: number, lng: number) {
      this.lat = lat;
      this.lng = lng;
    }
  }

  class Control {
    addTo() {
      return this;
    }

    remove() {}
  }

  return {
    default: {
      Control,
      DomUtil: {
        create: () => ({ style: {} }),
      },
      DomEvent: {
        disableClickPropagation: () => {},
        disableScrollPropagation: () => {},
      },
    },
    LatLng,
  };
});

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children, zoom, attributionControl }: { children: ReactNode; zoom: number; attributionControl: boolean }) => (
    <div data-testid="map" data-zoom={zoom} data-attribution={String(attributionControl)}>
      {children}
    </div>
  ),
  Marker: ({ position }: { position: { lat: number; lng: number } }) => <div data-testid="marker">{`${position.lat},${position.lng}`}</div>,
  useMap: () => controlMap,
  useMapEvents: (handlers: Record<string, (event: MockMapEvent) => void>) => {
    mapEventHandlers = handlers;
    return eventMap;
  },
}));

vi.mock("@/components/map/map-utils", () => ({
  defaultMarkerIcon: {},
  ThemedTileLayer: () => <div data-testid="tile-layer" />,
}));

vi.mock("@/utils/i18n", () => ({
  useTranslate: () => (key: string) => key,
}));

describe("LocationPicker", () => {
  beforeEach(() => {
    mapEventHandlers = {};
    setView.mockClear();
    locate.mockClear();
  });

  it("does not show the fallback map center as a selected location", () => {
    const { getByTestId, queryByTestId } = render(<LocationPicker />);

    expect(queryByTestId("marker")).not.toBeInTheDocument();
    expect(getByTestId("map")).toHaveAttribute("data-zoom", "2");
    expect(getByTestId("map")).toHaveAttribute("data-attribution", "true");
    expect(locate).not.toHaveBeenCalled();
  });

  it("does not recenter when rerendered with the same coordinates", () => {
    const { rerender } = render(<LocationPicker latlng={{ lat: 1, lng: 2 }} />);

    expect(setView).toHaveBeenCalledTimes(1);

    rerender(<LocationPicker latlng={{ lat: 1, lng: 2 }} />);

    expect(setView).toHaveBeenCalledTimes(1);

    rerender(<LocationPicker latlng={{ lat: 3, lng: 4 }} />);

    expect(setView).toHaveBeenCalledTimes(2);
  });

  it("uses a successful browser location as the selected point", () => {
    const onChange = vi.fn();
    const { getByTestId } = render(<LocationPicker onChange={onChange} />);
    const located = { lat: 31.2304, lng: 121.4737 };

    act(() => mapEventHandlers.locationfound({ latlng: located }));

    expect(onChange).toHaveBeenCalledWith(located);
    expect(setView).toHaveBeenCalledWith(located, 15);
    expect(getByTestId("marker")).toHaveTextContent("31.2304,121.4737");
  });
});
