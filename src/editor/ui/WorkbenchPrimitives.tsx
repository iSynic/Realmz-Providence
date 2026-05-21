import { CSSProperties, ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, Link2, Search, XCircle } from "lucide-react";
import "./workbench.css";

export type WorkbenchTone = "neutral" | "info" | "success" | "warning" | "danger" | "blocked";

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
