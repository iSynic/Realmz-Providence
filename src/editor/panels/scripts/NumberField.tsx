import { useEffect, useState } from "react";

export function NumberField({
  label,
  value,
  onCommit,
  compact = false,
  disabled = false
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <label className={compact ? "script-number-field compact" : "script-number-field"}>
      <span>{label}</span>
      <input
        type="number"
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => {
          const next = Number(draft);
          if (Number.isFinite(next) && next !== value) onCommit(next);
        }}
      />
    </label>
  );
}
