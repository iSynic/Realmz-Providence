import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import "./PopoverPanel.css";

export type PopoverPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ariaLabel: string;
  trigger: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
  bodyClassName?: string;
  bodyRole?: "group" | "listbox" | "menu";
  bodyAriaLabel?: string;
  align?: "start" | "end";
};

export function popoverPanelShouldDismiss(key: string, open: boolean) {
  return open && key === "Escape";
}

export function popoverPanelGeometry(rootTop: number, rootBottom: number, viewportHeight: number) {
  const gutter = 8;
  const availableAbove = Math.max(0, rootTop - gutter);
  const availableBelow = Math.max(0, viewportHeight - rootBottom - gutter);
  const placement = availableBelow >= availableAbove ? "below" : "above";
  const available = placement === "below" ? availableBelow : availableAbove;
  return { placement, maxHeight: Math.min(590, available) } as const;
}

export function PopoverPanel({
  open,
  onOpenChange,
  ariaLabel,
  trigger,
  title,
  meta,
  children,
  actions,
  className,
  triggerClassName,
  panelClassName,
  bodyClassName,
  bodyRole,
  bodyAriaLabel,
  align = "start"
}: PopoverPanelProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [geometry, setGeometry] = useState<ReturnType<typeof popoverPanelGeometry>>({ placement: "below", maxHeight: 590 });
  const generatedId = useId();
  const panelId = `workbench-popover-${generatedId}`;

  useEffect(() => {
    if (!open) return;
    function updateGeometry() {
      const bounds = rootRef.current?.getBoundingClientRect();
      if (bounds) setGeometry(popoverPanelGeometry(bounds.top, bounds.bottom, window.innerHeight));
    }
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (!popoverPanelShouldDismiss(event.key, open)) return;
      event.preventDefault();
      onOpenChange(false);
      triggerRef.current?.focus();
    }
    updateGeometry();
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updateGeometry);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updateGeometry);
    };
  }, [onOpenChange, open]);

  return (
    <div className={["workbench-popover", className].filter(Boolean).join(" ")} ref={rootRef}>
      <button
        ref={triggerRef}
        className={["workbench-popover-trigger", triggerClassName].filter(Boolean).join(" ")}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        {trigger}
      </button>
      {open && (
        <section
          id={panelId}
          className={[
            "workbench-popover-panel",
            align === "end" ? "align-end" : "align-start",
            geometry.placement === "above" ? "place-above" : "place-below",
            panelClassName
          ].filter(Boolean).join(" ")}
          style={{ maxHeight: geometry.maxHeight }}
          role="dialog"
          aria-label={ariaLabel}
        >
          <header className="workbench-popover-header">
            <strong>{title}</strong>
            {meta && <span>{meta}</span>}
          </header>
          <div
            className={["workbench-popover-body", bodyClassName].filter(Boolean).join(" ")}
            role={bodyRole}
            aria-label={bodyAriaLabel}
          >
            {children}
          </div>
          {actions && <footer className="workbench-popover-actions">{actions}</footer>}
        </section>
      )}
    </div>
  );
}
