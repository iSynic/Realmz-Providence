import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

type ResizeEdge = "left" | "right";

export function ResizablePane({
  className,
  ariaLabel,
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
  edge,
  children
}: {
  className: string;
  ariaLabel?: string;
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  edge: ResizeEdge;
  children: ReactNode;
}) {
  const bounds = useMemo(() => ({ min: minWidth, max: maxWidth }), [minWidth, maxWidth]);
  const [width, setWidth] = useState(() => readStoredWidth(storageKey, defaultWidth, bounds));

  useEffect(() => {
    setWidth(readStoredWidth(storageKey, defaultWidth, bounds));
  }, [storageKey]);

  useEffect(() => {
    setWidth((current) => clampWidth(current, bounds));
  }, [bounds]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, String(width));
    } catch {
      // Local storage can be unavailable in hardened browser contexts.
    }
  }, [storageKey, width]);

  function resizeBy(delta: number) {
    setWidth((current) => clampWidth(current + delta, bounds));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const direction = edge === "right" ? 1 : -1;

    function onPointerMove(moveEvent: globalThis.PointerEvent) {
      const delta = (moveEvent.clientX - startX) * direction;
      setWidth(clampWidth(startWidth + delta, bounds));
    }

    function onPointerUp() {
      document.body.classList.remove("is-resizing-pane");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    }

    document.body.classList.add("is-resizing-pane");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if (event.key === "Home") setWidth(bounds.min);
    else if (event.key === "End") setWidth(bounds.max);
    else resizeBy((event.key === "ArrowRight" ? 1 : -1) * (edge === "right" ? 16 : -16));
  }

  return (
    <aside
      className={`resizable-pane ${className}`}
      aria-label={ariaLabel}
      style={{ width: `${width}px`, "--pane-width": `${width}px` } as CSSProperties}
    >
      {children}
      <div
        className={`pane-resize-handle pane-resize-handle-${edge}`}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuemin={bounds.min}
        aria-valuemax={bounds.max}
        aria-valuenow={width}
        tabIndex={0}
        title="Drag to resize. Double-click to reset."
        onPointerDown={onPointerDown}
        onDoubleClick={() => setWidth(defaultWidth)}
        onKeyDown={onKeyDown}
      />
    </aside>
  );
}

function readStoredWidth(storageKey: string, fallback: number, bounds: { min: number; max: number }) {
  try {
    const value = Number(window.localStorage.getItem(storageKey));
    return Number.isFinite(value) ? clampWidth(value, bounds) : clampWidth(fallback, bounds);
  } catch {
    return clampWidth(fallback, bounds);
  }
}

function clampWidth(value: number, bounds: { min: number; max: number }) {
  return Math.max(bounds.min, Math.min(bounds.max, Math.round(value)));
}
