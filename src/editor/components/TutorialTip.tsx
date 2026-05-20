import { CSSProperties, ReactNode, useRef, useState } from "react";

export function TutorialTip({
  title,
  body,
  side = "right",
  children
}: {
  title: string;
  body: string;
  side?: "right" | "left" | "below" | "above";
  children: ReactNode;
}) {
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const [bubbleStyle, setBubbleStyle] = useState<CSSProperties | undefined>();
  const [open, setOpen] = useState(false);

  function updateBubblePosition() {
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof window === "undefined") return;
    const rect = wrapper.getBoundingClientRect();
    const gap = 9;
    const width = 245;
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const midpoint = Math.max(24, Math.min(window.innerHeight - 24, rect.top + rect.height / 2));
    if (side === "right") {
      setBubbleStyle({ left: Math.min(rect.right + gap, maxLeft), top: midpoint });
    } else if (side === "left") {
      setBubbleStyle({ left: Math.max(8, rect.left - width - gap), top: midpoint });
    } else if (side === "above") {
      setBubbleStyle({ left: Math.min(rect.left, maxLeft), top: Math.max(8, rect.top - gap) });
    } else {
      setBubbleStyle({ left: Math.min(rect.left, maxLeft), top: Math.min(rect.bottom + gap, window.innerHeight - 80) });
    }
  }

  function showBubble() {
    updateBubblePosition();
    setOpen(true);
  }

  function hideBubble() {
    setOpen(false);
  }

  return (
    <span
      ref={wrapperRef}
      className={`tutorial-tip tutorial-tip-${side}${open ? " tooltip-open" : ""}`}
      tabIndex={0}
      onMouseEnter={showBubble}
      onMouseLeave={hideBubble}
      onPointerLeave={hideBubble}
      onBlur={hideBubble}
      onFocus={showBubble}
    >
      {children}
      <span className="tutorial-bubble tutorial-bubble-floating" role="tooltip" style={bubbleStyle}>
        <strong>{title}</strong>
        <span>{body}</span>
      </span>
    </span>
  );
}
