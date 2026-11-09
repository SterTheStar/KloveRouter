import { useCallback, useEffect, useRef, useState } from "react";

export const SIDEBAR_STORAGE_KEY = "klove_sidebar_width";
export const DEFAULT_SIDEBAR_WIDTH = 288; // 18rem / w-72
export const MIN_SIDEBAR_WIDTH = 220;
export const MAX_SIDEBAR_WIDTH = 480;

export function useSidebarWidth() {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_SIDEBAR_WIDTH;
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!Number.isNaN(parsed) && parsed >= MIN_SIDEBAR_WIDTH && parsed <= MAX_SIDEBAR_WIDTH) {
        return parsed;
      }
    }
    return DEFAULT_SIDEBAR_WIDTH;
  });

  const [isResizing, setIsResizing] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  const startResizing = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setIsResizing(true);
  }, []);

  const resetWidth = useCallback(() => {
    setWidth(DEFAULT_SIDEBAR_WIDTH);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(DEFAULT_SIDEBAR_WIDTH));
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const onMouseMove = (event: MouseEvent) => {
      const nextWidth = Math.min(Math.max(event.clientX, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH);
      setWidth(nextWidth);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(widthRef.current));
    };

    const originalCursor = document.body.style.cursor;
    const originalUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      document.body.style.cursor = originalCursor;
      document.body.style.userSelect = originalUserSelect;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizing]);

  return {
    width,
    isResizing,
    startResizing,
    resetWidth,
  };
}
