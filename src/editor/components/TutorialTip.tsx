import { CSSProperties, ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HelpBubble, HelpBubbleSide } from "../ui";

export function TutorialTip({
  title,
  body,
  side = "right",
  children
}: {
  title: string;
  body: string;
  side?: HelpBubbleSide;
  children: ReactNode;
}) {
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const tooltipId = useId();
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
    if (typeof document !== "undefined" && document.documentElement.dataset.tutorial === "off") return;
    updateBubblePosition();
    setOpen(true);
  }

  function hideBubble() {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    updateBubblePosition();
    window.addEventListener("resize", updateBubblePosition);
    window.addEventListener("scroll", updateBubblePosition, true);
    return () => {
      window.removeEventListener("resize", updateBubblePosition);
      window.removeEventListener("scroll", updateBubblePosition, true);
    };
  }, [open, side]);

  return (
    <>
      <span
        ref={wrapperRef}
        className={`tutorial-tip tutorial-tip-${side}${open ? " tooltip-open" : ""}`}
        tabIndex={0}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={showBubble}
        onMouseLeave={hideBubble}
        onPointerLeave={hideBubble}
        onBlur={hideBubble}
        onFocus={showBubble}
      >
        {children}
      </span>
      {open && typeof document !== "undefined" && createPortal(
        <HelpBubble
          id={tooltipId}
          title={title}
          body={body}
          side={side}
          floating
          style={bubbleStyle}
          className={`tutorial-bubble tutorial-bubble-floating tutorial-bubble-${side}`}
        />,
        document.body
      )}
    </>
  );
}
