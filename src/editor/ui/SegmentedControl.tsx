import { type ReactNode } from "react";
import { rovingNavigationKeyboardTarget, useRovingNavigation } from "./RovingNavigation";
import "./SegmentedControl.css";

export type SegmentedControlOption<Value extends string = string> = {
  value: Value;
  label: ReactNode;
  meta?: ReactNode;
  disabled?: boolean;
  title?: string;
};

export type SegmentedControlProps<Value extends string = string> = {
  ariaLabel: string;
  value: Value;
  options: ReadonlyArray<SegmentedControlOption<Value>>;
  onChange: (value: Value) => void;
  className?: string;
};

export function segmentedControlKeyboardTarget<Value extends string>(
  options: ReadonlyArray<SegmentedControlOption<Value>>,
  value: Value,
  key: string
): Value | null {
  return rovingNavigationKeyboardTarget(options, value, key);
}

export function SegmentedControl<Value extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  className
}: SegmentedControlProps<Value>) {
  const { handleKeyDown, registerItem } = useRovingNavigation({ options, value, onChange });

  return (
    <div
      className={["segmented-control", className].filter(Boolean).join(" ")}
      role="group"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={registerItem(option.value)}
            type="button"
            aria-pressed={selected}
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
