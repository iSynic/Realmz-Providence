import type { ReactNode } from "react";
import "./WorkbenchLayout.css";

export type WorkbenchGap = "tight" | "normal" | "loose";

export type WorkbenchStackProps = {
  children?: ReactNode;
  gap?: WorkbenchGap;
  className?: string;
};

export function WorkbenchStack({ children, gap = "normal", className }: WorkbenchStackProps) {
  return <div className={classNames("workbench-stack", `gap-${gap}`, className)}>{children}</div>;
}

export type WorkbenchClusterProps = WorkbenchStackProps & {
  align?: "start" | "center" | "end";
  justify?: "start" | "between" | "end";
  nowrap?: boolean;
};

export function WorkbenchCluster({
  children,
  gap = "normal",
  align = "center",
  justify = "start",
  nowrap = false,
  className
}: WorkbenchClusterProps) {
  return (
    <div className={classNames("workbench-cluster", `gap-${gap}`, `align-${align}`, `justify-${justify}`, nowrap && "is-nowrap", className)}>
      {children}
    </div>
  );
}

export type WorkbenchActionBarProps = WorkbenchClusterProps & {
  ariaLabel: string;
  meta?: ReactNode;
};

export function WorkbenchActionBar({ ariaLabel, meta, children, className, ...layout }: WorkbenchActionBarProps) {
  return (
    <div className={classNames("workbench-action-bar", className)} role="toolbar" aria-label={ariaLabel}>
      {meta && <div className="workbench-action-bar-meta">{meta}</div>}
      <WorkbenchCluster justify="end" nowrap {...layout}>{children}</WorkbenchCluster>
    </div>
  );
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
