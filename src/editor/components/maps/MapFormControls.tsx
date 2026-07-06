import { useEffect, useState } from "react";
import { TutorialTip } from "../TutorialTip";

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
  help,
  commitOnChange = false,
  compact = false,
  plain = false,
  maxLength,
  list,
  min = -32768,
  max = 32767
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  help?: string;
  commitOnChange?: boolean;
  compact?: boolean;
  plain?: boolean;
  maxLength?: number;
  list?: string;
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commitValue = (raw: string, normalizeDraft: boolean) => {
    if (raw.trim() === "" || raw === "-") return;
    const next = clampNumber(Number(raw), min, max);
    if (normalizeDraft) setDraft(String(next));
    if (next !== value) onCommit(next);
  };
  const commit = () => {
    const next = clampNumber(Number(draft), min, max);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };
  return (
    <label className={`map-number-field${compact ? " compact" : ""}${plain ? " plain" : ""}`}>
      <span>
        {help ? (
          <TutorialTip title={label} body={help} side="right">
            <span>{label}</span>
          </TutorialTip>
        ) : label}
      </span>
      <input
        type={plain ? "text" : "number"}
        aria-label={label}
        inputMode={plain ? "numeric" : undefined}
        min={plain ? undefined : min}
        max={plain ? undefined : max}
        maxLength={maxLength}
        list={list}
        value={draft}
        onChange={(event) => {
          const nextDraft = event.currentTarget.value;
          setDraft(nextDraft);
          if (commitOnChange) commitValue(nextDraft, false);
        }}
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
