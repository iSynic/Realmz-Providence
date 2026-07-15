import { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Save, X } from "lucide-react";
import { flushSync } from "react-dom";
import { ModalDialog } from "../ui";

export type DraftGuardSurface = "scripts" | "text" | "assets" | "maps" | "combat" | "project" | "library" | "other";

export type DraftGuardEntry = {
  id: string;
  surface: DraftGuardSurface;
  title: string;
  summary: string[];
  apply: () => boolean | Promise<boolean>;
  discard: () => void;
  focus?: () => void;
};

export type DraftGuardContinuationContext = {
  appliedDrafts: boolean;
  discardedDrafts: boolean;
};

type DraftGuardContinuation = (context: DraftGuardContinuationContext) => void | Promise<void>;

type DraftGuardContextValue = {
  registerDraftGuard: (entry: DraftGuardEntry) => () => void;
  confirmBeforeDraftDiscard: (destination: string, action: DraftGuardContinuation) => void;
  hasDirtyDrafts: boolean;
};

type PendingDraftNavigation = {
  destination: string;
  action: DraftGuardContinuation;
};

const DraftChangeGuardContext = createContext<DraftGuardContextValue | null>(null);

export function DraftChangeGuardProvider({ value, children }: { value: DraftGuardContextValue; children: ReactNode }) {
  return <DraftChangeGuardContext.Provider value={value}>{children}</DraftChangeGuardContext.Provider>;
}

export function useDraftChangeGuards() {
  const context = useContext(DraftChangeGuardContext);
  if (!context) {
    return {
      registerDraftGuard: () => () => undefined,
      confirmBeforeDraftDiscard: (_destination: string, action: DraftGuardContinuation) => {
        void action({ appliedDrafts: false, discardedDrafts: false });
      },
      hasDirtyDrafts: false
    };
  }
  return context;
}

export function useDraftChangeGuardController() {
  const entriesRef = useRef(new Map<string, DraftGuardEntry>());
  const [version, setVersion] = useState(0);
  const [pending, setPending] = useState<PendingDraftNavigation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bump = () => setVersion((current) => current + 1);

  const registerDraftGuard = useCallback((entry: DraftGuardEntry) => {
    entriesRef.current.set(entry.id, entry);
    bump();
    return () => {
      const current = entriesRef.current.get(entry.id);
      if (current !== entry) return;
      entriesRef.current.delete(entry.id);
      bump();
    };
  }, []);

  const confirmBeforeDraftDiscard = useCallback((destination: string, action: DraftGuardContinuation) => {
    if (entriesRef.current.size === 0) {
      void action({ appliedDrafts: false, discardedDrafts: false });
      return;
    }
    setError("");
    setPending({ destination, action });
  }, []);

  const entries = useMemo(
    () => [...entriesRef.current.values()].sort((a, b) => draftSurfaceLabel(a.surface).localeCompare(draftSurfaceLabel(b.surface)) || a.title.localeCompare(b.title)),
    [version]
  );
  const groupedEntries = useMemo(() => groupDraftEntries(entries), [entries]);

  const continueAfterApply = async () => {
    if (!pending || busy) return;
    setBusy(true);
    setError("");
    const snapshot = [...entriesRef.current.values()];
    try {
      for (const entry of snapshot) {
        let applyResult: boolean | Promise<boolean> | undefined;
        flushSync(() => {
          applyResult = entry.apply();
        });
        const applied = await applyResult;
        if (applied === false) {
          entry.focus?.();
          setError(`${entry.title} could not be applied. Fix the draft before continuing.`);
          return;
        }
      }
      for (const entry of snapshot) entriesRef.current.delete(entry.id);
      bump();
      const action = pending.action;
      setPending(null);
      await action({ appliedDrafts: snapshot.length > 0, discardedDrafts: false });
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : String(applyError));
    } finally {
      setBusy(false);
    }
  };

  const continueAfterDiscard = async () => {
    if (!pending || busy) return;
    setBusy(true);
    setError("");
    const snapshot = [...entriesRef.current.values()];
    try {
      flushSync(() => {
        for (const entry of snapshot) entry.discard();
      });
      for (const entry of snapshot) entriesRef.current.delete(entry.id);
      bump();
      const action = pending.action;
      setPending(null);
      await action({ appliedDrafts: false, discardedDrafts: snapshot.length > 0 });
    } catch (discardError) {
      setError(discardError instanceof Error ? discardError.message : String(discardError));
    } finally {
      setBusy(false);
    }
  };

  const cancelPending = () => {
    if (busy) return;
    setPending(null);
    setError("");
  };

  const value = useMemo<DraftGuardContextValue>(
    () => ({
      registerDraftGuard,
      confirmBeforeDraftDiscard,
      hasDirtyDrafts: entries.length > 0
    }),
    [confirmBeforeDraftDiscard, entries.length, registerDraftGuard]
  );

  const dialog = pending ? (
    <DraftChangeGuardDialog
      destination={pending.destination}
      groupedEntries={groupedEntries}
      busy={busy}
      error={error}
      onApply={continueAfterApply}
      onDiscard={continueAfterDiscard}
      onCancel={cancelPending}
    />
  ) : null;

  return { value, dialog };
}

function DraftChangeGuardDialog({
  destination,
  groupedEntries,
  busy,
  error,
  onApply,
  onDiscard,
  onCancel
}: {
  destination: string;
  groupedEntries: { surface: DraftGuardSurface; entries: DraftGuardEntry[] }[];
  busy: boolean;
  error: string;
  onApply: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  return (
    <ModalDialog
      backdropClassName="modal-backdrop"
      className="draft-change-dialog"
      ariaLabelledBy="draft-change-title"
      dismissDisabled={busy}
      onDismiss={onCancel}
    >
        <header>
          <div>
            <strong id="draft-change-title">Unapplied Changes</strong>
            <small>Apply or discard draft editor changes before you {destination}.</small>
          </div>
          <button type="button" className="btn btn-secondary btn-xs icon-only" aria-label="Cancel navigation" disabled={busy} onClick={onCancel}>
            <X size={12} />
          </button>
        </header>
        <div className="draft-change-dialog-body">
          {groupedEntries.map((group) => (
            <section key={group.surface}>
              <h4>{draftSurfaceLabel(group.surface)}</h4>
              {group.entries.map((entry) => (
                <article key={entry.id}>
                  <strong>{entry.title}</strong>
                  <ul>
                    {entry.summary.slice(0, 5).map((line) => <li key={line}>{line}</li>)}
                  </ul>
                </article>
              ))}
            </section>
          ))}
          {error && <p className="draft-change-dialog-error">{error}</p>}
        </div>
        <div className="draft-change-dialog-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={onDiscard}>Discard Changes</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onApply}>
            <Save size={12} /> {busy ? "Applying..." : "Apply and Continue"}
          </button>
        </div>
    </ModalDialog>
  );
}

function groupDraftEntries(entries: DraftGuardEntry[]) {
  const groups = new Map<DraftGuardSurface, DraftGuardEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.surface) ?? [];
    group.push(entry);
    groups.set(entry.surface, group);
  }
  return [...groups.entries()].map(([surface, groupEntries]) => ({ surface, entries: groupEntries }));
}

function draftSurfaceLabel(surface: DraftGuardSurface) {
  const labels: Record<DraftGuardSurface, string> = {
    scripts: "Scripts and Action Points",
    text: "Text",
    assets: "Assets",
    maps: "Maps",
    combat: "Combat",
    project: "Project",
    library: "Library",
    other: "Other"
  };
  return labels[surface];
}
