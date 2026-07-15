import type { RefObject } from "react";
import { TutorialTip } from "../../components/TutorialTip";
import type { ScriptDiagnostic } from "../../scriptValidation";
import type { Project, ScriptInventoryFilter, TriggerRecord } from "../../types";
import { ScrollArea, SearchField } from "../../ui";
import { ScriptListItem } from "./scriptInventory";

const INVENTORY_FILTER_HELP =
  "Use Current Map while authoring one area, Active for non-empty records, Reusable for cleared fixed slots, Warnings before release, and All when tracing links across the scenario.";

export function ActionPointInventory({
  project,
  scripts,
  filteredScripts,
  visibleScripts,
  selectedTrigger,
  selectedButtonRef,
  scriptQuery,
  inventoryFilter,
  visibleInventoryFilters,
  inventoryCounts,
  canScopeToMap,
  extraActionEvidenceFilterActive,
  warningScanReady,
  hiddenScriptCount,
  diagnosticsById,
  onSetScriptQuery,
  onSetInventoryFilter,
  onSelectTrigger,
  onShowMore
}: {
  project: Project;
  scripts: TriggerRecord[];
  filteredScripts: TriggerRecord[];
  visibleScripts: TriggerRecord[];
  selectedTrigger: TriggerRecord | null;
  selectedButtonRef: RefObject<HTMLButtonElement>;
  scriptQuery: string;
  inventoryFilter: ScriptInventoryFilter;
  visibleInventoryFilters: Array<{ id: ScriptInventoryFilter; label: string }>;
  inventoryCounts: Map<ScriptInventoryFilter, number | null>;
  canScopeToMap: boolean;
  extraActionEvidenceFilterActive: boolean;
  warningScanReady: boolean;
  hiddenScriptCount: number;
  diagnosticsById: Map<string, ScriptDiagnostic[]>;
  onSetScriptQuery: (query: string) => void;
  onSetInventoryFilter: (filter: ScriptInventoryFilter) => void;
  onSelectTrigger: (trigger: TriggerRecord) => void;
  onShowMore: () => void;
}) {
  return (
    <div className="script-list-column">
      <div className="script-list-tools">
        <SearchField
          className="script-inventory-search"
          value={scriptQuery}
          onChange={onSetScriptQuery}
          placeholder="Search action points..."
          ariaLabel="Search action points"
          resultCount={filteredScripts.length}
          resultNoun="action point"
          status={`${scripts.length.toLocaleString()} total`}
        />
        <small className="script-capacity-note">
          <TutorialTip title="Inventory Filters" body={INVENTORY_FILTER_HELP} side="below">
            <span>Choose the inventory slice before editing or release-checking scripts.</span>
          </TutorialTip>
        </small>
        <div className="script-list-scope script-filter-chips" role="group" aria-label="Script inventory filter">
          {visibleInventoryFilters.map((filter) => (
            <button key={filter.id} type="button" className={inventoryFilter === filter.id ? "active" : ""} disabled={filter.id === "current-map" && !canScopeToMap} onClick={() => onSetInventoryFilter(filter.id)}>
              <span>{filter.label}</span><b>{inventoryCounts.get(filter.id) == null ? "—" : inventoryCounts.get(filter.id)}</b>
            </button>
          ))}
        </div>
        {extraActionEvidenceFilterActive && (
          <div className="script-tab-note">
            <strong>{(inventoryCounts.get(inventoryFilter) ?? 0).toLocaleString()} Extra Action Point row(s) in this filter</strong>
            <small>These rows are preserved with the scenario. The unlinked and evidence filters separate imported reusable script rows without source-backed callers from callable Extra Action Points.</small>
          </div>
        )}
      </div>
      <ScrollArea className="realmz-script-list" aria-label="Action Points and Extra Action Points">
        {visibleScripts.map((trigger) => (
          <ScriptListItem
            key={trigger.id}
            project={project}
            trigger={trigger}
            selected={trigger.id === selectedTrigger?.id}
            buttonRef={trigger.id === selectedTrigger?.id ? selectedButtonRef : undefined}
            issues={diagnosticsById.get(trigger.id) ?? []}
            onSelectTrigger={onSelectTrigger}
          />
        ))}
        {filteredScripts.length === 0 && <div className="script-list-empty">{inventoryFilter === "warnings" && !warningScanReady ? "Scanning warnings..." : "No scripts match this view."}</div>}
        {hiddenScriptCount > 0 && (
          <button className="script-list-more-button" type="button" onClick={onShowMore}>Show {Math.min(180, hiddenScriptCount).toLocaleString()} more</button>
        )}
      </ScrollArea>
    </div>
  );
}
