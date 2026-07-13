import { useEffect, useState } from "react";
import { TutorialTip } from "../components/TutorialTip";
import { LibraryDraftSpec } from "../libraryDrafts";
import { EditorTab, LibraryCatalog, Project, ProjectCommand, RealmzTargetRecordKind, SelectedEntity } from "../types";
import { selectEntityFromId } from "../utils";
import { ScrollArea } from "../ui";
import { renderListKey } from "../renderKeys";
import { EconomyWorkbench } from "./economy/EconomyWorkbench";
import { DomainDetailPanel, entitySubtitle } from "./suite/DomainDetailPanel";
import {
  DomainTargetSwitcher,
  TargetRecordWorkbench,
  readStoredOverviewTargetRecordType,
  selectedTargetRecordTypeFromEntity,
  targetRecordTypeFromEditor,
  targetRecordTypesForEditor,
  writeStoredOverviewTargetRecordType
} from "./suite/TargetRecordWorkbench";
import { DOMAIN_CONFIG, directDetailForSelection, domainHeaderHelp, editorSubtitle, matchingEntries, type DomainListEntry } from "./suite/suiteDomainRouting";

export function SuiteDomainPanel({
  tab,
  activeEditor = "domain",
  project,
  catalog,
  selectedEntity,
  onSelectEntity,
  onSelectEditor,
  onApplyCommand,
  onCreateDraft,
  onUpdateDraft,
  onUpdateLibraryCatalog,
  desktopRuntime = false,
  projectDir = "",
  workspaceDir = ""
}: {
  tab: EditorTab;
  activeEditor?: string;
  project: Project | null;
  catalog: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onSelectEditor?: (editor: string) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  onCreateDraft?: (spec: LibraryDraftSpec) => void;
  onUpdateDraft?: (entityId: string, changes: { label?: string; notes?: string }) => void;
  onUpdateLibraryCatalog?: (catalog: LibraryCatalog, status: string) => void;
  desktopRuntime?: boolean;
  projectDir?: string;
  workspaceDir?: string;
}) {
  void onUpdateLibraryCatalog;
  const config = DOMAIN_CONFIG[tab];
  const economyActive = tab === "economy";
  const focusedEditor = config.editors.find((editor) => editor.id === activeEditor) ?? null;
  const headerEditor = tab === "encounters" || economyActive ? null : focusedEditor;
  const visibleEditors = focusedEditor ? [focusedEditor] : config.editors;
  const libraryEntities = catalog?.entities ?? [];
  const suppressDetailPanel = tab === "encounters" || economyActive;
  const selectedDetail = suppressDetailPanel ? null :
    directDetailForSelection(project, selectedEntity?.id ?? null) ??
    libraryEntities.find((entity) => entity.id === selectedEntity?.id) ??
    (tab === "records" ? [
      ...(project?.semanticSchema?.records ?? []),
      ...(catalog?.records ?? [])
    ].find((record) => record.id === selectedEntity?.id) : null) ??
    null;
  const records = tab === "records" ? [
    ...(project?.semanticSchema?.records?.map((record) => ({ id: record.id, label: record.label, type: record.type, editState: record.editState })) ?? []),
    ...(catalog?.records.map((record) => ({ id: record.id, label: record.label, type: record.type, editState: record.editState })) ?? [])
  ] : [];
  const targetRecordTypes = project ? targetRecordTypesForEditor(tab, activeEditor) : [];
  const focusedTargetEditor = targetRecordTypes.length > 0 && activeEditor !== "domain" && tab !== "encounters";
  const selectedTargetRecordType = selectedTargetRecordTypeFromEntity(selectedEntity?.id ?? "", targetRecordTypes);
  const [overviewTargetRecordType, setOverviewTargetRecordType] = useState<RealmzTargetRecordKind | null>(() => readStoredOverviewTargetRecordType(tab));
  useEffect(() => {
    if (targetRecordTypes.length === 0) return;
    setOverviewTargetRecordType((current) => {
      const stored = readStoredOverviewTargetRecordType(tab);
      const next =
        selectedTargetRecordType ??
        targetRecordTypeFromEditor(tab, activeEditor) ??
        (current && targetRecordTypes.includes(current) ? current : null) ??
        (stored && targetRecordTypes.includes(stored) ? stored : null) ??
        targetRecordTypes[0];
      return current === next ? current : next;
    });
  }, [activeEditor, selectedTargetRecordType, tab, targetRecordTypes.join("|")]);
  useEffect(() => {
    if (!overviewTargetRecordType || !targetRecordTypes.includes(overviewTargetRecordType)) return;
    writeStoredOverviewTargetRecordType(tab, overviewTargetRecordType);
  }, [overviewTargetRecordType, tab, targetRecordTypes]);
  const visibleTargetRecordTypes =
    focusedTargetEditor ? targetRecordTypes :
    overviewTargetRecordType && targetRecordTypes.includes(overviewTargetRecordType) ? [overviewTargetRecordType] :
    targetRecordTypes.slice(0, 1);
  const headerHelp = domainHeaderHelp(tab);
  const headerTitle = headerEditor ? headerEditor.label : config.title;
  const showTargetSwitcher = targetRecordTypes.length > 1 && (tab === "encounters" || !focusedTargetEditor);
  const showOverviewCards = tab !== "records" && tab !== "linter" && !economyActive && !focusedTargetEditor && targetRecordTypes.length === 0;
  return (
    <section className={`domain-workbench${suppressDetailPanel ? " domain-workbench-no-detail" : ""}`}>
      <header className="domain-header">
        <div>
          <h1>
            {headerHelp ? (
              <TutorialTip title={headerTitle} body={headerHelp} side="right">
                <span>{headerTitle}</span>
              </TutorialTip>
            ) : (
              headerTitle
            )}
          </h1>
          <p>{headerEditor ? editorSubtitle(headerEditor) : config.subtitle}</p>
        </div>
        <small>{project ? project.scenario.name : "Library workbench"}</small>
      </header>
      <div className={`domain-main-layout${suppressDetailPanel ? " no-detail" : ""}`}>
        <div className="domain-main-column">
      {economyActive && project && (
        <EconomyWorkbench
          activeEditor={activeEditor}
          project={project}
          catalog={catalog}
          selectedEntity={selectedEntity}
          previewContext={{ desktopRuntime, projectDir, workspaceDir }}
          onSelectEntity={onSelectEntity}
          onApplyCommand={onApplyCommand}
        />
      )}
      {!economyActive && project && targetRecordTypes.length > 0 && (
        <div className="domain-target-stack">
          {showTargetSwitcher && (
            <DomainTargetSwitcher
              project={project}
              recordTypes={targetRecordTypes}
              selectedRecordType={visibleTargetRecordTypes[0] ?? targetRecordTypes[0]}
              onSelectRecordType={setOverviewTargetRecordType}
            />
          )}
          {visibleTargetRecordTypes.map((recordType) => (
            <TargetRecordWorkbench
              key={recordType}
              project={project}
              catalog={catalog}
              recordType={recordType}
              selectedEntity={selectedEntity}
              previewContext={{ desktopRuntime, projectDir, workspaceDir }}
              onSelectEntity={onSelectEntity}
              onSelectEditor={onSelectEditor}
              onSelectRecordType={setOverviewTargetRecordType}
              onApplyCommand={onApplyCommand}
            />
          ))}
        </div>
      )}
      {tab === "records" && (
        <div className="domain-editor-grid">
          <article className="domain-editor-card">
            <header>
              <span>Decoded Records</span>
              <b>{records.length.toLocaleString()}</b>
            </header>
            <ScrollArea className="domain-entity-list" aria-label="Decoded records">
              {includeSelectedEntry(records, selectedEntity?.id ?? null, 240).map((record, index) => (
                <button key={renderListKey("domain-record", record, index)} type="button" onClick={() => onSelectEntity(selectEntityFromId(record.id))}>
                  <strong>{record.label}</strong>
                  <small>{record.type} | {record.editState}</small>
                </button>
              ))}
            </ScrollArea>
          </article>
        </div>
      )}
      {tab === "linter" && (
        <div className="domain-editor-grid">
          <article className="domain-editor-card">
            <header>
              <span>Library Diagnostics</span>
              <b>{catalog?.diagnostics.length ?? 0}</b>
            </header>
            <ScrollArea className="domain-entity-list" aria-label="Library diagnostics">
              {catalog?.diagnostics.slice(0, 240).map((diagnostic, index) => (
                <button key={renderListKey("domain-diagnostic", diagnostic, index)} type="button">
                  <strong>{diagnostic.message}</strong>
                  <small>{diagnostic.severity} | {diagnostic.type}</small>
                </button>
              ))}
            </ScrollArea>
            {!catalog?.diagnostics.length && <p>No library diagnostics.</p>}
          </article>
        </div>
      )}
      <div className="domain-editor-grid">
        {showOverviewCards && visibleEditors.map((editor) => {
          const matches = matchingEntries(editor, project, libraryEntities);
          return (
            <article key={editor.id} className="domain-editor-card">
              <header>
                <span>{editor.label}</span>
                <div className="domain-card-actions">
                  <b>{matches.length.toLocaleString()}</b>
                  {editor.createType && onCreateDraft && (
                    <button
                      type="button"
                      onClick={() => onCreateDraft({ editorId: editor.id, editorLabel: editor.label, entityType: editor.createType ?? editor.entityTypes[0] })}
                    >
                      New
                    </button>
                  )}
                </div>
              </header>
              <EntityRows entities={matches} selectedEntity={selectedEntity} onSelectEntity={onSelectEntity} />
              {matches.length === 0 && <p>No entries yet. Use New to create a Providence draft where available, or import/open source data.</p>}
            </article>
          );
        })}
      </div>
        </div>
        {!suppressDetailPanel && <DomainDetailPanel detail={selectedDetail} catalog={catalog} onUpdateDraft={onUpdateDraft} />}
      </div>
    </section>
  );
}

function EntityRows({
  entities,
  selectedEntity,
  onSelectEntity
}: {
  entities: DomainListEntry[];
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const visible = includeSelectedEntry(entities, selectedEntity?.id ?? null, 80);
  return (
    <ScrollArea className="domain-entity-list" aria-label="Domain entities">
      {visible.map((entity, index) => {
        const selected = selectedEntity?.id === entity.id;
        return (
          <button
            key={`domain-entity:${entity.id}:${index}`}
            className={selected ? "selected" : ""}
            type="button"
            onClick={() => onSelectEntity(selectEntityFromId(entity.id))}
          >
            <strong>{entity.label}</strong>
            <small>{entitySubtitle(entity)}</small>
          </button>
        );
      })}
      {entities.length > visible.length && (
        <p className="domain-list-limit">{entities.length - visible.length} more entr{entities.length - visible.length === 1 ? "y" : "ies"}; open the focused editor or search to narrow.</p>
      )}
    </ScrollArea>
  );
}

function includeSelectedEntry<T extends { id: string }>(entries: T[], selectedId: string | null, limit: number) {
  const visible = entries.slice(0, limit);
  if (!selectedId || visible.some((entry) => entry.id === selectedId)) return visible;
  const selected = entries.find((entry) => entry.id === selectedId);
  return selected ? [selected, ...visible] : visible;
}
