import type { LibraryCatalog, Project } from "../../types";
import { allMonsterScenarioIds } from "../../monsterRecords";
import { isProvidenceMonsterLibraryEntry } from "../../monsterLibrary";
import {
  nextAvailableMonsterRecordId,
  preferredMonsterCopyId,
  scrapbookFacts,
  scrapbookName
} from "./monsterLibraryWorkflow";

export function MonsterLibraryMultiSelection({
  entries,
  project,
  onCopy,
  onClear
}: {
  entries: LibraryCatalog["entities"][number][];
  project: Project;
  onCopy: () => void;
  onClear: () => void;
}) {
  const used = new Set(allMonsterScenarioIds(project));
  const plans = entries.map((entry) => {
    const preferred = preferredMonsterCopyId(project, entry);
    const occupied = preferred > 0 && used.has(preferred);
    const id = preferred > 0 && !occupied
      ? preferred
      : nextAvailableMonsterRecordId([...used].map((candidate) => ({ id: candidate })));
    used.add(id);
    return { entry, id, occupied };
  });
  return (
    <section className="combat-editor monster-multi-selection">
      <header className="combat-editor-header monster-editor-title-header">
        <span className="combat-pane-title">Selected Monsters</span>
        <div className="combat-editor-actions">
          <button type="button" className="btn btn-primary btn-xs" onClick={onCopy}>Copy Selected To Scenario</button>
          <button type="button" className="btn btn-secondary btn-xs" onClick={onClear}>Clear Selection</button>
        </div>
      </header>
      <p className="empty-copy compact">{entries.length} monster library entries selected. Copying uses preferred IDs when empty, then the next open scenario monster slot.</p>
      <div className="monster-selection-list">
        {plans.map(({ entry, id, occupied }) => (
          <div key={entry.id} className="monster-selection-row">
            <span>
              <strong>{scrapbookName(entry)}</strong>
              <small>{isProvidenceMonsterLibraryEntry(entry) ? "Providence Custom Library" : "Protected Built-in Reference"} | {scrapbookFacts(entry)}</small>
            </span>
            <span className={occupied ? "copy-target shifted" : "copy-target"}>
              Monster {id}
              {occupied ? <small>preferred occupied</small> : <small>preferred slot</small>}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
