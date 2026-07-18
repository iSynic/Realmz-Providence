import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_ROW_HEIGHT = 58;
const DEFAULT_OVERSCAN_ROWS = 4;
const DEFAULT_INITIAL_ROWS = 20;

export type FixedRecordListWindow = {
  startIndex: number;
  endIndex: number;
  topSpacer: number;
  bottomSpacer: number;
};

export function fixedRecordListWindow(
  total: number,
  viewportHeight: number,
  scrollTop: number,
  rowHeight = DEFAULT_ROW_HEIGHT,
  overscanRows = DEFAULT_OVERSCAN_ROWS
): FixedRecordListWindow {
  if (total <= 0) return { startIndex: 0, endIndex: 0, topSpacer: 0, bottomSpacer: 0 };
  const visibleRows = viewportHeight > 0
    ? Math.max(1, Math.ceil(viewportHeight / rowHeight))
    : DEFAULT_INITIAL_ROWS;
  const startIndex = clamp(Math.floor(scrollTop / rowHeight) - overscanRows, 0, total);
  const endIndex = clamp(startIndex + visibleRows + overscanRows * 2, startIndex, total);
  return {
    startIndex,
    endIndex,
    topSpacer: startIndex * rowHeight,
    bottomSpacer: Math.max(0, (total - endIndex) * rowHeight)
  };
}

export function useFixedRecordListWindow(total: number, resetKey: string) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = useState({ height: 0, scrollTop: 0 });
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef(metrics);
  const onViewportRef = useCallback((node: HTMLDivElement | null) => setViewport(node), []);
  const scheduleUpdate = useCallback((node: HTMLDivElement) => {
    pendingRef.current = { height: node.clientHeight, scrollTop: node.scrollTop };
    if (frameRef.current != null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const pending = pendingRef.current;
      setMetrics((current) => current.height === pending.height && current.scrollTop === pending.scrollTop ? current : pending);
    });
  }, []);

  useEffect(() => {
    if (!viewport) return;
    const update = () => scheduleUpdate(viewport);
    update();
    viewport.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(viewport);
    return () => {
      viewport.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [scheduleUpdate, viewport]);

  useEffect(() => {
    if (!viewport) return;
    viewport.scrollTop = 0;
    scheduleUpdate(viewport);
  }, [resetKey, scheduleUpdate, viewport]);

  useEffect(() => () => {
    if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  const range = useMemo(
    () => fixedRecordListWindow(total, metrics.height, metrics.scrollTop),
    [metrics.height, metrics.scrollTop, total]
  );
  return { onViewportRef, range };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
