import { ReactNode } from "react";
import "./FormField.css";

export type FormGridProps = {
  children: ReactNode;
  columns?: 1 | 2 | 3 | "auto";
  className?: string;
};

export function FormGrid({ children, columns = 2, className }: FormGridProps) {
  return (
    <div className={classNames("workbench-form-grid", `columns-${columns}`, className)}>
      {children}
    </div>
  );
}

export type FormFieldProps = {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
  wide?: boolean;
  title?: string;
};

export function FormField({ label, children, hint, className, wide = false, title }: FormFieldProps) {
  return (
    <label className={classNames("workbench-form-field", wide && "is-wide", className)} title={title}>
      <span className="workbench-form-field-label">{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
