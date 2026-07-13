import { type ReactNode, useEffect, useState } from "react";
import { TutorialTip } from "../../components/TutorialTip";

export function NumberField({ label, value, help, onCommit }: { label: string; value: number; help?: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="combat-field">
      <FieldLabel label={label} help={help} />
      <input
        type="number"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => onCommit(Number.isFinite(Number(draft)) ? Number(draft) : value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

export function TextField({ label, value, help, onCommit }: { label: string; value: string; help?: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="combat-field">
      <FieldLabel label={label} help={help} />
      <input
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

export function TextAreaField({ label, value, placeholder, onCommit }: { label: string; value: string; placeholder?: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="combat-field combat-textarea-field">
      <span>{label}</span>
      <textarea
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => onCommit(draft)}
      />
    </label>
  );
}

export function ToggleButton({
  active,
  label,
  icon,
  disabled,
  help,
  helpSide = "right",
  onClick
}: {
  active: boolean;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  help?: string;
  helpSide?: "right" | "left" | "below" | "above";
  onClick: () => void;
}) {
  const button = (
    <button type="button" className={`combat-toggle${active ? " active" : ""}`} disabled={disabled} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
  if (!help) return button;
  return (
    <TutorialTip title={label} body={help} side={helpSide}>
      {button}
    </TutorialTip>
  );
}

export function FieldLabel({ label, help }: { label: string; help?: string }) {
  if (!help) return <span title={label}>{label}</span>;
  return (
    <span>
      <TutorialTip title={label} body={help} side="right">
        <span title={label}>{label}</span>
      </TutorialTip>
    </span>
  );
}
