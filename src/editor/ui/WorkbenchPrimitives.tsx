import { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, ChevronDown, Info, Link2, Search, XCircle } from "lucide-react";
import "./workbench.css";

export type WorkbenchTone = "neutral" | "info" | "success" | "warning" | "danger" | "blocked";

export type PanelHeaderProps = {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
  headingLevel?: 1 | 2 | 3;
};

export function PanelHeader({ title, eyebrow, description, meta, actions, className, headingLevel }: PanelHeaderProps) {
  const TitleTag = headingLevel ? (`h${headingLevel}` as "h1" | "h2" | "h3") : "strong";
  return (
    <header className={classNames("workbench-pane-header", className)}>
      <div className="workbench-pane-header-copy">
        {eyebrow && <span className="workbench-pane-header-eyebrow">{eyebrow}</span>}
        <TitleTag>{title}</TitleTag>
        {description && <small>{description}</small>}
      </div>
      {(meta || actions) && (
        <div className={classNames("workbench-pane-header-aside", Boolean(actions) && "has-actions")}>
          {meta && <span className="workbench-pane-header-meta">{meta}</span>}
          {actions}
        </div>
      )}
    </header>
  );
}

export type PanelSectionProps = {
  title: ReactNode;
  eyebrow?: ReactNode;
  count?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  density?: "normal" | "compact";
  scroll?: boolean;
};

export function PanelSection({
  title,
  eyebrow,
  count,
  actions,
  children,
  className,
  density = "normal",
  scroll = false
}: PanelSectionProps) {
  return (
    <section className={classNames("workbench-panel-section", `density-${density}`, scroll && "is-scrollable", className)}>
      <header className="workbench-panel-section-header">
        <div>
          {eyebrow && <span>{eyebrow}</span>}
          <strong>{title}</strong>
        </div>
        {(count || actions) && (
          <div className="workbench-panel-section-actions">
            {count && <b>{count}</b>}
            {actions}
          </div>
        )}
      </header>
      {children && <div className="workbench-panel-section-body">{children}</div>}
    </section>
  );
}

export type CollapsibleSectionProps = PanelSectionProps & {
  storageKey?: string;
  defaultOpen?: boolean;
  tone?: WorkbenchTone;
};

export function CollapsibleSection({
  title,
  eyebrow,
  count,
  actions,
  children,
  className,
  density = "normal",
  scroll = false,
  storageKey,
  defaultOpen = true,
  tone = "neutral"
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(() => readStoredBoolean(storageKey, defaultOpen));

  useEffect(() => {
    setOpen(readStoredBoolean(storageKey, defaultOpen));
  }, [storageKey, defaultOpen]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, open ? "1" : "0");
    } catch {
      // Local storage can be unavailable in hardened browser contexts.
    }
  }, [storageKey, open]);

  return (
    <section className={classNames("workbench-panel-section", "workbench-collapsible-section", `density-${density}`, `tone-${tone}`, scroll && "is-scrollable", !open && "is-collapsed", className)}>
      <header className="workbench-panel-section-header">
        <button type="button" className="workbench-collapse-toggle" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
          <ChevronDown size={13} />
          <span>
            {eyebrow && <em>{eyebrow}</em>}
            <strong>{title}</strong>
          </span>
        </button>
        {(count || actions) && (
          <div className="workbench-panel-section-actions">
            {count && <b>{count}</b>}
            {actions}
          </div>
        )}
      </header>
      {open && children && <div className="workbench-panel-section-body">{children}</div>}
    </section>
  );
}

export type FloatingWorkbenchPanelProps = {
  title: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  storageKey: string;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  className?: string;
};

export function FloatingWorkbenchPanel({
  title,
  eyebrow,
  actions,
  children,
  storageKey,
  defaultWidth = 720,
  defaultHeight = 560,
  minWidth = 420,
  minHeight = 320,
  className
}: FloatingWorkbenchPanelProps) {
  const [box, setBox] = useState(() => readStoredPanelBox(storageKey, defaultWidth, defaultHeight, minWidth, minHeight));
  const dragging = useRef(false);
  const resizing = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, width: defaultWidth, height: defaultHeight });

  useEffect(() => {
    setBox((current) => clampFloatingBox(current, minWidth, minHeight));
  }, [minWidth, minHeight]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(box));
    } catch {
      // Local storage can be unavailable in hardened browser contexts.
    }
  }, [storageKey, box]);

  useEffect(() => {
    function handleMove(event: MouseEvent) {
      if (dragging.current) {
        setBox((current) => clampFloatingBox({
          ...current,
          x: event.clientX - offset.current.x,
          y: event.clientY - offset.current.y
        }, minWidth, minHeight));
      }
      if (resizing.current) {
        const width = resizeStart.current.width + event.clientX - resizeStart.current.x;
        const height = resizeStart.current.height + event.clientY - resizeStart.current.y;
        setBox((current) => clampFloatingBox({ ...current, width, height }, minWidth, minHeight));
      }
    }
    function handleUp() {
      dragging.current = false;
      resizing.current = false;
    }
    function handleResize() {
      setBox((current) => clampFloatingBox(current, minWidth, minHeight));
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("resize", handleResize);
    };
  }, [minWidth, minHeight]);

  const panel = (
    <section
      className={classNames("workbench-floating-panel", className)}
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        minWidth: `min(${minWidth}px, calc(100vw - 24px))`,
        minHeight: `min(${minHeight}px, calc(100vh - 24px))`
      }}
    >
      <header
        className="workbench-floating-panel-header"
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest("button, input, select, textarea, a")) return;
          dragging.current = true;
          offset.current = { x: event.clientX - box.x, y: event.clientY - box.y };
          event.preventDefault();
        }}
      >
        <div>
          {eyebrow && <span>{eyebrow}</span>}
          <strong>{title}</strong>
        </div>
        {actions && <div className="workbench-floating-panel-actions">{actions}</div>}
      </header>
      <div className="workbench-floating-panel-body">{children}</div>
      <button
        type="button"
        className="workbench-floating-panel-resize"
        aria-label="Resize floating panel"
        onMouseDown={(event) => {
          resizing.current = true;
          resizeStart.current = { x: event.clientX, y: event.clientY, width: box.width, height: box.height };
          event.preventDefault();
          event.stopPropagation();
        }}
      />
    </section>
  );

  return createPortal(panel, document.body);
}

function readStoredBoolean(storageKey: string | undefined, fallback: boolean) {
  if (!storageKey) return fallback;
  try {
    const value = window.localStorage.getItem(storageKey);
    if (value == null) return fallback;
    return value === "1" || value === "true";
  } catch {
    return fallback;
  }
}

type FloatingPanelBox = { x: number; y: number; width: number; height: number };

function readStoredPanelBox(storageKey: string, width: number, height: number, minWidth: number, minHeight: number): FloatingPanelBox {
  try {
    const value = window.localStorage.getItem(storageKey);
    if (value) {
      const parsed = JSON.parse(value) as { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
      if (typeof parsed.x === "number" && typeof parsed.y === "number") {
        return clampFloatingBox({
          x: parsed.x,
          y: parsed.y,
          width: typeof parsed.width === "number" ? parsed.width : width,
          height: typeof parsed.height === "number" ? parsed.height : height
        }, minWidth, minHeight);
      }
    }
  } catch {
    // Fall through to the default placement.
  }
  return clampFloatingBox({
    x: Math.max(12, window.innerWidth - width - 18),
    y: Math.max(16, Math.round((window.innerHeight - height) / 2)),
    width,
    height
  }, minWidth, minHeight);
}

function clampFloatingBox(box: FloatingPanelBox, minWidth: number, minHeight: number): FloatingPanelBox {
  const width = clamp(box.width, Math.min(minWidth, window.innerWidth - 24), Math.max(180, window.innerWidth - 24));
  const height = clamp(box.height, Math.min(minHeight, window.innerHeight - 24), Math.max(180, window.innerHeight - 24));
  const maxX = Math.max(12, window.innerWidth - width - 12);
  const maxY = Math.max(12, window.innerHeight - height - 12);
  return {
    x: clamp(box.x, 12, maxX),
    y: clamp(box.y, 12, maxY),
    width,
    height
  };
}

export type FieldRowProps = {
  label: ReactNode;
  value?: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  className?: string;
  htmlFor?: string;
  tone?: WorkbenchTone;
};

export function FieldRow({ label, value, hint, children, className, htmlFor, tone = "neutral" }: FieldRowProps) {
  const labelNode = htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>;
  return (
    <div className={classNames("workbench-field-row", `tone-${tone}`, className)}>
      <div className="workbench-field-row-label">{labelNode}</div>
      <div className="workbench-field-row-value">
        {children ?? value}
        {hint && <small>{hint}</small>}
      </div>
    </div>
  );
}

export type EntityRowProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  icon?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  status?: ReactNode;
  statusTone?: WorkbenchTone;
  tone?: WorkbenchTone;
  actions?: ReactNode;
  onSelect?: () => void;
  className?: string;
};

export function EntityRow({
  title,
  subtitle,
  meta,
  icon,
  selected = false,
  disabled = false,
  status,
  statusTone = "neutral",
  tone = "neutral",
  actions,
  onSelect,
  className
}: EntityRowProps) {
  const statusNode = status ? <em className={classNames("workbench-status-pill", `tone-${statusTone}`)}>{status}</em> : null;
  const mainContent = (
    <>
      {icon && <span className="workbench-entity-row-icon">{icon}</span>}
      <span className="workbench-entity-row-copy">
        <strong>{title}</strong>
        {(subtitle || meta) && (
          <span>
            {subtitle}
            {subtitle && meta ? " | " : ""}
            {meta}
          </span>
        )}
      </span>
      {statusNode && (
        <span className="workbench-entity-row-trailing">
          {statusNode}
        </span>
      )}
    </>
  );
  const content = (
    <>
      {icon && <span className="workbench-entity-row-icon">{icon}</span>}
      <span className="workbench-entity-row-copy">
        <strong>{title}</strong>
        {(subtitle || meta) && (
          <span>
            {subtitle}
            {subtitle && meta ? " | " : ""}
            {meta}
          </span>
        )}
      </span>
      {(statusNode || actions) && (
        <span className="workbench-entity-row-trailing">
          {statusNode}
          {actions}
        </span>
      )}
    </>
  );
  const classes = classNames("workbench-entity-row", `tone-${tone}`, selected && "is-selected", className);

  if (onSelect && actions) {
    return (
      <article className={classNames(classes, "has-actions")}>
        <button className="workbench-entity-row-hit" type="button" disabled={disabled} onClick={onSelect}>
          {mainContent}
        </button>
        <span className="workbench-entity-row-actions">{actions}</span>
      </article>
    );
  }

  if (onSelect) {
    return (
      <button className={classes} type="button" disabled={disabled} onClick={onSelect}>
        {content}
      </button>
    );
  }

  return <article className={classes}>{content}</article>;
}

export type PreviewCardProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  preview?: ReactNode;
  icon?: ReactNode;
  facts?: ReactNode[];
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  tone?: WorkbenchTone;
};

export function PreviewCard({
  title,
  subtitle,
  preview,
  icon,
  facts = [],
  actions,
  children,
  className,
  tone = "neutral"
}: PreviewCardProps) {
  return (
    <article className={classNames("workbench-preview-card", `tone-${tone}`, className)}>
      {(preview || icon) && (
        <div className="workbench-preview-card-media">
          {preview ?? icon}
        </div>
      )}
      <div className="workbench-preview-card-copy">
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
      </div>
      {facts.length > 0 && (
        <div className="workbench-preview-card-facts">
          {facts.map((fact, index) => (
            <span key={index}>{fact}</span>
          ))}
        </div>
      )}
      {children}
      {actions && <div className="workbench-preview-card-actions">{actions}</div>}
    </article>
  );
}

export type WorkbenchIssue = {
  id?: string;
  severity?: WorkbenchTone | "error";
  message: ReactNode;
  detail?: ReactNode;
  target?: ReactNode;
  onSelect?: () => void;
};

export type IssueGroupProps = {
  title: ReactNode;
  issues: WorkbenchIssue[];
  emptyMessage?: ReactNode;
  className?: string;
};

export function IssueGroup({ title, issues, emptyMessage = "No issues.", className }: IssueGroupProps) {
  return (
    <section className={classNames("workbench-issue-group", className)}>
      <header>
        <strong>{title}</strong>
        <b>{issues.length.toLocaleString()}</b>
      </header>
      <div>
        {issues.map((issue, index) => (
          <IssueRow key={issue.id ?? index} issue={issue} />
        ))}
        {issues.length === 0 && <span className="workbench-empty-inline">{emptyMessage}</span>}
      </div>
    </section>
  );
}

function IssueRow({ issue }: { issue: WorkbenchIssue }) {
  const severity = normalizeTone(issue.severity);
  const content = (
    <>
      <span className={classNames("workbench-issue-icon", `tone-${severity}`)}>{issueIcon(severity)}</span>
      <span className="workbench-issue-copy">
        <strong>{issue.message}</strong>
        {(issue.detail || issue.target) && (
          <small>
            {issue.detail}
            {issue.detail && issue.target ? " | " : ""}
            {issue.target}
          </small>
        )}
      </span>
    </>
  );

  if (issue.onSelect) {
    return (
      <button className={classNames("workbench-issue-row", `tone-${severity}`)} type="button" onClick={issue.onSelect}>
        {content}
      </button>
    );
  }

  return <article className={classNames("workbench-issue-row", `tone-${severity}`)}>{content}</article>;
}

export type LinkChipProps = {
  label: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  href?: string;
  selected?: boolean;
  disabled?: boolean;
  inert?: boolean;
  tone?: WorkbenchTone;
  className?: string;
  onClick?: () => void;
};

export function LinkChip({
  label,
  detail,
  icon = <Link2 size={12} />,
  href,
  selected = false,
  disabled = false,
  inert = false,
  tone = "info",
  className,
  onClick
}: LinkChipProps) {
  const content = (
    <>
      {icon}
      <span>{label}</span>
      {detail && <small>{detail}</small>}
    </>
  );
  const classes = classNames(
    "workbench-link-chip",
    `tone-${tone}`,
    selected && "is-selected",
    inert && "is-inert",
    className
  );

  if (href && !disabled && !inert) {
    return (
      <a className={classes} href={href}>
        {content}
      </a>
    );
  }

  if (onClick && !inert) {
    return (
      <button className={classes} type="button" disabled={disabled} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <span className={classes}>{content}</span>;
}

export type ValidationGateProps = {
  ok: boolean;
  title?: ReactNode;
  detail?: ReactNode;
  okLabel?: ReactNode;
  blockedLabel?: ReactNode;
  issues?: WorkbenchIssue[];
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function ValidationGate({
  ok,
  title = "Validation",
  detail,
  okLabel = "Ready",
  blockedLabel = "Blocked",
  issues = [],
  actions,
  children,
  className
}: ValidationGateProps) {
  return (
    <section className={classNames("workbench-validation-gate", ok ? "is-ok" : "is-blocked", className)}>
      <header>
        {ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
        <div>
          <strong>{title}</strong>
          <span>{ok ? okLabel : blockedLabel}</span>
        </div>
        {actions && <div className="workbench-validation-actions">{actions}</div>}
      </header>
      {detail && <p>{detail}</p>}
      {!ok && issues.length > 0 && <IssueGroup title="Blocking items" issues={issues} />}
      {ok && children}
    </section>
  );
}

export type EmptyStateProps = {
  title: ReactNode;
  body?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
};

export function EmptyState({ title, body, icon = <Search size={18} />, action, compact = false, className }: EmptyStateProps) {
  return (
    <div className={classNames("workbench-empty-state", compact && "is-compact", className)}>
      <div className="workbench-empty-state-icon">{icon}</div>
      <div>
        <strong>{title}</strong>
        {body && <span>{body}</span>}
      </div>
      {action && <div className="workbench-empty-state-action">{action}</div>}
    </div>
  );
}

export type HelpBubbleSide = "right" | "left" | "below" | "above";

export type HelpBubbleProps = {
  title: ReactNode;
  body?: ReactNode;
  children?: ReactNode;
  id?: string;
  side?: HelpBubbleSide;
  open?: boolean;
  floating?: boolean;
  style?: CSSProperties;
  className?: string;
};

export function HelpBubble({
  title,
  body,
  children,
  id,
  side = "right",
  open = true,
  floating = false,
  style,
  className
}: HelpBubbleProps) {
  return (
    <span
      id={id}
      role="tooltip"
      data-side={side}
      style={style}
      className={classNames(
        "workbench-help-bubble",
        `workbench-help-bubble-${side}`,
        floating && "is-floating",
        open && "is-open",
        className
      )}
    >
      <strong>{title}</strong>
      {body && <span>{body}</span>}
      {children}
    </span>
  );
}

export type ScrollAreaProps = {
  children?: ReactNode;
  className?: string;
  shellClassName?: string;
  orientation?: "vertical" | "horizontal" | "both";
  onViewportRef?: (node: HTMLDivElement | null) => void;
  "aria-label"?: string;
};

type ScrollMetrics = {
  canX: boolean;
  canY: boolean;
  xThumb: number;
  yThumb: number;
  xThumbSize: number;
  yThumbSize: number;
  xTrack: number;
  yTrack: number;
};

const EMPTY_SCROLL_METRICS: ScrollMetrics = {
  canX: false,
  canY: false,
  xThumb: 0,
  yThumb: 0,
  xThumbSize: 0,
  yThumbSize: 0,
  xTrack: 0,
  yTrack: 0
};

export function ScrollArea({
  children,
  className,
  shellClassName,
  orientation = "vertical",
  onViewportRef,
  "aria-label": ariaLabel
}: ScrollAreaProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = useState<ScrollMetrics>(EMPTY_SCROLL_METRICS);
  const allowX = orientation === "horizontal" || orientation === "both";
  const allowY = orientation === "vertical" || orientation === "both";
  const updateMetrics = useCallback(() => {
    const element = viewportRef.current;
    if (!element) return;
    setMetrics(readScrollMetrics(element, allowX, allowY));
  }, [allowX, allowY]);
  const setViewportNode = useCallback(
    (node: HTMLDivElement | null) => {
      viewportRef.current = node;
      onViewportRef?.(node);
    },
    [onViewportRef]
  );

  useLayoutEffect(() => {
    updateMetrics();
  }, [children, updateMetrics]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const handleScroll = () => updateMetrics();
    const handleResize = () => updateMetrics();
    element.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(handleResize) : null;
    resizeObserver?.observe(element);
    const mutationObserver = typeof MutationObserver !== "undefined" ? new MutationObserver(handleResize) : null;
    mutationObserver?.observe(element, { childList: true, subtree: true, attributes: true });
    updateMetrics();
    return () => {
      element.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [updateMetrics]);

  return (
    <div
      className={classNames(
        "workbench-scroll-area",
        `scroll-${orientation}`,
        metrics.canX && "has-horizontal-scroll",
        metrics.canY && "has-vertical-scroll",
        shellClassName
      )}
    >
      <div ref={setViewportNode} className={classNames("workbench-scroll-viewport", className)} aria-label={ariaLabel}>
        {children}
      </div>
      {metrics.canY && (
        <div
          className="workbench-scrollbar workbench-scrollbar-y"
          aria-hidden="true"
          onPointerDown={(event) => beginScrollDrag(event, "y", viewportRef.current, metrics)}
        >
          <span style={{ height: metrics.yThumbSize, transform: `translateY(${metrics.yThumb}px)` }} />
        </div>
      )}
      {metrics.canX && (
        <div
          className="workbench-scrollbar workbench-scrollbar-x"
          aria-hidden="true"
          onPointerDown={(event) => beginScrollDrag(event, "x", viewportRef.current, metrics)}
        >
          <span style={{ width: metrics.xThumbSize, transform: `translateX(${metrics.xThumb}px)` }} />
        </div>
      )}
    </div>
  );
}

function readScrollMetrics(element: HTMLDivElement, allowX: boolean, allowY: boolean): ScrollMetrics {
  const canY = allowY && element.scrollHeight > element.clientHeight + 1;
  const canX = allowX && element.scrollWidth > element.clientWidth + 1;
  const xTrack = Math.max(0, element.clientWidth - 12 - (canY ? 14 : 0));
  const yTrack = Math.max(0, element.clientHeight - 12 - (canX ? 14 : 0));
  const yThumbSize = canY ? clamp((element.clientHeight / element.scrollHeight) * yTrack, 32, yTrack) : 0;
  const xThumbSize = canX ? clamp((element.clientWidth / element.scrollWidth) * xTrack, 32, xTrack) : 0;
  const yThumb = canY
    ? (element.scrollTop / Math.max(1, element.scrollHeight - element.clientHeight)) * Math.max(0, yTrack - yThumbSize)
    : 0;
  const xThumb = canX
    ? (element.scrollLeft / Math.max(1, element.scrollWidth - element.clientWidth)) * Math.max(0, xTrack - xThumbSize)
    : 0;
  return { canX, canY, xThumb, yThumb, xThumbSize, yThumbSize, xTrack, yTrack };
}

function beginScrollDrag(event: ReactPointerEvent<HTMLDivElement>, axis: "x" | "y", element: HTMLDivElement | null, metrics: ScrollMetrics) {
  if (!element) return;
  event.preventDefault();
  const pointerId = event.pointerId;
  event.currentTarget.setPointerCapture(pointerId);
  const startPointer = axis === "y" ? event.clientY : event.clientX;
  const startScroll = axis === "y" ? element.scrollTop : element.scrollLeft;
  const scrollRange = axis === "y"
    ? element.scrollHeight - element.clientHeight
    : element.scrollWidth - element.clientWidth;
  const thumbRange = axis === "y"
    ? metrics.yTrack - metrics.yThumbSize
    : metrics.xTrack - metrics.xThumbSize;
  const ratio = scrollRange / Math.max(1, thumbRange);

  function move(moveEvent: PointerEvent) {
    const pointer = axis === "y" ? moveEvent.clientY : moveEvent.clientX;
    const next = startScroll + (pointer - startPointer) * ratio;
    if (axis === "y") element!.scrollTop = next;
    else element!.scrollLeft = next;
  }

  function stop() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
  }

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop, { once: true });
  window.addEventListener("pointercancel", stop, { once: true });
}

function clamp(value: number, min: number, max: number) {
  if (max <= min) return Math.max(0, max);
  return Math.min(max, Math.max(min, value));
}

function normalizeTone(tone: WorkbenchIssue["severity"]): WorkbenchTone {
  if (tone === "error") return "danger";
  return tone ?? "neutral";
}

function issueIcon(tone: WorkbenchTone) {
  if (tone === "success") return <CheckCircle2 size={13} />;
  if (tone === "danger" || tone === "blocked") return <XCircle size={13} />;
  if (tone === "warning") return <AlertCircle size={13} />;
  return <Info size={13} />;
}

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
