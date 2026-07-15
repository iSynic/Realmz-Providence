import { useEffect, useState } from "react";

export function ItemNumberInput({
  label,
  value,
  title,
  onCommit
}: {
  label: string;
  value: number;
  title?: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const next = Number(draft);
    if (!Number.isFinite(next)) {
      setDraft(String(value));
      return;
    }
    const normalized = Math.trunc(next);
    setDraft(String(normalized));
    if (normalized !== value) onCommit(normalized);
  };

  return (
    <label className="item-number-input" title={title}>
      <span>{label}</span>
      <input
        type="number"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setDraft(String(value));
        }}
      />
    </label>
  );
}
