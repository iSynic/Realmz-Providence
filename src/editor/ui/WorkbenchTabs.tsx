import { type ReactNode } from "react";
import { rovingNavigationKeyboardTarget, useRovingNavigation } from "./RovingNavigation";
import "./WorkbenchTabs.css";

export type WorkbenchTabOption<Value extends string = string> = {
  value: Value;
  label: ReactNode;
  meta?: ReactNode;
  disabled?: boolean;
  title?: string;
};

export type WorkbenchTabsProps<Value extends string = string> = {
  ariaLabel: string;
  value: Value;
  options: ReadonlyArray<WorkbenchTabOption<Value>>;
  onChange: (value: Value) => void;
  className?: string;
  orientation?: "horizontal" | "vertical";
};

export function workbenchTabKeyboardTarget<Value extends string>(
  options: ReadonlyArray<WorkbenchTabOption<Value>>,
  value: Value,
  key: string,
  orientation: "horizontal" | "vertical" = "horizontal"
): Value | null {
  return rovingNavigationKeyboardTarget(options, value, key, orientation);
}

export function WorkbenchTabs<Value extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  className,
  orientation = "horizontal"
}: WorkbenchTabsProps<Value>) {
  const { handleKeyDown, registerItem } = useRovingNavigation({ options, value, onChange, orientation });

  return (
    <div
      className={["workbench-tabs", className].filter(Boolean).join(" ")}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation={orientation}
      onKeyDown={handleKeyDown}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={registerItem(option.value)}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={selected ? "is-selected" : undefined}
            disabled={option.disabled}
            title={option.title}
            onClick={() => onChange(option.value)}
          >
            <span>{option.label}</span>
            {option.meta != null && <b>{option.meta}</b>}
          </button>
        );
      })}
    </div>
  );
}
