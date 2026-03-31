import { useEffect, useCallback } from "react";
import { atom, useAtom } from "jotai";

const ZOOM_MIN = -0.5; // ~70% zoom
const ZOOM_MAX = 0.5; // ~150% zoom
const ZOOM_STEP = 0.1;

const zoomLevelAtom = atom(0.0); // Electron zoom level

export function useZoom() {
  const [zoomLevel, setZoomLevel] = useAtom(zoomLevelAtom);

  const zoomIn = useCallback(() => {
    setZoomLevel((prev) => Math.min(prev + ZOOM_STEP, ZOOM_MAX));
  }, [setZoomLevel]);

  const zoomOut = useCallback(() => {
    setZoomLevel((prev) => Math.max(prev - ZOOM_STEP, ZOOM_MIN));
  }, [setZoomLevel]);

  const zoomReset = useCallback(() => {
    setZoomLevel(0.0);
  }, [setZoomLevel]);

  return { zoomLevel, zoomIn, zoomOut, zoomReset };
}

export function ZoomController({ children }: { children: React.ReactNode }) {
  const { zoomLevel, zoomIn, zoomOut, zoomReset } = useZoom();

  // Apply zoom to Electron window when level changes
  useEffect(() => {
    window.vibeAPI?.windowControls?.setZoom?.(zoomLevel).catch?.(console.error);
  }, [zoomLevel]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Plus
      if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "=")) {
        e.preventDefault();
        zoomIn();
      }
      // Ctrl/Cmd + Minus
      else if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        zoomOut();
      }
      // Ctrl/Cmd + 0 (reset)
      else if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        zoomReset();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomIn, zoomOut, zoomReset]);

  return <>{children}</>;
}
