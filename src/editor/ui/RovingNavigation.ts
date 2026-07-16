import { useRef, type KeyboardEvent } from "react";

export type RovingNavigationOption<Value extends string = string> = {
  value: Value;
  disabled?: boolean;
};

export type RovingNavigationOrientation = "horizontal" | "vertical";

export function rovingNavigationKeyboardTarget<Value extends string>(
  options: ReadonlyArray<RovingNavigationOption<Value>>,
  value: Value,
  key: string,
  orientation: RovingNavigationOrientation = "horizontal"
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

export function useRovingNavigation<Value extends string>({
  options,
  value,
  onChange,
  orientation = "horizontal"
}: {
  options: ReadonlyArray<RovingNavigationOption<Value>>;
  value: Value;
  onChange: (value: Value) => void;
  orientation?: RovingNavigationOrientation;
}) {
  const items = useRef(new Map<Value, HTMLElement>());

  function registerItem(itemValue: Value) {
    return (element: HTMLElement | null) => {
      if (element) items.current.set(itemValue, element);
      else items.current.delete(itemValue);
    };
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    const nextValue = rovingNavigationKeyboardTarget(options, value, event.key, orientation);
    if (nextValue == null) return;
    event.preventDefault();
    onChange(nextValue);
    items.current.get(nextValue)?.focus();
  }

  return { handleKeyDown, registerItem };
}
