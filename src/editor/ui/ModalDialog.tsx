import {
  type CSSProperties,
  type FormEventHandler,
  type KeyboardEvent,
  type KeyboardEventHandler,
  type ReactNode,
  useEffect,
  useRef
} from "react";
import "./ModalDialog.css";

const MODAL_FOCUSABLE_SELECTOR = [
  "button:not(:disabled)",
  "a[href]",
  "input:not(:disabled)",
  "iframe",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export type ModalDialogProps = {
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  children: ReactNode;
  className?: string;
  backdropClassName?: string;
  style?: CSSProperties;
  surfaceTag?: "div" | "section" | "form";
  initialFocusSelector?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  dismissDisabled?: boolean;
  onDismiss?: () => void;
  onKeyDown?: KeyboardEventHandler<HTMLElement>;
  onSubmit?: FormEventHandler<HTMLFormElement>;
};

export function modalDialogTabTarget(activeIndex: number, focusableCount: number, shiftKey: boolean) {
  if (focusableCount <= 0) return null;
  if (shiftKey && activeIndex <= 0) return focusableCount - 1;
  if (!shiftKey && (activeIndex < 0 || activeIndex >= focusableCount - 1)) return 0;
  return null;
}

export function modalDialogShouldDismiss(
  key: string,
  hasDismissHandler: boolean,
  closeOnEscape: boolean,
  dismissDisabled: boolean
) {
  return key === "Escape" && hasDismissHandler && closeOnEscape && !dismissDisabled;
}

export function ModalDialog({
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  children,
  className,
  backdropClassName,
  style,
  surfaceTag = "section",
  initialFocusSelector,
  closeOnBackdrop = true,
  closeOnEscape = true,
  dismissDisabled = false,
  onDismiss,
  onKeyDown,
  onSubmit
}: ModalDialogProps) {
  const surfaceRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(activeElement());
  const surfaceClassName = ["workbench-modal-dialog", className].filter(Boolean).join(" ");
  const backdropClasses = ["workbench-modal-backdrop", backdropClassName].filter(Boolean).join(" ");

  useEffect(() => {
    const surface = surfaceRef.current;
    if (surface) {
      const preferred = initialFocusSelector
        ? surface.querySelector<HTMLElement>(initialFocusSelector)
        : surface.querySelector<HTMLElement>("[autofocus], [data-modal-initial-focus]");
      const target = preferred ?? modalDialogFocusableElements(surface)[0] ?? surface;
      target.focus();
    }
    return () => {
      const restoreTarget = restoreFocusRef.current;
      if (restoreTarget?.isConnected) restoreTarget.focus();
    };
  }, [initialFocusSelector]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (modalDialogShouldDismiss(event.key, Boolean(onDismiss), closeOnEscape, dismissDisabled)) {
      event.preventDefault();
      event.stopPropagation();
      onDismiss?.();
      return;
    }
    if (event.key === "Tab") {
      const surface = surfaceRef.current;
      const focusable = surface ? modalDialogFocusableElements(surface) : [];
      if (focusable.length === 0) {
        event.preventDefault();
        surface?.focus();
        return;
      }
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const nextIndex = modalDialogTabTarget(focusable.indexOf(active as HTMLElement), focusable.length, event.shiftKey);
      if (nextIndex != null) {
        event.preventDefault();
        focusable[nextIndex]?.focus();
        return;
      }
    }
    onKeyDown?.(event);
  };

  const setSurfaceRef = (element: HTMLElement | null) => {
    surfaceRef.current = element;
  };
  const sharedProps = {
    className: surfaceClassName,
    style,
    role: "dialog",
    "aria-modal": true,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    "aria-describedby": ariaDescribedBy,
    tabIndex: -1,
    onKeyDown: handleKeyDown
  } as const;
  const surface = surfaceTag === "form" ? (
    <form {...sharedProps} ref={setSurfaceRef} onSubmit={onSubmit}>{children}</form>
  ) : surfaceTag === "div" ? (
    <div {...sharedProps} ref={setSurfaceRef}>{children}</div>
  ) : (
    <section {...sharedProps} ref={setSurfaceRef}>{children}</section>
  );

  return (
    <div
      className={backdropClasses}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget || !closeOnBackdrop || dismissDisabled) return;
        onDismiss?.();
      }}
    >
      {surface}
    </div>
  );
}

function activeElement() {
  return typeof document !== "undefined" && document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
}

function modalDialogFocusableElements(surface: HTMLElement) {
  return [...surface.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR)]
    .filter((element) => element.getAttribute("aria-hidden") !== "true" && element.tabIndex >= 0);
}
