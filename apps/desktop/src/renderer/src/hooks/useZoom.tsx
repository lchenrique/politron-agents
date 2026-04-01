import { useEffect, useCallback } from "react";
import { atom, useAtom } from "jotai";

const ZOOM_MIN = -4.0; // ~48% zoom
const ZOOM_MAX = 4.0; // ~207% zoom
const ZOOM_STEP = 0.25;

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
 // Ctrl/Cmd + Plus (also handles numpad +)
 if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "=" || e.key === "Add")) {
 e.preventDefault();
 zoomIn();
 }
 // Ctrl/Cmd + Minus (also handles numpad -)
 else if ((e.ctrlKey || e.metaKey) && (e.key === "-" || e.key === "Subtract")) {
 e.preventDefault();
 zoomOut();
 }
 // Ctrl/Cmd + 0 (reset)
 else if ((e.ctrlKey || e.metaKey) && e.key === "0") {
 e.preventDefault();
 zoomReset();
 }
 };

 const handleWheel = (e: WheelEvent) => {
 // Ctrl/Cmd + Scroll for zoom
 if (e.ctrlKey || e.metaKey) {
 e.preventDefault();
 if (e.deltaY < 0) {
 zoomIn();
 } else if (e.deltaY > 0) {
 zoomOut();
 }
 }
 };

 window.addEventListener("keydown", handleKeyDown);
 window.addEventListener("wheel", handleWheel, { passive: false });
 return () => {
 window.removeEventListener("keydown", handleKeyDown);
 window.removeEventListener("wheel", handleWheel);
 };
 }, [zoomIn, zoomOut, zoomReset]);

 return <>{children}</>;
}
