import { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_DIVINITY_MANUAL_URL } from "../constants";
import { ModalDialog } from "../ui";

type ManualBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function initialManualBounds(): ManualBounds {
  if (typeof window === "undefined") return { x: 80, y: 80, width: 582, height: 760 };
  const width = Math.min(640, window.innerWidth - 32);
  const height = Math.min(820, window.innerHeight - 32);
  return {
    x: Math.max(12, Math.round((window.innerWidth - width) / 2)),
    y: Math.max(12, Math.round((window.innerHeight - height) / 2)),
    width,
    height
  };
}

function clampManualBounds(bounds: ManualBounds): ManualBounds {
  const margin = 12;
  const maxWidth = Math.max(360, window.innerWidth - margin * 2);
  const maxHeight = Math.max(320, window.innerHeight - margin * 2);
  const width = Math.min(Math.max(360, bounds.width), maxWidth);
  const height = Math.min(Math.max(320, bounds.height), maxHeight);
  return {
    width,
    height,
    x: Math.min(Math.max(margin, bounds.x), Math.max(margin, window.innerWidth - width - margin)),
    y: Math.min(Math.max(margin, bounds.y), Math.max(margin, window.innerHeight - height - margin))
  };
}

function centeredManualBounds(width: number, height: number): ManualBounds {
  if (typeof window === "undefined") return { x: 80, y: 80, width, height };
  return clampManualBounds({
    width,
    height,
    x: Math.round((window.innerWidth - width) / 2),
    y: Math.round((window.innerHeight - height) / 2)
  });
}

export function DivinityManualWindow({ href = "", onClose }: { href?: string; onClose: () => void }) {
  const [bounds, setBounds] = useState(initialManualBounds);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    startBounds: ManualBounds;
  } | null>(null);
  const boundsStyle = useMemo(() => ({
    left: `${bounds.x}px`,
    top: `${bounds.y}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`
  }), [bounds]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin === window.location.origin && event.data?.type === "divinity-manual-close") {
        onClose();
      } else if (event.origin === window.location.origin && event.data?.type === "divinity-manual-fit-window") {
        setBounds(centeredManualBounds(640, 820));
      }
    }

    function onResize() {
      setBounds((current) => clampManualBounds(current));
    }

    function onMouseMove(event: globalThis.MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      setBounds(clampManualBounds(
        drag.mode === "move"
          ? { ...drag.startBounds, x: drag.startBounds.x + deltaX, y: drag.startBounds.y + deltaY }
          : { ...drag.startBounds, width: drag.startBounds.width + deltaX, height: drag.startBounds.height + deltaY }
      ));
    }

    function onMouseUp() {
      dragRef.current = null;
      setIsDragging(false);
    }

    window.addEventListener("message", onMessage);
    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onClose]);

  function beginManualDrag(event: MouseEvent<HTMLDivElement>, mode: "move" | "resize") {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startBounds: bounds
    };
    setIsDragging(true);
  }

  return (
    <ModalDialog
      backdropClassName="divinity-manual-overlay"
      className={`divinity-manual-window${isDragging ? " is-dragging" : ""}`}
      ariaLabel="Divinity Manual"
      initialFocusSelector=".divinity-manual-frame"
      style={boundsStyle}
      onDismiss={onClose}
    >
        <iframe className="divinity-manual-frame" title="Divinity Manual" src={`${DEFAULT_DIVINITY_MANUAL_URL}${href}`} />
        <div
          className="divinity-manual-drag-strip"
          aria-hidden="true"
          onMouseDown={(event) => beginManualDrag(event, "move")}
        />
        <div
          className="divinity-manual-resize-grip"
          aria-hidden="true"
          onMouseDown={(event) => beginManualDrag(event, "resize")}
        />
    </ModalDialog>
  );
}
