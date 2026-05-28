import { useEffect, useState } from "react";

export function MapDiagnostics({ diagnostics }: { diagnostics: string[] }) {
  if (diagnostics.length === 0) {
    return <div className="map-diagnostic-list ok"><span>Realmz-writable</span>No map-local blockers detected.</div>;
  }
  return (
    <div className="map-diagnostic-list">
      {diagnostics.map((diagnostic) => (
        <span key={diagnostic}>{diagnostic}</span>
      ))}
    </div>
  );
}

export function MapNumberField({
  label,
  value,
  onCommit,
  min = -32768,
  max = 32767
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const next = clampNumber(Number(draft), min, max);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };
  return (
    <label className="map-number-field">
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(String(value));
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function clampNumber(value: number, min: number, max: number) {
  const numeric = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.max(min, Math.min(max, numeric));
}
