import { useEffect, useState } from "react";

export function InlineNumberField({
  ariaLabel,
  value,
  onCommit,
  title
}: {
  ariaLabel: string;
  value: number;
  onCommit: (value: number) => void;
  title?: string;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const next = Number(draft);
    if (Number.isFinite(next) && next !== value) onCommit(next);
  };

  return (
    <input
      className="inline-number-field"
      type="number"
      aria-label={ariaLabel}
      title={title}
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}
