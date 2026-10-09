import { ChevronLeft, ChevronRight, InfoIcon, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import MediaMetadataDetails from "@/components/MediaMetadataDetails";
import MotionPhotoPreview from "@/components/MotionPhotoPreview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import useMediaQuery from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";
import type { PreviewMediaItem } from "@/utils/media-item";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imgUrls?: string[];
  items?: PreviewMediaItem[];
  initialIndex?: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.2;
const DOUBLE_TAP_ZOOM = 2;
const SWIPE_DISTANCE = 64;
const NO_PAN = { x: 0, y: 0 };

const clampZoom = (scale: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
type Point = { x: number; y: number };
type Gesture =
  | { type: "single"; start: Point; pan: Point; canSwipe: boolean }
  | { type: "pinch"; distance: number; midpoint: Point; center: Point; scale: number; pan: Point };

const distanceBetween = (first: Point, second: Point) => Math.hypot(first.x - second.x, first.y - second.y);
const midpointBetween = (first: Point, second: Point): Point => ({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });

function PreviewImageDialog({ open, onOpenChange, imgUrls = [], items, initialIndex = 0 }: Props) {
  const t = useTranslate();
  const sm = useMediaQuery("sm");
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomScale, setZoomScale] = useState(MIN_ZOOM);
  const [panOffset, setPanOffset] = useState<Point>(NO_PAN);
  const [isInteracting, setIsInteracting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<Gesture | null>(null);
  const zoomRef = useRef(MIN_ZOOM);
  const panRef = useRef<Point>(NO_PAN);
  const previewItems = useMemo(
    () => items ?? imgUrls.map((url) => ({ id: url, kind: "image" as const, sourceUrl: url, posterUrl: url, filename: "Image" })),
    [imgUrls, items],
  );

  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
      setShowDetails(false);
    }
  }, [initialIndex, open]);

  const itemCount = previewItems.length;
  const safeIndex = Math.max(0, Math.min(currentIndex, itemCount - 1));
  const currentItem = previewItems[safeIndex];
  const hasMultiple = itemCount > 1;
  const isImagePreview = currentItem?.kind === "image";
  const canGoPrevious = safeIndex > 0;
  const canGoNext = safeIndex < itemCount - 1;
  const zoomPercent = Math.round(zoomScale * 100);
  const isZoomed = zoomScale > MIN_ZOOM;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!open) {
        return;
      }

      if (event.key === "ArrowLeft") {
        setCurrentIndex((prev) => Math.max(prev - 1, 0));
        return;
      }

      if (event.key === "ArrowRight") {
        setCurrentIndex((prev) => Math.min(prev + 1, itemCount - 1));
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [itemCount, open]);

  useEffect(() => {
    setZoomScale(MIN_ZOOM);
    setPanOffset(NO_PAN);
    zoomRef.current = MIN_ZOOM;
    panRef.current = NO_PAN;
    pointersRef.current.clear();
    gestureRef.current = null;
    setIsInteracting(false);
  }, [currentItem?.id, open]);

  const handleClose = () => onOpenChange(false);
  const handlePrevious = () => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  };
  const handleNext = () => {
    setCurrentIndex((prev) => Math.min(prev + 1, itemCount - 1));
  };

  const clampPan = (point: Point, scale: number): Point => {
    const surface = surfaceRef.current;
    const image = imageRef.current;
    if (!surface || !image || scale <= MIN_ZOOM) return NO_PAN;
    const style = getComputedStyle(surface);
    const width = surface.clientWidth - parseFloat(style.paddingLeft || "0") - parseFloat(style.paddingRight || "0");
    const height = surface.clientHeight - parseFloat(style.paddingTop || "0") - parseFloat(style.paddingBottom || "0");
    const maxX = Math.max(0, (image.offsetWidth * scale - width) / 2);
    const maxY = Math.max(0, (image.offsetHeight * scale - height) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, point.x)), y: Math.max(-maxY, Math.min(maxY, point.y)) };
  };
  const updateZoom = (nextScale: number, nextPan = panRef.current) => {
    const scale = clampZoom(nextScale);
    const pan = clampPan(nextPan, scale);
    zoomRef.current = scale;
    panRef.current = pan;
    setZoomScale(scale);
    setPanOffset(pan);
  };
  const resetZoom = () => updateZoom(MIN_ZOOM);
  const handleZoomIn = () => updateZoom(zoomScale + ZOOM_STEP);
  const handleZoomOut = () => updateZoom(zoomScale - ZOOM_STEP);
  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (isImagePreview) {
      event.preventDefault();
      updateZoom(zoomScale + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
    }
  };
  const handleDoubleClick = () => updateZoom(zoomRef.current === MIN_ZOOM ? DOUBLE_TAP_ZOOM : MIN_ZOOM);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isImagePreview || (event.pointerType === "mouse" && zoomRef.current === MIN_ZOOM)) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    if (points.length === 1) {
      gestureRef.current = {
        type: "single",
        start: points[0],
        pan: panRef.current,
        canSwipe: event.pointerType === "touch" && zoomRef.current === MIN_ZOOM,
      };
    } else if (points.length === 2) {
      const rect = imageRef.current?.parentElement?.getBoundingClientRect();
      gestureRef.current = {
        type: "pinch",
        distance: distanceBetween(points[0], points[1]),
        midpoint: midpointBetween(points[0], points[1]),
        center: rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : NO_PAN,
        scale: zoomRef.current,
        pan: panRef.current,
      };
    }
    setIsInteracting(true);
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    if (event.pointerType === "touch") event.preventDefault();
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = gestureRef.current;
    const points = [...pointersRef.current.values()];
    if (gesture?.type === "pinch" && points.length === 2 && gesture.distance > 0) {
      const midpoint = midpointBetween(points[0], points[1]);
      const scale = clampZoom((gesture.scale * distanceBetween(points[0], points[1])) / gesture.distance);
      const ratio = scale / gesture.scale;
      updateZoom(scale, {
        x: midpoint.x - gesture.center.x - (gesture.midpoint.x - gesture.center.x - gesture.pan.x) * ratio,
        y: midpoint.y - gesture.center.y - (gesture.midpoint.y - gesture.center.y - gesture.pan.y) * ratio,
      });
    } else if (gesture?.type === "single" && points.length === 1 && zoomRef.current > MIN_ZOOM) {
      updateZoom(zoomRef.current, {
        x: gesture.pan.x + points[0].x - gesture.start.x,
        y: gesture.pan.y + points[0].y - gesture.start.y,
      });
    }
  };
  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    const gesture = gestureRef.current;
    const end = { x: event.clientX, y: event.clientY };
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (event.type !== "pointercancel" && gesture?.type === "single" && gesture.canSwipe && zoomRef.current === MIN_ZOOM) {
      const dx = end.x - gesture.start.x;
      const dy = end.y - gesture.start.y;
      if (Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.3) {
        if (dx > 0) handlePrevious();
        else handleNext();
      }
    }
    const remaining = [...pointersRef.current.values()];
    gestureRef.current = remaining.length === 1 ? { type: "single", start: remaining[0], pan: panRef.current, canSwipe: false } : null;
    if (remaining.length === 0) setIsInteracting(false);
  };

  if (!itemCount || !currentItem) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        if (!nextOpen && showDetails && eventDetails.reason === "escape-key") {
          eventDetails.cancel();
          setShowDetails(false);
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="!h-[100dvh] !w-[100vw] !max-h-[100dvh] !max-w-[100vw] overflow-hidden border-0 bg-black/92 p-0 shadow-none"
      >
        <VisuallyHidden>
          <DialogTitle>{currentItem.filename || "Attachment preview"}</DialogTitle>
          <DialogDescription>
            Attachment preview dialog. Press Escape to close, use left or right arrow keys to switch items, and zoom images with the
            controls, mouse wheel, double tap, or a pinch gesture. Swipe horizontally to switch images.
          </DialogDescription>
        </VisuallyHidden>

        <div
          className={cn(
            "absolute inset-x-0 top-0 z-50 bg-linear-to-b from-black/70 via-black/35 to-transparent px-3 pb-6 pt-3 sm:px-5 sm:pt-4",
            showDetails && "lg:pr-[23rem]",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-white">
              <div className="truncate text-sm font-medium">{currentItem.filename || "Attachment"}</div>
              {hasMultiple && (
                <div className="mt-1 text-xs text-white/70">
                  {safeIndex + 1} / {itemCount}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                onClick={() => setShowDetails((visible) => !visible)}
                variant="ghost"
                size="icon"
                className={cn("rounded-full text-white hover:bg-white/16 hover:text-white", showDetails ? "bg-white/18" : "bg-white/10")}
                aria-label={showDetails ? t("attachment-details.actions.hide") : t("attachment-details.actions.show")}
                aria-expanded={showDetails}
                aria-controls="attachment-media-details"
              >
                <InfoIcon className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                onClick={handleClose}
                variant="ghost"
                size="icon"
                className="rounded-full bg-white/10 text-white hover:bg-white/16 hover:text-white"
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div
          data-testid={isImagePreview ? "preview-zoom-surface" : undefined}
          className={cn(
            "flex h-full w-full items-center justify-center px-3 pb-20 pt-16 sm:px-16 sm:pb-8 sm:pt-20",
            isImagePreview && "cursor-zoom-in",
            showDetails && "lg:pr-[26rem]",
          )}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          ref={surfaceRef}
          style={{ touchAction: isImagePreview ? "none" : undefined }}
          onClick={(event) => {
            if (event.target === event.currentTarget && !isZoomed) {
              if (showDetails) {
                setShowDetails(false);
              } else {
                handleClose();
              }
            }
          }}
        >
          <div className="flex max-h-full max-w-full items-center justify-center" onClick={(event) => event.stopPropagation()}>
            {currentItem.kind === "video" ? (
              <video
                key={currentItem.id}
                src={currentItem.sourceUrl}
                poster={currentItem.posterUrl}
                className={cn(
                  "max-h-[calc(100dvh-8rem)] max-w-[calc(100vw-1.5rem)] rounded-md object-contain sm:max-h-[calc(100dvh-7rem)] sm:max-w-[calc(100vw-8rem)]",
                  showDetails && "lg:max-w-[calc(100vw-30rem)]",
                )}
                controls
                autoPlay
                playsInline
              />
            ) : currentItem.kind === "motion" ? (
              <MotionPhotoPreview
                key={currentItem.id}
                posterUrl={currentItem.posterUrl}
                motionUrl={currentItem.motionUrl}
                alt={`Preview live photo ${safeIndex + 1} of ${itemCount}`}
                presentationTimestampUs={currentItem.presentationTimestampUs}
                badgeClassName="left-3 top-3 sm:left-4 sm:top-4"
                mediaClassName={cn(
                  "max-h-[calc(100dvh-8rem)] max-w-[calc(100vw-1.5rem)] rounded-md object-contain sm:max-h-[calc(100dvh-7rem)] sm:max-w-[calc(100vw-8rem)]",
                  showDetails && "lg:max-w-[calc(100vw-30rem)]",
                )}
              />
            ) : (
              <img
                ref={imageRef}
                src={currentItem.sourceUrl}
                alt={`Preview image ${safeIndex + 1} of ${itemCount}`}
                className={cn(
                  "max-h-[calc(100dvh-8rem)] max-w-[calc(100vw-1.5rem)] rounded-md object-contain select-none sm:max-h-[calc(100dvh-7rem)] sm:max-w-[calc(100vw-8rem)]",
                  showDetails && "lg:max-w-[calc(100vw-30rem)]",
                )}
                style={{
                  transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoomScale})`,
                  transition: isInteracting ? "none" : "transform 120ms ease-out",
                  transformOrigin: "center center",
                }}
                onDoubleClick={handleDoubleClick}
                draggable={false}
                loading="eager"
                decoding="async"
              />
            )}
          </div>
        </div>

        {isImagePreview && (
          <div className={cn("absolute inset-x-0 bottom-0 z-30 px-3 pb-3 pt-6", showDetails && "hidden lg:block lg:pr-[22rem]")}>
            <div className="mx-auto flex w-fit items-center gap-1 rounded-full bg-black/60 px-2 py-2 text-white shadow-lg backdrop-blur-sm">
              {hasMultiple && !sm && (
                <>
                  <ZoomButton label="Previous item" onClick={handlePrevious} disabled={!canGoPrevious}>
                    <ChevronLeft className="h-4 w-4" />
                  </ZoomButton>
                  <div className="min-w-9 px-1 text-center text-xs font-medium tabular-nums text-white/75">
                    {safeIndex + 1}/{itemCount}
                  </div>
                  <ZoomButton label="Next item" onClick={handleNext} disabled={!canGoNext}>
                    <ChevronRight className="h-4 w-4" />
                  </ZoomButton>
                  <div className="mx-1 h-5 w-px bg-white/18" />
                </>
              )}
              <ZoomButton label="Zoom out" onClick={handleZoomOut} disabled={zoomScale === MIN_ZOOM}>
                <ZoomOut className="h-4 w-4" />
              </ZoomButton>
              <div className="min-w-12 px-2 text-center text-xs font-medium tabular-nums text-white/80">{zoomPercent}%</div>
              <ZoomButton label="Zoom in" onClick={handleZoomIn} disabled={zoomScale === MAX_ZOOM}>
                <ZoomIn className="h-4 w-4" />
              </ZoomButton>
              <div className="mx-1 h-5 w-px bg-white/18" />
              <ZoomButton label="Reset zoom" onClick={resetZoom} disabled={!isZoomed}>
                <RotateCcw className="h-4 w-4" />
              </ZoomButton>
            </div>
          </div>
        )}

        {hasMultiple && sm && (
          <>
            <NavButton
              side="left"
              disabled={!canGoPrevious}
              label="Previous item"
              onClick={handlePrevious}
              icon={<ChevronLeft className="h-5 w-5" />}
            />
            <NavButton
              side="right"
              disabled={!canGoNext}
              label="Next item"
              onClick={handleNext}
              icon={<ChevronRight className="h-5 w-5" />}
              detailsOpen={showDetails}
            />
          </>
        )}

        {hasMultiple && !sm && !isImagePreview && !showDetails && (
          <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-3 pt-6">
            <div className="mx-auto flex max-w-xs items-center justify-between rounded-full bg-black/55 px-2 py-2 backdrop-blur-sm">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handlePrevious}
                disabled={!canGoPrevious}
                className="rounded-full px-3 text-white hover:bg-white/10 hover:text-white disabled:text-white/35"
              >
                Prev
              </Button>
              <div className="px-3 text-xs text-white/75">
                {safeIndex + 1} / {itemCount}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleNext}
                disabled={!canGoNext}
                className="rounded-full px-3 text-white hover:bg-white/10 hover:text-white disabled:text-white/35"
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {showDetails && <MediaMetadataDetails id="attachment-media-details" item={currentItem} onClose={() => setShowDetails(false)} />}
      </DialogContent>
    </Dialog>
  );
}

interface NavButtonProps {
  side: "left" | "right";
  disabled: boolean;
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  detailsOpen?: boolean;
}

const NavButton = ({ side, disabled, label, onClick, icon, detailsOpen = false }: NavButtonProps) => (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    disabled={disabled}
    onClick={onClick}
    aria-label={label}
    className={cn(
      "absolute top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/16 hover:text-white disabled:opacity-25 sm:flex",
      side === "left" ? "left-4" : detailsOpen ? "right-4 lg:right-[23rem]" : "right-4",
    )}
  >
    {icon}
  </Button>
);

const ZoomButton = ({
  disabled,
  label,
  onClick,
  children,
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    disabled={disabled}
    onClick={onClick}
    aria-label={label}
    className="h-9 w-9 rounded-full text-white hover:bg-white/12 hover:text-white disabled:text-white/35"
  >
    {children}
  </Button>
);

export default PreviewImageDialog;
