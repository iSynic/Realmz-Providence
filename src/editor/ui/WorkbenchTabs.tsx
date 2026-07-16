import { useRef, type KeyboardEvent, type ReactNode } from "react";
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
  const previousKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
  const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
  if (![previousKey, nextKey, "Home", "End"].includes(key)) return null;
  const enabled = options.filter((option) => !option.disabled);
  if (!enabled.length) return null;
  const currentIndex = Math.max(0, enabled.findIndex((option) => option.value === value));
  const nextIndex = key === "Home"
    ? 0
    : key === "End"
      ? enabled.length - 1
      : (currentIndex + (key === nextKey ? 1 : -1) + enabled.length) % enabled.length;
  return enabled[nextIndex].value;
}

export function WorkbenchTabs<Value extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  className,
  orientation = "horizontal"
}: WorkbenchTabsProps<Value>) {
  const buttons = useRef(new Map<Value, HTMLButtonElement>());

  const selectAndFocus = (nextValue: Value) => {
    onChange(nextValue);
    buttons.current.get(nextValue)?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const nextValue = workbenchTabKeyboardTarget(options, value, event.key, orientation);
    if (nextValue == null) return;
    event.preventDefault();
    selectAndFocus(nextValue);
  };

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
            ref={(element) => {
              if (element) buttons.current.set(option.value, element);
              else buttons.current.delete(option.value);
            }}
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
