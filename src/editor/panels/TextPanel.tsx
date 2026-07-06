import { Bold, ChevronLeft, ChevronRight, Copy, Eraser, FileText, Italic, List, MessageSquarePlus, Trash2, Underline, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LibraryCatalog, MessageRecord, OptionLabelRecord, Project, ProjectCommand, SelectedEntity } from "../types";
import { selectEntityFromId } from "../utils";
import { classicTextByteLength, messageUsageLinks, optionLabelUsageLinks, unsupportedClassicTextChars } from "../contentLinks";
import { TutorialTip } from "../components/TutorialTip";
import { filterTargetOptions, signedSoundValueForSelection, signedSoundWaitsForCompletion, soundReferenceOptionForQuery, targetOptionForOpcodeValue, targetOptionsForOpcode, type ScriptTargetOption } from "../components/RealmzTargetPicker";
import {
  CLASSIC_STYLE_EXTRA_FACE_MASK,
  CLASSIC_STYLE_FACE_BITS,
  DEFAULT_CLASSIC_STYLE_RUN,
  REALMZ_GAMEPLAY_TEXT_VIEW_WIDTH,
  StyledScrollingTextPreview,
  classicRgbToCssHex,
  classicStyleBytesFromRuns,
  cssHexToClassicRgb,
  parseClassicStyleRuns,
  u16FromBytes
} from "../components/StyledTextPreview";
import {
  CLASSIC_AUTHOR_FONT_OPTIONS,
  addStyleRunDraft,
  applyAuthorStyleToSelection,
  classicStyleRunsFromDrafts,
  isCssHexColor,
  removeStyleRunDraft,
  selectedTextRange,
  styleRunDraftsFromRuns,
  styleRunDraftAtOffset,
  styleRunRangeSummary,
  styleRunRangeTitle,
  textSelectionRangeFromTextArea,
  textSelectionTitle,
  updateStyleRunDraft,
  type AuthorStyleDraft,
  type ClassicStyleRunDraft,
  type TextSelectionRange
} from "../textStyleAuthoring";
import {
  classicTextBytesFromDisplayString,
  decodeClassicTextPreviewBytes,
  decodeClassicTextPreviewString,
  displayRangeToRawRange
} from "../classicTextPreview";
import { playPreviewUrl, useResolvedPreviewUrl, type PreviewRuntimeContext } from "../previewUrls";

const DIVINITY_TEXT_SEPARATOR = `${" ".repeat(20)}\uf8ff${" ".repeat(20)}`;
type TextAuthoringTab = "strings" | "option-labels" | "scrolling-text";
const TEXT_WORKBENCH_HELP = "Text authors the central Data SD2 message pool, Data OD two-choice option labels, and readable TEXT/STR#/styl reference resources. Other tools link back here through numeric message and option-label IDs.";
const EXPORT_TEXT_HELP = "Export Text writes all Data SD2 strings with Divinity-style separators so the file can be spell-checked without changing the project.";
const IMPORT_TEXT_HELP = "Import Text accepts a file from this export workflow and refuses imports with the wrong number of string segments to avoid shifting every string ID.";
const REFERENCE_STRINGS_HELP = "Reference Strings shows readable TEXT, STR#, and style resources from project or library resource forks. These are searchable evidence, not the central Data SD2 message pool.";
const STRINGS_TAB_HELP = "Strings edits Data SD2 message records: Realmz text boxes used by scripts, battles, encounters, random areas, notes, and many prompts.";
const OPTION_LABELS_TAB_HELP = "Option Labels edits Data OD compact labels for two-choice dialogs. Realmz uses the first visible character as the keyboard shortcut.";
const SCROLLING_TEXT_TAB_HELP = "Scrolling Text authors scenario TEXT resources used by the Display Scrolling Text action. These are separate from ordinary Data SD2 strings; styl companions are preserved as resource data, but current Windows testing ignores their formatting and Mac 7.1.2 runtime behavior is suspect.";
const FIND_OCCURRENCE_HELP = "Find Occurrence searches every scenario string by ID or text, then jumps through matching Data SD2 records.";
const FIND_LONG_STRING_HELP = "Find Long String jumps to strings at the Realmz byte limit or with characters that need cleanup before export.";
const STRING_BYTE_LIMIT_HELP = "Realmz message records are fixed 256-byte Pascal strings, so the editable text must fit in 255 Classic text bytes before export.";
const STRING_SOUND_HELP = "Choose the sound Divinity stores with this string. The assignment lives in scenario support data while visible text stays in Data SD2. Negative sound values are preserved for compatibility, but string playback wait behavior is not yet proven.";
const OPTION_BYTE_LIMIT_HELP = "Data OD option labels use 25-byte Pascal slots, leaving 24 bytes of editable label text.";
const USED_BY_HELP = "Used By links show the records Providence knows refer to this text. Check these before changing wording or meaning.";
const ADVANCED_TEXT_HELP = "Advanced Details shows source status and preserved raw bytes for the current fixed-width text record.";

export function TextPanel({
  project,
  catalog,
  selectedEntity,
  activeEditor = "messages",
  desktopRuntime = false,
  projectDir = "",
  workspaceDir = "",
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  activeEditor?: string;
  desktopRuntime?: boolean;
  projectDir?: string;
  workspaceDir?: string;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const [query, setQuery] = useState("");
  const [findQuery, setFindQuery] = useState("");
  const [findCursor, setFindCursor] = useState(0);
  const [resourceQuery, setResourceQuery] = useState("");
  const [textFileStatus, setTextFileStatus] = useState<{ kind: "ok" | "warning"; text: string } | null>(null);
  const [showList, setShowList] = useState(activeEditor === "messages" || activeEditor === "domain");
  const [showReferences, setShowReferences] = useState(activeEditor === "text-resources" || activeEditor === "spell-check");
  const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TextAuthoringTab>(() => activeEditor === "option-labels" ? "option-labels" : activeEditor === "text-resources" ? "scrolling-text" : "strings");
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null);
  const [selectedScrollingTextAssetId, setSelectedScrollingTextAssetId] = useState<string | null>(null);
  const [messageListLimit, setMessageListLimit] = useState(320);
  const [optionListLimit, setOptionListLimit] = useState(320);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const records = useMemo(() => [...(project.messages ?? [])].sort((a, b) => a.id - b.id), [project.messages]);
  const optionRecords = useMemo(() => [...(project.optionLabels ?? [])].sort((a, b) => a.id - b.id), [project.optionLabels]);
  const scrollingTextAssets = useMemo(() => scrollingTextProjectAssets(project), [project]);
  const importedScrollingTextResources = useMemo(() => importedScrollingTextResourceRows(project, scrollingTextAssets), [project, scrollingTextAssets]);
  const selectedId = selectedMessageId(selectedEntity, records) ?? records[0]?.id ?? 0;
  const selectedRecord = records.find((record) => record.id === selectedId) ?? null;
  const effectiveOptionId = selectedOptionId ?? optionRecords[0]?.id ?? 0;
  const selectedOption = optionRecords.find((record) => record.id === effectiveOptionId) ?? null;
  const selectedScrollingTextAsset = scrollingTextAssets.find((asset) => asset.id === selectedScrollingTextAssetId)
    ?? selectedScrollingTextAssetFromEntity(scrollingTextAssets, selectedEntity)
    ?? scrollingTextAssets[0]
    ?? null;
  const nextScrollingTextId = nextScrollingTextResourceId(project);
  const selectOptionLabel = (id: number) => {
    setSelectedOptionId(id);
    onSelectEntity(selectEntityFromId(`option-label:${id}`));
  };
  const filteredRecords = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return records;
    return records.filter((record) => `${record.id} ${record.text}`.toLowerCase().includes(normalized));
  }, [query, records]);
  const visibleMessageRecords = useMemo(
    () => includeSelectedRecord(filteredRecords, selectedId, messageListLimit),
    [filteredRecords, messageListLimit, selectedId]
  );
  const usageCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const record of records) counts.set(record.id, messageUsageLinks(project, record.id).length);
    return counts;
  }, [project, records]);
  const findMatches = useMemo(() => {
    const normalized = findQuery.trim().toLowerCase();
    if (!normalized) return [];
    return records
      .filter((record) => `${record.id} ${record.text}`.toLowerCase().includes(normalized))
      .map((record) => record.id);
  }, [findQuery, records]);
  const reviewStringIds = useMemo(() => records.filter(isStringReviewCandidate).map((record) => record.id), [records]);
  const nextId = nextMessageId(records);
  const referencePanelRequested = showReferences || selectedReferenceId != null;
  const resourceRows = useMemo(() => referencePanelRequested ? textReferenceRows(project, catalog, resourceQuery) : [], [catalog, project, referencePanelRequested, resourceQuery]);
  const selectedReference = selectedReferenceId ? resourceRows.find((row) => row.id === selectedReferenceId) ?? null : null;
  const referencePanelOpen = referencePanelRequested;
  const handleTextFileImport = async (file: File | null) => {
    if (!file) return;
    const content = await file.text();
    const parts = content.split(DIVINITY_TEXT_SEPARATOR);
    if (parts.length !== records.length) {
      setTextFileStatus({
        kind: "warning",
        text: `Import found ${parts.length.toLocaleString()} string segment${parts.length === 1 ? "" : "s"}, but this project has ${records.length.toLocaleString()} strings. Nothing was changed.`
      });
      return;
    }
    const updates = records.map((record, index) => ({ id: record.id, text: normalizeImportedString(parts[index] ?? "") }));
    onApplyCommand({ kind: "bulkUpdateMessageRecords", label: `Import ${updates.length} strings`, updates });
    setTextFileStatus({ kind: "ok", text: `Imported ${updates.length.toLocaleString()} strings from ${file.name}. Review any maximum-length strings before export.` });
  };

  useEffect(() => {
    if (activeTab === "strings" && !selectedRecord && records.length > 0) {
      onSelectEntity(selectEntityFromId(`message:${records[0].id}`));
    }
  }, [activeTab, onSelectEntity, records, selectedRecord]);

  useEffect(() => {
    if (activeEditor === "text-resources") {
      setActiveTab("scrolling-text");
      setShowReferences(true);
    }
    if (activeEditor === "spell-check") {
      setShowReferences(true);
    }
    if (activeEditor === "messages" || activeEditor === "domain") {
      setShowList(true);
      setActiveTab("strings");
    }
    if (activeEditor === "option-labels") {
      setActiveTab("option-labels");
    }
  }, [activeEditor]);

  useEffect(() => {
    if (selectedOptionId == null && optionRecords.length > 0) {
      setSelectedOptionId(optionRecords[0].id);
    }
  }, [optionRecords, selectedOptionId]);

  useEffect(() => {
    const optionId = selectedOptionLabelId(selectedEntity);
    if (optionId == null) return;
    setActiveTab("option-labels");
    setSelectedOptionId(optionId);
  }, [selectedEntity]);

  useEffect(() => {
    if (!selectedEntity?.id) return;
    const asset = selectedScrollingTextAssetFromEntity(scrollingTextAssets, selectedEntity);
    if (!asset) return;
    setActiveTab("scrolling-text");
    setSelectedScrollingTextAssetId(asset.id);
  }, [scrollingTextAssets, selectedEntity]);

  useEffect(() => {
    if (!selectedEntity?.id) return;
    if (!importedScrollingTextResources.some((resource) => resource.entityId === selectedEntity.id)) return;
    setActiveTab("scrolling-text");
  }, [importedScrollingTextResources, selectedEntity]);

  useEffect(() => {
    setMessageListLimit(320);
  }, [query]);

  return (
    <section className="text-workbench">
      <header className="text-workbench-header">
        <div>
          <h1>
            <TutorialTip title="String Editor" body={TEXT_WORKBENCH_HELP} side="below">
              <span>String Editor</span>
            </TutorialTip>
          </h1>
          <p>Edit scenario strings and two-choice option labels used by Realmz dialogs.</p>
        </div>
        <div className="text-workbench-actions">
          <b>{records.length.toLocaleString()} strings | {optionRecords.length.toLocaleString()} option labels | {(scrollingTextAssets.length + importedScrollingTextResources.length).toLocaleString()} scrolling text</b>
          <input
            ref={importInputRef}
            type="file"
            accept=".txt,text/plain"
            className="sr-only-file"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              void handleTextFileImport(file);
              event.currentTarget.value = "";
            }}
          />
          <TutorialTip title="Export Text" body={EXPORT_TEXT_HELP} side="below">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => exportDivinityTextFile(records)}
              title="Export all strings as a plain text spell-check file with Divinity-style separators."
            >
              Export Text
            </button>
          </TutorialTip>
          <TutorialTip title="Import Text" body={IMPORT_TEXT_HELP} side="below">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => importInputRef.current?.click()}
              title="Import a plain text file previously exported from this Strings editor."
            >
              Import Text
            </button>
          </TutorialTip>
          <TutorialTip title="Reference Strings" body={REFERENCE_STRINGS_HELP} side="below">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowReferences((value) => !value)}
              title="Show or hide readable TEXT, STR#, and style string resources."
            >
              <List size={14} /> {referencePanelOpen ? "Hide References" : "Reference Strings"}
            </button>
          </TutorialTip>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              onApplyCommand({ kind: "createTargetRecord", label: `Create String ${nextId}`, recordType: "message", id: nextId });
              onSelectEntity(selectEntityFromId(`message:${nextId}`));
            }}
          >
            <MessageSquarePlus size={14} /> New String {nextId}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              const asset = scrollingTextAssetFromDraft(null, nextScrollingTextId, `Scrolling Text ${nextScrollingTextId}`, "");
              onApplyCommand({ kind: "attachProjectAsset", label: `Create Scrolling Text ${nextScrollingTextId}`, asset });
              setActiveTab("scrolling-text");
              setSelectedScrollingTextAssetId(asset.id);
              onSelectEntity(selectEntityFromId(asset.id));
            }}
          >
            <FileText size={14} /> New Scrolling Text {nextScrollingTextId}
          </button>
        </div>
      </header>
      <div className="text-authoring-tabs" role="tablist" aria-label="String editors">
        <TutorialTip title="Strings" body={STRINGS_TAB_HELP} side="below">
          <button type="button" className={activeTab === "strings" ? "active" : ""} role="tab" aria-selected={activeTab === "strings"} onClick={() => setActiveTab("strings")}>
            Strings
          </button>
        </TutorialTip>
        <TutorialTip title="Option Labels" body={OPTION_LABELS_TAB_HELP} side="below">
          <button type="button" className={activeTab === "option-labels" ? "active" : ""} role="tab" aria-selected={activeTab === "option-labels"} onClick={() => setActiveTab("option-labels")}>
            Option Labels
          </button>
        </TutorialTip>
        <TutorialTip title="Scrolling Text" body={SCROLLING_TEXT_TAB_HELP} side="below">
          <button type="button" className={activeTab === "scrolling-text" ? "active" : ""} role="tab" aria-selected={activeTab === "scrolling-text"} onClick={() => setActiveTab("scrolling-text")}>
            Scrolling Text
          </button>
        </TutorialTip>
      </div>
      {activeTab === "strings" && (
        <StringNavigator
          records={records}
          selectedId={selectedId}
          findQuery={findQuery}
          findCount={findMatches.length}
          showList={showList}
          onToggleList={() => setShowList((value) => !value)}
          onSelect={(id) => onSelectEntity(selectEntityFromId(`message:${id}`))}
          onFindQueryChange={(value) => {
            setFindQuery(value);
            setFindCursor(0);
          }}
          onFindFirst={() => {
            const first = findMatches[0];
            if (first != null) {
              setFindCursor(0);
              onSelectEntity(selectEntityFromId(`message:${first}`));
            }
          }}
          onFindNext={() => {
            if (!findMatches.length) return;
            const currentIndex = findMatches.indexOf(selectedId);
            const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % findMatches.length : findCursor % findMatches.length;
            setFindCursor(nextIndex);
            onSelectEntity(selectEntityFromId(`message:${findMatches[nextIndex]}`));
          }}
          reviewCount={reviewStringIds.length}
          onFindNextReview={() => {
            const nextReviewId = nextReviewStringId(reviewStringIds, selectedId);
            if (nextReviewId != null) onSelectEntity(selectEntityFromId(`message:${nextReviewId}`));
          }}
        />
      )}
      {textFileStatus && (
        <div className={`text-file-status ${textFileStatus.kind}`}>
          {textFileStatus.text}
        </div>
      )}
      {activeTab === "strings" ? <div className="text-workbench-layout">
        {showList && <aside className="text-message-list-panel">
          <div className="text-search-row">
            <span>{filteredRecords.length.toLocaleString()} shown</span>
            <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search strings..." />
          </div>
          <div className="text-message-list" role="list" aria-label="Scenario strings">
            {visibleMessageRecords.map((record) => {
              const selected = record.id === selectedId;
              const usageCount = usageCounts.get(record.id) ?? 0;
              const byteLength = classicTextByteLength(record.text);
              return (
                <button
                  key={record.id}
                  type="button"
                  className={selected ? "selected" : ""}
                  onClick={() => onSelectEntity(selectEntityFromId(`message:${record.id}`))}
                >
                  <strong>String {record.id}</strong>
                  <span>{record.text || "Empty string"}</span>
                  <small>{usageCount} use{usageCount === 1 ? "" : "s"} | {byteLength}/255 bytes</small>
                </button>
              );
            })}
            {filteredRecords.length > messageListLimit && (
              <button type="button" className="text-list-more" onClick={() => setMessageListLimit((value) => value + 320)}>
                Show {Math.min(320, Math.max(0, filteredRecords.length - messageListLimit)).toLocaleString()} more
              </button>
            )}
            {filteredRecords.length === 0 && <p>No strings match this search.</p>}
          </div>
        </aside>}
        <main className="text-editor-surface">
          {selectedRecord ? (
            <MessageEditor
              key={selectedRecord.id}
              project={project}
              catalog={catalog}
              record={selectedRecord}
              records={records}
              previewContext={{ desktopRuntime, projectDir, workspaceDir }}
              onSelectEntity={onSelectEntity}
              onApplyCommand={onApplyCommand}
            />
          ) : (
            <div className="empty-copy">Create a string to begin authoring text.</div>
          )}
          {referencePanelOpen && (
            <section className="text-reference-panel">
              <header>
                <div>
                  <h2>
                    <TutorialTip title="Reference Strings" body={REFERENCE_STRINGS_HELP} side="below">
                      <span>Reference Strings</span>
                    </TutorialTip>
                  </h2>
                  <p>Readable TEXT, STR#, and style resources are searchable reference material.</p>
                </div>
                <div className="text-reference-actions">
                  <input value={resourceQuery} onChange={(event) => setResourceQuery(event.currentTarget.value)} placeholder="Search TEXT / STR#..." />
                  <button type="button" className="btn btn-secondary btn-xs" onClick={() => {
                    setSelectedReferenceId(null);
                    setShowReferences(false);
                  }}>
                    Hide
                  </button>
                </div>
              </header>
              {selectedReference ? (
                <TextReferenceDetail row={selectedReference} onBack={() => setSelectedReferenceId(null)} onInspect={() => onSelectEntity(selectEntityFromId(selectedReference.id))} />
              ) : (
                <div className="text-reference-grid">
                  {resourceRows.slice(0, 120).map((row) => (
                    <button key={row.id} type="button" onClick={() => setSelectedReferenceId(row.id)}>
                      <strong>{row.label}</strong>
                      <span>{row.detail}</span>
                      <small>{row.source}</small>
                    </button>
                  ))}
                  {resourceRows.length === 0 && <p>No readable strings match this search.</p>}
                </div>
              )}
            </section>
          )}
        </main>
      </div> : activeTab === "option-labels" ? (
        <OptionLabelsWorkbench
          project={project}
          records={optionRecords}
          selectedId={effectiveOptionId}
          selectedRecord={selectedOption}
          listLimit={optionListLimit}
          onSelect={selectOptionLabel}
          onShowMore={() => setOptionListLimit((value) => value + 320)}
          onResetListLimit={() => setOptionListLimit(320)}
          onSelectEntity={onSelectEntity}
          onApplyCommand={onApplyCommand}
        />
      ) : (
        <ScrollingTextWorkbench
          project={project}
          assets={scrollingTextAssets}
          importedResources={importedScrollingTextResources}
          selectedEntity={selectedEntity}
          selectedAsset={selectedScrollingTextAsset}
          nextResourceId={nextScrollingTextId}
          onSelect={(asset) => {
            setSelectedScrollingTextAssetId(asset.id);
            onSelectEntity(selectEntityFromId(asset.id));
          }}
          onSelectEntity={onSelectEntity}
          onApplyCommand={onApplyCommand}
        />
      )}
    </section>
  );
}

function StringNavigator({
  records,
  selectedId,
  findQuery,
  findCount,
  showList,
  onToggleList,
  onSelect,
  onFindQueryChange,
  onFindFirst,
  onFindNext,
  reviewCount,
  onFindNextReview
}: {
  records: MessageRecord[];
  selectedId: number;
  findQuery: string;
  findCount: number;
  showList: boolean;
  onToggleList: () => void;
  onSelect: (id: number) => void;
  onFindQueryChange: (value: string) => void;
  onFindFirst: () => void;
  onFindNext: () => void;
  reviewCount: number;
  onFindNextReview: () => void;
}) {
  const selectedIndex = Math.max(0, records.findIndex((record) => record.id === selectedId));
  const previous = records[Math.max(0, selectedIndex - 1)] ?? null;
  const next = records[Math.min(records.length - 1, selectedIndex + 1)] ?? null;
  return (
    <nav className="text-string-navigator" aria-label="String navigator">
      <button type="button" className="btn btn-secondary btn-sm icon-only" disabled={!previous || previous.id === selectedId} onClick={() => previous && onSelect(previous.id)} title="Previous string">
        <ChevronLeft size={15} />
      </button>
      <button type="button" className="btn btn-secondary btn-sm icon-only" disabled={!next || next.id === selectedId} onClick={() => next && onSelect(next.id)} title="Next string">
        <ChevronRight size={15} />
      </button>
      <RecordJumpField label="Go To String" selectedId={selectedId} records={records} onSelect={onSelect} />
      <button type="button" className="btn btn-secondary btn-sm" onClick={onToggleList}>
        <List size={14} /> {showList ? "Hide Search List" : "Show Search List"}
      </button>
      <label className="text-find-field">
        <TutorialTip title="Find Occurrence" body={FIND_OCCURRENCE_HELP} side="below">
          <span>Find Occurrence</span>
        </TutorialTip>
        <input value={findQuery} onChange={(event) => onFindQueryChange(event.currentTarget.value)} placeholder="Search all strings..." />
      </label>
      <button type="button" className="btn btn-secondary btn-sm" disabled={!findCount} onClick={onFindFirst}>
        Find First
      </button>
      <button type="button" className="btn btn-secondary btn-sm" disabled={!findCount} onClick={onFindNext}>
        Find Next {findCount ? `(${findCount})` : ""}
      </button>
      <TutorialTip title="Find Long String" body={FIND_LONG_STRING_HELP} side="below">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!reviewCount}
          onClick={onFindNextReview}
          title="Find the next string at the Realmz length limit or with characters that need cleanup before export."
        >
          Find Long String {reviewCount ? `(${reviewCount})` : ""}
        </button>
      </TutorialTip>
    </nav>
  );
}

function RecordJumpField({
  label,
  selectedId,
  records,
  onSelect
}: {
  label: string;
  selectedId: number;
  records: Array<{ id: number }>;
  onSelect: (id: number) => void;
}) {
  const [draft, setDraft] = useState(String(selectedId));
  const validIds = useMemo(() => new Set(records.map((record) => record.id)), [records]);
  useEffect(() => {
    setDraft(String(selectedId));
  }, [selectedId]);
  const commit = () => {
    const id = Number(draft);
    if (Number.isInteger(id) && validIds.has(id)) onSelect(id);
  };
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
    </label>
  );
}

function MessageEditor({
  project,
  catalog,
  record,
  records,
  previewContext,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  record: MessageRecord;
  records: MessageRecord[];
  previewContext: PreviewRuntimeContext;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const [text, setText] = useState(record.text);
  const [soundQuery, setSoundQuery] = useState("");
  const byteLength = classicTextByteLength(text);
  const unsupportedChars = unsupportedClassicTextChars(text);
  const changed = text !== record.text;
  const usages = messageUsageLinks(project, record.id);
  const nextId = nextMessageId(records);
  const currentSoundId = stringSoundForMessage(project, record.id);
  const soundOptions = useMemo(() => targetOptionsForOpcode(project, 9, catalog), [catalog, project]);
  const selectedSound = useMemo(() => currentSoundId ? targetOptionForOpcodeValue(project, 9, currentSoundId, catalog) : null, [catalog, currentSoundId, project]);
  const filteredSoundOptions = useMemo(() => {
    const matches = filterTargetOptions(soundOptions, soundQuery);
    const typed = soundReferenceOptionForQuery(9, soundQuery);
    return typed && !matches.some((option) => option.value === typed.value)
      ? [typed, ...matches].slice(0, 160)
      : matches.slice(0, 160);
  }, [soundOptions, soundQuery]);
  const visibleSoundOptions = selectedSound && !filteredSoundOptions.some((option) => option.key === selectedSound.key)
    ? [selectedSound, ...filteredSoundOptions.slice(0, 159)]
    : filteredSoundOptions;
  const selectedPreviewUrl = useStringSoundPreviewUrl(selectedSound, currentSoundId, project, previewContext);
  const updateSound = (soundId: number) => onApplyCommand({ kind: "updateStringSound", label: `Set String ${record.id} sound`, messageId: record.id, soundId });
  const updateSoundSelection = (soundId: number) => updateSound(signedSoundValueForSelection(soundId, signedSoundWaitsForCompletion(currentSoundId)));
  const updateSoundSign = (negativeReference: boolean) => updateSound(signedSoundValueForSelection(currentSoundId, negativeReference));
  return (
    <article className="text-message-editor">
      <header>
        <div>
          <span>String {record.id}</span>
          <small>{usages.length} use{usages.length === 1 ? "" : "s"} across this scenario</small>
        </div>
        <div className="text-message-actions">
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => {
              onApplyCommand({ kind: "duplicateMessageRecord", label: `Duplicate String ${record.id}`, fromId: record.id, toId: nextId });
              onSelectEntity(selectEntityFromId(`message:${nextId}`));
            }}
          >
            <Copy size={12} /> Duplicate
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => {
              setText("");
              onApplyCommand({ kind: "deleteTargetRecord", label: `Clear String ${record.id}`, recordType: "message", id: record.id });
            }}
          >
            <Eraser size={12} /> Clear
          </button>
          <button
            type="button"
            className="btn btn-primary btn-xs"
            disabled={!changed || byteLength > 255}
            onClick={() => onApplyCommand({ kind: "updateMessageRecord", label: `Update String ${record.id}`, id: record.id, changes: { text } })}
          >
            Apply String
          </button>
        </div>
      </header>
      <label className="text-message-field">
        <span>Text</span>
        <textarea value={text} onChange={(event) => setText(event.currentTarget.value)} />
      </label>
      <div className={`text-message-status ${byteLength > 255 || unsupportedChars.length ? "warning" : "ok"}`}>
        <TutorialTip title="String Byte Limit" body={STRING_BYTE_LIMIT_HELP} side="below">
          <span>{byteLength}/255 bytes before export</span>
        </TutorialTip>
        {byteLength > 255 && <b>Too long for a Realmz message record.</b>}
        {unsupportedChars.length > 0 && <b>{unsupportedChars.length} non-ASCII character{unsupportedChars.length === 1 ? "" : "s"} will export as ?.</b>}
        {!changed && byteLength <= 255 && unsupportedChars.length === 0 && <b>Ready</b>}
      </div>
      <section className="text-string-sound-panel">
        <header>
          <div>
            <TutorialTip title="String Sound" body={STRING_SOUND_HELP} side="below">
              <span>Sound</span>
            </TutorialTip>
            <small>{currentSoundId ? soundSummaryLabel(selectedSound, currentSoundId) : "No sound"}</small>
          </div>
          <div className="text-string-sound-actions">
            {selectedSound?.entity && (
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => selectedSound.entity && onSelectEntity(selectedSound.entity)}>
                Open Sound
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              disabled={!selectedPreviewUrl}
              title={selectedPreviewUrl ? "Play this sound preview." : "No preview is available for this sound reference."}
              onClick={() => selectedPreviewUrl && playPreviewUrl(selectedPreviewUrl)}
            >
              <Volume2 size={12} /> Play
            </button>
            <button type="button" className="btn btn-secondary btn-xs" disabled={!currentSoundId} onClick={() => updateSound(0)}>
              Clear
            </button>
          </div>
        </header>
        <label>
          <span>Choose sound</span>
          <input value={soundQuery} onChange={(event) => setSoundQuery(event.currentTarget.value)} placeholder="Search sounds..." />
          <select
            value={currentSoundId ? String(Math.abs(currentSoundId)) : ""}
            onChange={(event) => updateSoundSelection(Number(event.currentTarget.value || 0))}
          >
            <option value="">No sound</option>
            {currentSoundId && !selectedSound && <option value={Math.abs(currentSoundId)}>Current sound {currentSoundId}</option>}
            {visibleSoundOptions.map((option) => (
              <option key={option.key} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="text-string-sound-wait">
          <input
            type="checkbox"
            checked={signedSoundWaitsForCompletion(currentSoundId)}
            disabled={!currentSoundId}
            onChange={(event) => updateSoundSign(event.currentTarget.checked)}
          />
          <span>Store as negative sound ID</span>
        </label>
        <small>
          {selectedSound
            ? [selectedSound.detail, selectedSound.summary, signedSoundWaitsForCompletion(currentSoundId) ? "Negative sound reference" : "", selectedSound.compatibility, selectedSound.sourceState].filter(Boolean).join(" | ")
            : currentSoundId
              ? `Sound ${currentSoundId}`
              : "Choose a sound resource for this string."}
        </small>
      </section>
      <section className="text-used-by-panel">
        <header>
          <TutorialTip title="Used By" body={USED_BY_HELP} side="below">
            <span>Used By</span>
          </TutorialTip>
        </header>
        <div>
          {usages.map((usage) => (
            <button key={usage.key} type="button" onClick={() => usage.entity && onSelectEntity(usage.entity)}>
              <strong>{usage.label}</strong>
              <small>{usage.detail}</small>
            </button>
          ))}
          {usages.length === 0 && <p>No known references yet.</p>}
        </div>
      </section>
      <details className="advanced-details">
        <summary>
          <TutorialTip title="Advanced Details" body={ADVANCED_TEXT_HELP} side="below">
            <span>Advanced Details</span>
          </TutorialTip>
        </summary>
        <div className="summary-table">
          <div><dt>Record</dt><dd>Scenario string #{record.id}</dd></div>
          <div><dt>State</dt><dd>{record.authored ? "Editable project string" : "Imported string"}</dd></div>
          <div><dt>Bytes</dt><dd>{record.rawBytes?.length ?? 0} preserved bytes</dd></div>
        </div>
      </details>
    </article>
  );
}

function stringSoundForMessage(project: Project, messageId: number) {
  const supportFile = project.scenario.supportFile;
  if (!supportFile || supportFile.divinityStringEditorSlot !== messageId) return 0;
  return supportFile.divinityStringSoundId ?? 0;
}

function soundSummaryLabel(option: ScriptTargetOption | null, soundId: number) {
  if (!soundId) return "No sound";
  if (!option) return `Sound ${soundId}`;
  return signedSoundWaitsForCompletion(soundId) ? `${option.label} · negative` : option.label;
}

function useStringSoundPreviewUrl(option: ScriptTargetOption | null, soundId: number, project: Project, previewContext: PreviewRuntimeContext) {
  const previewResourceId = soundId ? Math.abs(soundId) : option?.value ?? null;
  return useResolvedPreviewUrl(
    option?.previewPath ?? option?.managedAsset?.previewPath ?? option?.libraryAsset?.previewPath ?? null,
    option?.managedAsset ?? null,
    option?.libraryAsset ?? null,
    { ...previewContext, project, resourceType: "snd ", resourceId: previewResourceId }
  );
}

function OptionLabelsWorkbench({
  project,
  records,
  selectedId,
  selectedRecord,
  listLimit,
  onSelect,
  onShowMore,
  onResetListLimit,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  records: OptionLabelRecord[];
  selectedId: number;
  selectedRecord: OptionLabelRecord | null;
  listLimit: number;
  onSelect: (id: number) => void;
  onShowMore: () => void;
  onResetListLimit: () => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const [query, setQuery] = useState("");
  const [showList, setShowList] = useState(true);
  const filteredRecords = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return records;
    return records.filter((record) => `${record.id} ${record.text}`.toLowerCase().includes(normalized));
  }, [query, records]);
  useEffect(() => {
    onResetListLimit();
  }, [query]);
  const selectedIndex = Math.max(0, records.findIndex((record) => record.id === selectedId));
  const previous = records[Math.max(0, selectedIndex - 1)] ?? null;
  const next = records[Math.min(records.length - 1, selectedIndex + 1)] ?? null;
  const nextId = nextOptionLabelId(records);
  return (
    <>
      <nav className="text-string-navigator" aria-label="Option label navigator">
        <button type="button" className="btn btn-secondary btn-sm icon-only" disabled={!previous || previous.id === selectedId} onClick={() => previous && onSelect(previous.id)} title="Previous option label">
          <ChevronLeft size={15} />
        </button>
        <button type="button" className="btn btn-secondary btn-sm icon-only" disabled={!next || next.id === selectedId} onClick={() => next && onSelect(next.id)} title="Next option label">
          <ChevronRight size={15} />
        </button>
        <RecordJumpField label="Go To Label" selectedId={selectedId} records={records} onSelect={onSelect} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowList((value) => !value)}>
          <List size={14} /> {showList ? "Hide Search List" : "Show Search List"}
        </button>
        <label className="text-find-field">
          <TutorialTip title="Search Labels" body="Search Data OD option labels by ID or visible text. These labels are separate from the central Data SD2 message pool." side="below">
            <span>Search Labels</span>
          </TutorialTip>
          <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search option labels..." />
        </label>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            onApplyCommand({ kind: "createOptionLabel", label: `Create Option Label ${nextId}`, id: nextId });
            onSelect(nextId);
          }}
        >
          <MessageSquarePlus size={14} /> New Label {nextId}
        </button>
      </nav>
      <div className="text-workbench-layout">
        {showList && (
          <aside className="text-message-list-panel">
            <div className="text-search-row">
              <span>{filteredRecords.length.toLocaleString()} shown</span>
              <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search option labels..." />
            </div>
            <div className="text-message-list" role="list" aria-label="Option labels">
              {filteredRecords.slice(0, listLimit).map((record) => {
                const selected = record.id === selectedId;
                const usages = optionLabelUsageLinks(project, record.id);
                const byteLength = classicTextByteLength(record.text);
                return (
                  <button key={record.id} type="button" className={selected ? "selected" : ""} onClick={() => onSelect(record.id)}>
                    <strong>Option Label {record.id}</strong>
                    <span>{record.text || "Empty label"}</span>
                    <small>{usages.length} use{usages.length === 1 ? "" : "s"} | {byteLength}/24 bytes</small>
                  </button>
                );
              })}
              {filteredRecords.length > listLimit && (
                <button type="button" className="text-list-more" onClick={onShowMore}>
                  Show {Math.min(320, filteredRecords.length - listLimit).toLocaleString()} more
                </button>
              )}
              {filteredRecords.length === 0 && <p>No option labels match this search.</p>}
            </div>
          </aside>
        )}
        <main className="text-editor-surface">
          {selectedRecord ? (
            <OptionLabelEditor
              key={selectedRecord.id}
              project={project}
              record={selectedRecord}
              records={records}
              onSelect={onSelect}
              onSelectEntity={onSelectEntity}
              onApplyCommand={onApplyCommand}
            />
          ) : (
            <div className="empty-copy">Create an option label to begin authoring two-choice dialog labels.</div>
          )}
        </main>
      </div>
    </>
  );
}

function OptionLabelEditor({
  project,
  record,
  records,
  onSelect,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  record: OptionLabelRecord;
  records: OptionLabelRecord[];
  onSelect: (id: number) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const [text, setText] = useState(record.text);
  const byteLength = classicTextByteLength(text);
  const unsupportedChars = unsupportedClassicTextChars(text);
  const changed = text !== record.text;
  const usages = optionLabelUsageLinks(project, record.id);
  const shortcut = optionLabelShortcut(text);
  const duplicateShortcut = shortcut ? records.some((candidate) => candidate.id !== record.id && optionLabelShortcut(candidate.text) === shortcut) : false;
  const nextId = nextOptionLabelId(records);
  return (
    <article className="text-message-editor">
      <header>
        <div>
          <span>Option Label {record.id}</span>
          <small>{usages.length} use{usages.length === 1 ? "" : "s"} across two-choice dialogs</small>
        </div>
        <div className="text-message-actions">
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => {
              onApplyCommand({ kind: "duplicateOptionLabel", label: `Duplicate Option Label ${record.id}`, fromId: record.id, toId: nextId });
              onSelect(nextId);
            }}
          >
            <Copy size={12} /> Duplicate
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => {
              setText("");
              onApplyCommand({ kind: "clearOptionLabel", label: `Clear Option Label ${record.id}`, id: record.id });
            }}
          >
            <Eraser size={12} /> Clear
          </button>
          <button
            type="button"
            className="btn btn-primary btn-xs"
            disabled={!changed || byteLength > 24}
            onClick={() => onApplyCommand({ kind: "updateOptionLabel", label: `Update Option Label ${record.id}`, id: record.id, changes: { text } })}
          >
            Apply Label
          </button>
        </div>
      </header>
      <label className="text-message-field option-label-field">
        <span>Option Label</span>
        <input value={text} onChange={(event) => setText(event.currentTarget.value)} />
      </label>
      <div className={`text-message-status ${byteLength > 24 || unsupportedChars.length || duplicateShortcut ? "warning" : "ok"}`}>
        <TutorialTip title="Option Label Byte Limit" body={OPTION_BYTE_LIMIT_HELP} side="below">
          <span>{byteLength}/24 bytes before export</span>
        </TutorialTip>
        {shortcut && (
          <TutorialTip title="Option Shortcut" body={OPTION_LABELS_TAB_HELP} side="below">
            <span>Shortcut: {shortcut.toUpperCase()}</span>
          </TutorialTip>
        )}
        {!shortcut && <b>First visible character becomes the keyboard shortcut.</b>}
        {duplicateShortcut && <b>Another option label uses this shortcut.</b>}
        {byteLength > 24 && <b>Too long for a Realmz option label.</b>}
        {unsupportedChars.length > 0 && <b>{unsupportedChars.length} non-ASCII character{unsupportedChars.length === 1 ? "" : "s"} will export as ?.</b>}
        {!changed && byteLength <= 24 && unsupportedChars.length === 0 && !duplicateShortcut && <b>Ready</b>}
      </div>
      <section className="text-used-by-panel">
        <header>
          <TutorialTip title="Used By" body={USED_BY_HELP} side="below">
            <span>Used By</span>
          </TutorialTip>
        </header>
        <div>
          {usages.map((usage) => (
            <button key={usage.key} type="button" onClick={() => usage.entity && onSelectEntity(usage.entity)} disabled={!usage.entity}>
              <strong>{usage.label}</strong>
              <small>{usage.detail}</small>
            </button>
          ))}
          {usages.length === 0 && <p>No known two-choice references yet.</p>}
        </div>
      </section>
      <details className="advanced-details">
        <summary>
          <TutorialTip title="Advanced Details" body={ADVANCED_TEXT_HELP} side="below">
            <span>Advanced Details</span>
          </TutorialTip>
        </summary>
        <div className="summary-table">
          <div><dt>Record</dt><dd>Option label #{record.id}</dd></div>
          <div><dt>State</dt><dd>{record.authored ? "Editable option label" : "Imported option label"}</dd></div>
          <div><dt>Bytes</dt><dd>{record.rawBytes?.length ?? 0} preserved bytes</dd></div>
        </div>
      </details>
    </article>
  );
}

function ScrollingTextWorkbench({
  project,
  assets,
  importedResources,
  selectedEntity,
  selectedAsset,
  nextResourceId,
  onSelect,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  assets: Project["assets"];
  importedResources: ImportedScrollingTextResource[];
  selectedEntity: SelectedEntity | null;
  selectedAsset: Project["assets"][number] | null;
  nextResourceId: number;
  onSelect: (asset: Project["assets"][number]) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const [query, setQuery] = useState("");
  const [listLimit, setListLimit] = useState(320);
  const [selectedImportedResourceId, setSelectedImportedResourceId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedEntity?.id) return;
    if (!importedResources.some((resource) => resource.entityId === selectedEntity.id)) return;
    setSelectedImportedResourceId(selectedEntity.id);
  }, [importedResources, selectedEntity?.id]);
  useEffect(() => {
    if (!selectedImportedResourceId) return;
    if (importedResources.some((resource) => resource.entityId === selectedImportedResourceId)) return;
    setSelectedImportedResourceId(null);
  }, [importedResources, selectedImportedResourceId]);
  const selectedImportedResource = importedResources.find((resource) => resource.entityId === selectedImportedResourceId)
    ?? importedResources.find((resource) => resource.entityId === selectedEntity?.id)
    ?? null;
  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const assetRows = assets.map((asset) => ({ kind: "asset" as const, asset }));
    const importedRows = importedResources.map((resource) => ({ kind: "imported" as const, resource }));
    const rows = [...assetRows, ...importedRows].sort((a, b) => scrollingTextRowResourceId(a) - scrollingTextRowResourceId(b) || scrollingTextRowLabel(a).localeCompare(scrollingTextRowLabel(b)));
    if (!normalized) return rows;
    return rows.filter((row) => {
      if (row.kind === "imported") {
        return `${row.resource.resourceId} ${row.resource.label} ${row.resource.text}`.toLowerCase().includes(normalized);
      }
      const { asset } = row;
      const text = decodeTextAsset(asset);
      return `${asset.resourceId} ${asset.label} ${text}`.toLowerCase().includes(normalized);
    });
  }, [assets, importedResources, query]);
  useEffect(() => {
    setListLimit(320);
  }, [query]);
  return (
    <>
      <nav className="text-string-navigator text-scrolling-toolbar" aria-label="Scrolling text resources">
        <label className="text-find-field">
          <TutorialTip title="Search Scrolling Text" body="Search authored scenario TEXT resources by resource ID, label, or body text." side="below">
            <span>Search Scrolling Text</span>
          </TutorialTip>
          <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search scrolling text..." />
        </label>
        <b>{assets.length.toLocaleString()} authored | {importedResources.length.toLocaleString()} imported</b>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            const asset = scrollingTextAssetFromDraft(null, nextResourceId, `Scrolling Text ${nextResourceId}`, "");
            onApplyCommand({ kind: "attachProjectAsset", label: `Create Scrolling Text ${nextResourceId}`, asset });
            setSelectedImportedResourceId(null);
            onSelect(asset);
          }}
        >
          <FileText size={14} /> New Scrolling Text {nextResourceId}
        </button>
      </nav>
      <div className="text-workbench-layout">
        <aside className="text-message-list-panel">
          <div className="text-search-row">
            <span>{filteredRows.length.toLocaleString()} shown</span>
            <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search scrolling text..." />
          </div>
          <div className="text-message-list" role="list" aria-label="Scrolling text resources">
            {filteredRows.slice(0, listLimit).map((row) => {
              if (row.kind === "imported") {
                const resource = row.resource;
                const selected = resource.entityId === selectedImportedResource?.entityId;
                const byteLength = classicTextByteLength(resource.text);
                return (
                  <button
                    key={resource.entityId}
                    type="button"
                    className={selected ? "selected" : ""}
                    onClick={() => {
                      setSelectedImportedResourceId(resource.entityId);
                    }}
                  >
                    <strong>Scrolling Text {resource.resourceId}</strong>
                    <span>{resource.label}</span>
                    <small>{byteLength.toLocaleString()} byte{byteLength === 1 ? "" : "s"} | imported TEXT | {resource.hasStyle ? "same-ID styl present" : "plain"}</small>
                  </button>
                );
              }
              const { asset } = row;
              const selected = asset.id === selectedAsset?.id && !selectedImportedResource;
              const text = decodeTextAsset(asset);
              const byteLength = classicTextByteLength(text);
              return (
                <button
                  key={asset.id}
                  type="button"
                  className={selected ? "selected" : ""}
                  onClick={() => {
                    setSelectedImportedResourceId(null);
                    onSelect(asset);
                  }}
                >
                  <strong>Scrolling Text {asset.resourceId}</strong>
                  <span>{asset.label}</span>
                  <small>{byteLength.toLocaleString()} byte{byteLength === 1 ? "" : "s"} | {asset.exportState}</small>
                </button>
              );
            })}
            {filteredRows.length > listLimit && (
              <button type="button" className="text-list-more" onClick={() => setListLimit((value) => value + 320)}>
                Show {Math.min(320, filteredRows.length - listLimit).toLocaleString()} more
              </button>
            )}
            {filteredRows.length === 0 && <p>No scrolling text resources match this search.</p>}
          </div>
        </aside>
        <main className="text-editor-surface">
          {selectedImportedResource ? (
            <ImportedScrollingTextResourceEditor
              project={project}
              resource={selectedImportedResource}
              onApplyCommand={(command) => {
                onApplyCommand(command);
                if (command.kind === "attachProjectAsset" && command.asset.resourceType.trim() === "TEXT") {
                  setSelectedImportedResourceId(null);
                  onSelect(command.asset);
                }
              }}
            />
          ) : selectedAsset ? (
            <ScrollingTextEditor
              key={selectedAsset.id}
              project={project}
              asset={selectedAsset}
              assets={assets}
              onApplyCommand={onApplyCommand}
            />
          ) : (
            <div className="empty-copy">Create a scrolling text resource or select an imported TEXT resource to make it editable.</div>
          )}
        </main>
      </div>
    </>
  );
}

type ScrollingTextListRow =
  | { kind: "asset"; asset: Project["assets"][number] }
  | { kind: "imported"; resource: ImportedScrollingTextResource };

function scrollingTextRowResourceId(row: ScrollingTextListRow) {
  return row.kind === "asset" ? row.asset.resourceId : row.resource.resourceId;
}

function scrollingTextRowLabel(row: ScrollingTextListRow) {
  return row.kind === "asset" ? row.asset.label : row.resource.label;
}

function ImportedScrollingTextResourceEditor({
  project,
  resource,
  onApplyCommand
}: {
  project: Project;
  resource: ImportedScrollingTextResource;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const byteLength = classicTextByteLength(resource.text);
  const unsupportedChars = unsupportedClassicTextChars(resource.text);
  const [textSelectionRange, setTextSelectionRange] = useState<TextSelectionRange>({ start: 0, end: 0 });
  const captureSelection = (element: HTMLTextAreaElement) => setTextSelectionRange(textSelectionRangeFromTextArea(element));
  return (
    <article className="text-message-editor text-scrolling-resource-editor">
      <header>
        <div>
          <span>Scrolling Text {resource.resourceId}</span>
          <small>Imported scenario TEXT resource. Make it editable to author a scenario-owned replacement.</small>
        </div>
        <div className="text-message-actions">
          <button
            type="button"
            className="btn btn-primary btn-xs"
            onClick={() => {
              const asset = scrollingTextAssetFromDraft(null, resource.resourceId, resource.label, resource.text);
              onApplyCommand({ kind: "attachProjectAsset", label: `Make Scrolling Text ${resource.resourceId} editable`, asset });
            }}
          >
            Make Editable
          </button>
        </div>
      </header>
      <div className={`text-message-status ${unsupportedChars.length ? "warning" : "ok"}`}>
        <span>{byteLength.toLocaleString()} byte{byteLength === 1 ? "" : "s"} imported</span>
        <b>Source-backed imported TEXT remains preserved until Make Editable creates an authored replacement.</b>
        {resource.hasStyle && <b>Same-ID styl resource is present and remains preserved by resource export.</b>}
        {unsupportedChars.length > 0 && <b>{unsupportedChars.length} non-ASCII character{unsupportedChars.length === 1 ? "" : "s"} will export as ? if this TEXT is made editable without cleanup.</b>}
      </div>
      <StyleCompanionEditor
        project={project}
        resourceId={resource.resourceId}
        text={resource.text}
        textBytes={resource.rawTextBytes}
        textChanged={false}
        textSelectionRange={textSelectionRange}
        onTextSelectionRangeChange={setTextSelectionRange}
        onApplyCommand={onApplyCommand}
      />
      <details className="text-source-details">
        <summary>Text Source</summary>
        <label className="text-message-field">
          <span>Raw imported TEXT body</span>
          <textarea
            value={resource.text}
            readOnly
            onSelect={(event) => captureSelection(event.currentTarget)}
            onKeyUp={(event) => captureSelection(event.currentTarget)}
            onMouseUp={(event) => captureSelection(event.currentTarget)}
          />
        </label>
      </details>
      <details className="advanced-details">
        <summary>
          <TutorialTip title="Advanced Details" body="Imported TEXT resources are shown here from the scenario resource fork. Making one editable writes an authored TEXT resource with the same ID; same-ID styl companions are preserved unless separately replaced." side="below">
            <span>Advanced Details</span>
          </TutorialTip>
        </summary>
        <div className="summary-table">
          <div><dt>Resource</dt><dd>TEXT {resource.resourceId}</dd></div>
          <div><dt>Source</dt><dd>{resource.source}</dd></div>
          <div><dt>Style</dt><dd>{resource.hasStyle ? "Same-ID styl resource present" : "No same-ID styl resource found"}</dd></div>
        </div>
      </details>
    </article>
  );
}

function ScrollingTextEditor({
  project,
  asset,
  assets,
  onApplyCommand
}: {
  project: Project;
  asset: Project["assets"][number];
  assets: Project["assets"];
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const [resourceIdDraft, setResourceIdDraft] = useState(String(asset.resourceId));
  const [label, setLabel] = useState(asset.label);
  const [text, setText] = useState(() => decodeTextAsset(asset));
  const [textSelectionRange, setTextSelectionRange] = useState<TextSelectionRange>({ start: 0, end: 0 });
  useEffect(() => {
    setResourceIdDraft(String(asset.resourceId));
    setLabel(asset.label);
    setText(decodeTextAsset(asset));
    setTextSelectionRange({ start: 0, end: 0 });
  }, [asset]);
  const captureSelection = (element: HTMLTextAreaElement) => setTextSelectionRange(textSelectionRangeFromTextArea(element));
  const resourceId = Number(resourceIdDraft);
  const validResourceId = Number.isInteger(resourceId);
  const duplicateResourceId = validResourceId && assets.some((candidate) => candidate.id !== asset.id && candidate.resourceId === resourceId && candidate.resourceType.trim() === "TEXT");
  const byteLength = classicTextByteLength(text);
  const textBytes = useMemo(() => classicTextBytes(text), [text]);
  const unsupportedChars = unsupportedClassicTextChars(text);
  const changed = validResourceId && (resourceId !== asset.resourceId || label !== asset.label || text !== decodeTextAsset(asset));
  const inManualRange = validResourceId && resourceId <= -200 && resourceId >= -300;
  const styleCompanion = useMemo(() => sameIdStyleCompanion(project, resourceId), [project, resourceId]);
  const applyBlocked = !validResourceId || duplicateResourceId;
  const applyScrollingText = () => {
    if (applyBlocked || !changed) return;
    const nextAsset = scrollingTextAssetFromDraft(asset, resourceId, label.trim() || `Scrolling Text ${resourceId}`, text);
    onApplyCommand({ kind: "replaceProjectAsset", label: `Update Scrolling Text ${resourceId}`, assetId: asset.id, asset: nextAsset });
  };
  return (
    <article className="text-message-editor text-scrolling-resource-editor">
      <header>
        <div>
          <span>Scrolling Text {asset.resourceId}</span>
          <small>Scenario TEXT resource used by Display Scrolling Text.</small>
        </div>
        <div className="text-message-actions">
          <button
            type="button"
            className="btn btn-danger btn-xs"
            onClick={() => onApplyCommand({ kind: "deleteProjectAsset", label: `Delete Scrolling Text ${asset.resourceId}`, assetId: asset.id })}
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      </header>
      <div className="text-scrolling-resource-grid">
        <label>
          <span>Resource ID</span>
          <input value={resourceIdDraft} onChange={(event) => setResourceIdDraft(event.currentTarget.value)} />
        </label>
        <label>
          <span>Label</span>
          <input value={label} onChange={(event) => setLabel(event.currentTarget.value)} />
        </label>
      </div>
      <div className={`text-message-status ${!validResourceId || duplicateResourceId || unsupportedChars.length || !inManualRange ? "warning" : "ok"}`}>
        <span>{byteLength.toLocaleString()} byte{byteLength === 1 ? "" : "s"} before export</span>
        {!validResourceId && <b>Resource ID must be a whole number.</b>}
        {duplicateResourceId && <b>Another scrolling TEXT resource already uses this ID.</b>}
        {!inManualRange && validResourceId && <b>Divinity documents scrolling TEXT IDs -200 through -300; Realmz source uses direct resource lookup.</b>}
        {unsupportedChars.length > 0 && <b>{unsupportedChars.length} non-ASCII character{unsupportedChars.length === 1 ? "" : "s"} will export as UTF-8 in the authored TEXT resource.</b>}
        {styleCompanion.entity && <b>Same-ID styl resource is {styleCompanion.managedAsset ? "authored" : "preserved from imported resources"}.</b>}
        {!changed && validResourceId && !duplicateResourceId && unsupportedChars.length === 0 && inManualRange && <b>Ready</b>}
      </div>
      {validResourceId && (
        <StyleCompanionEditor
          project={project}
          resourceId={resourceId}
          text={text}
          textBytes={textBytes}
          textChanged={changed}
          textSelectionRange={textSelectionRange}
          onTextSelectionRangeChange={setTextSelectionRange}
          textEditable
          onTextChange={setText}
          onApplyTextChanges={applyScrollingText}
          textApplyBlocked={applyBlocked}
          onApplyCommand={onApplyCommand}
        />
      )}
      <details className="text-source-details">
        <summary>Edit Text Source</summary>
        <label className="text-message-field">
          <span>Raw TEXT body</span>
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.currentTarget.value);
              captureSelection(event.currentTarget);
            }}
            onSelect={(event) => captureSelection(event.currentTarget)}
            onKeyUp={(event) => captureSelection(event.currentTarget)}
            onMouseUp={(event) => captureSelection(event.currentTarget)}
          />
        </label>
      </details>
      <details className="advanced-details">
        <summary>
          <TutorialTip title="Advanced Details" body="Shows how this authored scrolling text will export as a Realmz TEXT resource. Same-ID styl resources remain preserved from imported resource forks." side="below">
            <span>Advanced Details</span>
          </TutorialTip>
        </summary>
        <div className="summary-table">
          <div><dt>Resource</dt><dd>TEXT {asset.resourceId}</dd></div>
          <div><dt>Export State</dt><dd>{asset.exportState}</dd></div>
          <div><dt>Style</dt><dd>{styleCompanion.entity ? "Same-ID styl resource present" : "No authored style resource"}</dd></div>
        </div>
      </details>
    </article>
  );
}

function StyleCompanionEditor({
  project,
  resourceId,
  text,
  textBytes,
  textChanged,
  textSelectionRange,
  onTextSelectionRangeChange,
  textEditable = false,
  onTextChange,
  onApplyTextChanges,
  textApplyBlocked = true,
  onApplyCommand
}: {
  project: Project;
  resourceId: number;
  text: string;
  textBytes?: Uint8Array | null;
  textChanged: boolean;
  textSelectionRange: TextSelectionRange;
  onTextSelectionRangeChange?: (range: TextSelectionRange) => void;
  textEditable?: boolean;
  onTextChange?: (text: string) => void;
  onApplyTextChanges?: () => void;
  textApplyBlocked?: boolean;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const companion = useMemo(() => sameIdStyleCompanion(project, resourceId), [project, resourceId]);
  const [styleHexDraft, setStyleHexDraft] = useState("");
  useEffect(() => {
    setStyleHexDraft(companion.styleHex ?? "");
  }, [resourceId, companion.managedAsset?.id, companion.importedEntity?.id, companion.styleHex]);
  const parsedStyleBytes = useMemo(() => parseHexBytes(styleHexDraft), [styleHexDraft]);
  const parsedStyleRuns = useMemo(() => parseClassicStyleRuns(companion.rawStyleBytes), [companion.rawStyleBytes]);
  const firstStyleRun = parsedStyleRuns.ok ? parsedStyleRuns.runs[0] : null;
  const [fontDraft, setFontDraft] = useState("0");
  const [sizeDraft, setSizeDraft] = useState("12");
  const [colorDraft, setColorDraft] = useState("#000000");
  const [boldDraft, setBoldDraft] = useState(false);
  const [italicDraft, setItalicDraft] = useState(false);
  const [underlineDraft, setUnderlineDraft] = useState(false);
  const [styleRunDrafts, setStyleRunDrafts] = useState<ClassicStyleRunDraft[]>([]);
  useEffect(() => {
    const run = firstStyleRun ?? DEFAULT_CLASSIC_STYLE_RUN;
    setFontDraft(String(run.font));
    setSizeDraft(String(run.size > 0 ? run.size : 12));
    setColorDraft(classicRgbToCssHex(run.color));
    setBoldDraft((run.face & CLASSIC_STYLE_FACE_BITS.bold) !== 0);
    setItalicDraft((run.face & CLASSIC_STYLE_FACE_BITS.italic) !== 0);
    setUnderlineDraft((run.face & CLASSIC_STYLE_FACE_BITS.underline) !== 0);
  }, [firstStyleRun?.font, firstStyleRun?.size, firstStyleRun?.face, firstStyleRun?.color.red, firstStyleRun?.color.green, firstStyleRun?.color.blue]);
  useEffect(() => {
    setStyleRunDrafts(parsedStyleRuns.ok ? styleRunDraftsFromRuns(parsedStyleRuns.runs) : []);
  }, [resourceId, companion.styleHex, parsedStyleRuns.ok]);
  const styleHexDirty = normalizeHex(styleHexDraft) !== normalizeHex(companion.styleHex ?? "");
  const parsedFont = Number(fontDraft);
  const styleRunDraftResult = useMemo(() => classicStyleRunsFromDrafts(styleRunDrafts), [styleRunDrafts]);
  const styleRunBytes = styleRunDraftResult.ok ? classicStyleBytesFromRuns(styleRunDraftResult.runs) : null;
  const styleRunBytesDirty = styleRunBytes ? !bytesEqual(styleRunBytes, companion.rawStyleBytes ?? new Uint8Array()) : false;
  const previewRuns = styleRunDraftResult.ok ? styleRunDraftResult.runs : parsedStyleRuns.ok ? parsedStyleRuns.runs : [];
  const decodedText = useMemo(() => textBytes ? decodeClassicTextPreviewBytes(textBytes) : decodeClassicTextPreviewString(text), [text, textBytes]);
  const previewText = decodedText.text;
  const normalizedTextSelection = selectedTextRange(textSelectionRange, previewText);
  const rawTextSelection = displayRangeToRawRange(decodedText, normalizedTextSelection);
  const selectedRangeValid = rawTextSelection.end > rawTextSelection.start;
  const activeStyleOffset = Math.max(0, Math.min(decodedText.rawByteLength, rawTextSelection.start));
  const selectedTextTitle = selectedRangeValid
    ? textSelectionTitle(previewText, normalizedTextSelection)
    : `Caret at raw byte ${activeStyleOffset}; toolbar reflects the style run active here.`;
  const canEditText = textEditable && onTextChange != null;
  const fontOptionValue = CLASSIC_AUTHOR_FONT_OPTIONS.some((option) => option.id === parsedFont) ? String(parsedFont) : "custom";
  useEffect(() => {
    const run = styleRunDraftAtOffset(styleRunDrafts, activeStyleOffset);
    setFontDraft(run.font);
    setSizeDraft(run.size);
    setColorDraft(run.color);
    setBoldDraft(run.bold);
    setItalicDraft(run.italic);
    setUnderlineDraft(run.underline);
  }, [resourceId, activeStyleOffset, rawTextSelection.end, styleRunDrafts]);
  const toolbarStyleFromDrafts = (updates: Partial<{
    font: string;
    size: string;
    color: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
  }> = {}): AuthorStyleDraft | null => {
    const font = Number(updates.font ?? fontDraft);
    const size = Number(updates.size ?? sizeDraft);
    const color = updates.color ?? colorDraft;
    if (!Number.isInteger(font) || font < 0 || font > 32767) return null;
    if (!Number.isInteger(size) || size < 1 || size > 255) return null;
    if (!isCssHexColor(color)) return null;
    return {
      font,
      size,
      color,
      bold: updates.bold ?? boldDraft,
      italic: updates.italic ?? italicDraft,
      underline: updates.underline ?? underlineDraft
    };
  };
  const applyToolbarStyleToSelection = (style: AuthorStyleDraft | null) => {
    if (!style || !selectedRangeValid) return;
    setStyleRunDrafts((drafts) => applyAuthorStyleToSelection(drafts, previewText, rawTextSelection, style, decodedText.rawByteLength));
  };
  const applyStyleBytes = (bytes: Uint8Array, provenance: string, label: string) => {
    const asset = styleAssetFromBytes(companion.managedAsset ?? null, resourceId, bytes, provenance);
    onApplyCommand(
      companion.managedAsset
        ? { kind: "replaceProjectAsset", label, assetId: companion.managedAsset.id, asset }
        : { kind: "attachProjectAsset", label, asset }
    );
  };
  const canApplyTextChanges = textChanged && onApplyTextChanges != null;
  const canApplyStyleRunChanges = styleRunDraftResult.ok && styleRunBytes != null && styleRunBytesDirty;
  const applyChangesDisabled = textApplyBlocked || (!canApplyTextChanges && !canApplyStyleRunChanges);
  const applyViewportChanges = () => {
    if (textApplyBlocked) return;
    if (canApplyTextChanges) onApplyTextChanges?.();
    if (canApplyStyleRunChanges && styleRunBytes) {
      applyStyleBytes(styleRunBytes, "Authored in Providence Scrolling Text style runs", `Update Style ${resourceId}`);
    }
  };
  const styleState = companion.managedAsset
    ? "Authored style override"
    : companion.importedEntity
      ? "Imported style preserved"
      : "Plain scrolling text";
  return (
    <section className="text-style-companion-editor">
      <header>
        <div>
          <span>Style Companion</span>
          <small>{styleState}</small>
        </div>
        <div className="text-message-actions">
          {companion.managedAsset && (
            <button
              type="button"
              className="btn btn-danger btn-xs"
              onClick={() => onApplyCommand({ kind: "deleteProjectAsset", label: `Remove Style Override ${resourceId}`, assetId: companion.managedAsset!.id })}
            >
              Remove Override
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            disabled={companion.managedAsset?.provenance === "Authored in Providence Scrolling Text as plain style"}
            onClick={() => {
              const asset = plainStyleAssetFromDraft(companion.managedAsset ?? null, resourceId);
              onApplyCommand(
                companion.managedAsset
                  ? { kind: "replaceProjectAsset", label: `Flatten Style ${resourceId}`, assetId: companion.managedAsset.id, asset }
                  : { kind: "attachProjectAsset", label: `Flatten Style ${resourceId}`, asset }
              );
            }}
          >
            Flatten To Plain Style
          </button>
        </div>
      </header>
      <div className="text-style-companion-summary">
        <span>{companion.runCount == null ? "No style runs" : `${companion.runCount} style run${companion.runCount === 1 ? "" : "s"}`}</span>
        <span>{companion.styleBytes == null ? "No styl resource will be exported unless one is authored or preserved." : `${companion.styleBytes.toLocaleString()} style byte${companion.styleBytes === 1 ? "" : "s"}`}</span>
        {textChanged && companion.importedEntity && !companion.managedAsset && (
          <b>TEXT edits preserve the imported style runs; flatten only if the old rich styling no longer matches the edited body.</b>
        )}
      </div>
      <div className="text-style-run-editor">
        <div className={`text-style-companion-summary ${parsedStyleRuns.ok ? "" : "warning"}`}>
          <span>{parsedStyleRuns.ok ? "Classic style-run table" : parsedStyleRuns.error}</span>
          <span>{parsedStyleRuns.ok ? "Edit and select text directly in the gameplay viewport; formatting changes preview immediately until Apply Changes." : "Raw bytes are preserved and can still be edited below."}</span>
        </div>
        <div className="text-style-format-toolbar">
          <div className={`text-style-selection-summary ${selectedRangeValid ? "active" : ""}`} title={selectedTextTitle}>
            <span>Selected Range</span>
            <strong>{selectedRangeValid ? `${rawTextSelection.start}-${rawTextSelection.end - 1}` : `Caret ${activeStyleOffset}`}</strong>
          </div>
          <label>
            <span>Font</span>
            <select
              value={fontOptionValue}
              onChange={(event) => {
                const next = event.currentTarget.value === "custom" ? "" : event.currentTarget.value;
                setFontDraft(next);
                applyToolbarStyleToSelection(toolbarStyleFromDrafts({ font: next }));
              }}
            >
              {CLASSIC_AUTHOR_FONT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label} ({option.id})</option>
              ))}
              <option value="custom">Custom ID</option>
            </select>
          </label>
          {fontOptionValue === "custom" && (
            <label className="text-style-custom-font">
              <span>Custom Font ID</span>
              <input
                value={fontDraft}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setFontDraft(next);
                  applyToolbarStyleToSelection(toolbarStyleFromDrafts({ font: next }));
                }}
                inputMode="numeric"
              />
            </label>
          )}
          <div className="text-style-number-color-group">
            <label className="text-style-size-field">
              <span>Size</span>
              <input
                value={sizeDraft}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setSizeDraft(next);
                  applyToolbarStyleToSelection(toolbarStyleFromDrafts({ size: next }));
                }}
                inputMode="numeric"
                maxLength={4}
              />
            </label>
            <label className="text-style-color-label">
              <span>Color</span>
              <span className="text-style-color-field">
                <input
                  value={colorDraft}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setColorDraft(next);
                    applyToolbarStyleToSelection(toolbarStyleFromDrafts({ color: next }));
                  }}
                  placeholder="#000000"
                />
                <input
                  type="color"
                  value={isCssHexColor(colorDraft) ? colorDraft : "#000000"}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setColorDraft(next);
                    applyToolbarStyleToSelection(toolbarStyleFromDrafts({ color: next }));
                  }}
                  aria-label="Selection style color"
                />
              </span>
            </label>
          </div>
          <div className="text-style-toggle-group" aria-label="Selection style toggles">
            <button
              type="button"
              className={boldDraft ? "active" : ""}
              aria-pressed={boldDraft}
              title="Bold"
              onClick={() => {
                const next = !boldDraft;
                setBoldDraft(next);
                applyToolbarStyleToSelection(toolbarStyleFromDrafts({ bold: next }));
              }}
            >
              <Bold size={15} />
            </button>
            <button
              type="button"
              className={italicDraft ? "active" : ""}
              aria-pressed={italicDraft}
              title="Italic"
              onClick={() => {
                const next = !italicDraft;
                setItalicDraft(next);
                applyToolbarStyleToSelection(toolbarStyleFromDrafts({ italic: next }));
              }}
            >
              <Italic size={15} />
            </button>
            <button
              type="button"
              className={underlineDraft ? "active" : ""}
              aria-pressed={underlineDraft}
              title="Underline"
              onClick={() => {
                const next = !underlineDraft;
                setUnderlineDraft(next);
                applyToolbarStyleToSelection(toolbarStyleFromDrafts({ underline: next }));
              }}
            >
              <Underline size={15} />
            </button>
          </div>
        </div>
        <StyledScrollingTextPreview
          text={previewText}
          textBytes={textBytes}
          runs={previewRuns}
          parseError={parsedStyleRuns.ok ? null : parsedStyleRuns.error}
          draftDirty={styleRunBytesDirty}
          title={canEditText ? "Gameplay viewport editor" : "Gameplay viewport preview"}
          description={canEditText ? "Editable Display Scrolling Text in Realmz gameplay viewport geometry." : "Display Scrolling Text uses Realmz lookrect geometry; modern Realmz uses a 480 px gameplay text viewport."}
          movieViewportWidth={REALMZ_GAMEPLAY_TEXT_VIEW_WIDTH}
          editableText={canEditText}
          onTextChange={onTextChange}
          onApplyChanges={applyViewportChanges}
          applyChangesDisabled={applyChangesDisabled}
          onDisplaySelectionChange={onTextSelectionRangeChange}
        />
        {parsedStyleRuns.ok && (
          <details className="text-style-run-technical-details">
            <summary>Technical Style Runs</summary>
            <div className="text-style-run-table" role="table" aria-label="Editable Classic style runs">
            <div role="row">
              <b title="Raw Classic TEXT character offset where this style begins. The row applies until the next style run starts.">Starts At</b>
              <b>Font</b>
              <b>Size</b>
              <b>Color</b>
              <b>Text Range</b>
              <b>Style</b>
              <b>Actions</b>
            </div>
            {styleRunDrafts.map((run) => (
              <div role="row" key={run.id}>
                <input
                  value={run.startChar}
                  onChange={(event) => setStyleRunDrafts((drafts) => updateStyleRunDraft(drafts, run.id, { startChar: event.currentTarget.value }))}
                  inputMode="numeric"
                  aria-label={`Style run ${run.index + 1} start character`}
                />
                <input
                  value={run.font}
                  onChange={(event) => setStyleRunDrafts((drafts) => updateStyleRunDraft(drafts, run.id, { font: event.currentTarget.value }))}
                  inputMode="numeric"
                  aria-label={`Style run ${run.index + 1} font ID`}
                />
                <input
                  value={run.size}
                  onChange={(event) => setStyleRunDrafts((drafts) => updateStyleRunDraft(drafts, run.id, { size: event.currentTarget.value }))}
                  inputMode="numeric"
                  aria-label={`Style run ${run.index + 1} size`}
                />
                <span className="text-style-color-field">
                  <input
                    value={run.color}
                    onChange={(event) => setStyleRunDrafts((drafts) => updateStyleRunDraft(drafts, run.id, { color: event.currentTarget.value }))}
                    aria-label={`Style run ${run.index + 1} color`}
                  />
                  <input
                    type="color"
                    value={isCssHexColor(run.color) ? run.color : "#000000"}
                    onChange={(event) => setStyleRunDrafts((drafts) => updateStyleRunDraft(drafts, run.id, { color: event.currentTarget.value }))}
                    aria-label={`Style run ${run.index + 1} color picker`}
                  />
                </span>
                <span className="text-style-run-excerpt" title={styleRunRangeTitle(run, styleRunDrafts, previewText, decodedText)}>
                  {styleRunRangeSummary(run, styleRunDrafts, previewText, decodedText)}
                </span>
                <div className="text-style-run-flags">
                  <label title="Bold">
                    <input type="checkbox" checked={run.bold} onChange={(event) => setStyleRunDrafts((drafts) => updateStyleRunDraft(drafts, run.id, { bold: event.currentTarget.checked }))} />
                    <Bold size={12} />
                  </label>
                  <label title="Italic">
                    <input type="checkbox" checked={run.italic} onChange={(event) => setStyleRunDrafts((drafts) => updateStyleRunDraft(drafts, run.id, { italic: event.currentTarget.checked }))} />
                    <Italic size={12} />
                  </label>
                  <label title="Underline">
                    <input type="checkbox" checked={run.underline} onChange={(event) => setStyleRunDrafts((drafts) => updateStyleRunDraft(drafts, run.id, { underline: event.currentTarget.checked }))} />
                    <Underline size={12} />
                  </label>
                </div>
                <button
                  type="button"
                  className="btn btn-danger btn-xs"
                  disabled={styleRunDrafts.length <= 1}
                  onClick={() => setStyleRunDrafts((drafts) => removeStyleRunDraft(drafts, run.id))}
                >
                  Remove
                </button>
              </div>
            ))}
            {!styleRunDraftResult.ok && <small className="warning">{styleRunDraftResult.error}</small>}
            {styleRunDraftResult.ok && styleRunDraftResult.runs.some((run) => (run.face & CLASSIC_STYLE_EXTRA_FACE_MASK) !== 0) && (
              <small>Imported outline, shadow, condense, or extend style flags are preserved when rows are edited.</small>
            )}
            <div className="text-style-run-actions">
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => setStyleRunDrafts((drafts) => addStyleRunDraft(drafts))}
              >
                Add Style Run
              </button>
              {styleRunBytesDirty && (
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => setStyleRunDrafts(parsedStyleRuns.ok ? styleRunDraftsFromRuns(parsedStyleRuns.runs) : [])}>
                  Revert Runs
                </button>
              )}
            </div>
            </div>
          </details>
        )}
      </div>
      {(companion.styleHex || companion.managedAsset) && (
        <details className="text-style-bytes-editor">
          <summary>Style Bytes</summary>
          <label>
            <span>Hex</span>
            <textarea
              value={styleHexDraft}
              onChange={(event) => setStyleHexDraft(event.currentTarget.value)}
              spellCheck={false}
              placeholder="00 00"
            />
          </label>
          <div className={`text-style-companion-summary ${parsedStyleBytes.ok ? "" : "warning"}`}>
            <span>{parsedStyleBytes.ok ? `${parsedStyleBytes.bytes.length.toLocaleString()} byte${parsedStyleBytes.bytes.length === 1 ? "" : "s"} ready` : parsedStyleBytes.error}</span>
            <span>Hex edits replace the same-ID styl resource exactly; use this only when preserving or intentionally editing imported style data.</span>
          </div>
          <div className="text-message-actions">
            <button
              type="button"
              className="btn btn-primary btn-xs"
              disabled={!parsedStyleBytes.ok || !styleHexDirty}
              onClick={() => {
                if (!parsedStyleBytes.ok) return;
                const asset = styleAssetFromBytes(
                  companion.managedAsset ?? null,
                  resourceId,
                  parsedStyleBytes.bytes,
                  companion.managedAsset?.provenance ?? "Authored in Providence Scrolling Text style bytes"
                );
                onApplyCommand(
                  companion.managedAsset
                    ? { kind: "replaceProjectAsset", label: `Update Style ${resourceId}`, assetId: companion.managedAsset.id, asset }
                    : { kind: "attachProjectAsset", label: `Author Style ${resourceId}`, asset }
                );
              }}
            >
              Apply Style Bytes
            </button>
            {styleHexDirty && (
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => setStyleHexDraft(companion.styleHex ?? "")}>
                Revert Bytes
              </button>
            )}
          </div>
        </details>
      )}
    </section>
  );
}

function selectedMessageId(selectedEntity: SelectedEntity | null, records: MessageRecord[]) {
  if (selectedEntity?.id.startsWith("message:")) {
    const id = Number(selectedEntity.id.slice("message:".length));
    if (Number.isInteger(id)) return id;
  }
  return records[0]?.id ?? null;
}

function includeSelectedRecord<T extends { id: number }>(records: T[], selectedId: number, limit: number) {
  const visible = records.slice(0, limit);
  if (visible.some((record) => record.id === selectedId)) return visible;
  const selected = records.find((record) => record.id === selectedId);
  return selected ? [selected, ...visible] : visible;
}

function selectedOptionLabelId(selectedEntity: SelectedEntity | null) {
  if (selectedEntity?.id.startsWith("option-label:")) {
    const id = Number(selectedEntity.id.slice("option-label:".length));
    if (Number.isInteger(id)) return id;
  }
  const match = selectedEntity?.id.match(/^record:Data OD:(\d+)$/);
  if (match) return Number(match[1]);
  return null;
}

function TextReferenceDetail({
  row,
  onBack,
  onInspect
}: {
  row: TextReferenceRow;
  onBack: () => void;
  onInspect: () => void;
}) {
  return (
    <article className="text-reference-detail">
      <header>
        <div>
          <strong>{row.label}</strong>
          <small>{row.source}</small>
        </div>
        <div>
          <button type="button" className="btn btn-secondary btn-xs" onClick={onBack}>Back To Search</button>
          <button type="button" className="btn btn-secondary btn-xs" onClick={onInspect}>Inspect Details</button>
        </div>
      </header>
      <p>{row.detail}</p>
      {row.preview && <pre>{row.preview}</pre>}
      {!row.preview && <p>This resource has no readable preview yet.</p>}
    </article>
  );
}

type TextReferenceRow = {
  id: string;
  label: string;
  detail: string;
  source: string;
  preview: string;
};

type ImportedScrollingTextResource = {
  entityId: string;
  resourceId: number;
  label: string;
  source: string;
  text: string;
  rawTextBytes: Uint8Array | null;
  hasStyle: boolean;
};

type ProjectSemanticEntity = NonNullable<Project["semanticSchema"]>["entities"][number];

function semanticResourceType(entity: ProjectSemanticEntity) {
  const direct = String(entity.summary.type ?? entity.summary.resourceType ?? "").trim();
  if (direct) return direct;
  const match = entity.id.match(/^resource:([^:]+):/);
  return match?.[1]?.trim() ?? "";
}

function semanticResourceId(entity: ProjectSemanticEntity) {
  const direct = Number(entity.summary.resourceId ?? entity.summary.id ?? entity.summary.index);
  if (Number.isInteger(direct)) return direct;
  const match = entity.id.match(/^resource:[^:]+:(-?\d+)/);
  return match ? Number(match[1]) : NaN;
}

function nextMessageId(records: MessageRecord[]) {
  const used = new Set(records.map((record) => record.id));
  for (let id = 0; id < 10000; id += 1) {
    if (!used.has(id)) return id;
  }
  return records.length;
}

function nextOptionLabelId(records: OptionLabelRecord[]) {
  const used = new Set(records.map((record) => record.id));
  for (let id = 0; id < 10000; id += 1) {
    if (!used.has(id)) return id;
  }
  return records.length;
}

function scrollingTextProjectAssets(project: Project) {
  return [...(project.assets ?? [])]
    .filter((asset) => asset.resourceType.trim() === "TEXT")
    .sort((a, b) => a.resourceId - b.resourceId || a.label.localeCompare(b.label));
}

function importedScrollingTextResourceRows(project: Project, managedAssets: Project["assets"]): ImportedScrollingTextResource[] {
  const managedIds = new Set(managedAssets.map((asset) => asset.resourceId));
  return (project.semanticSchema?.entities ?? [])
    .map((entity): ImportedScrollingTextResource | null => {
      const resourceType = semanticResourceType(entity);
      if (resourceType !== "TEXT") return null;
      const resourceId = semanticResourceId(entity);
      if (!Number.isInteger(resourceId) || managedIds.has(resourceId)) return null;
      const rawTextBytes = bytesFromBase64String(entity.summary.textResourceBase64);
      const text = rawTextBytes ? decodeClassicTextPreviewBytes(rawTextBytes).text : importedTextBody(entity.summary);
      const styleEntity = sameIdStyleResourceEntity(project, resourceId);
      return {
        entityId: entity.id,
        resourceId,
        label: entity.label || `Scrolling Text ${resourceId}`,
        source: entity.source,
        text,
        rawTextBytes,
        hasStyle: styleEntity != null
      };
    })
    .filter((row): row is ImportedScrollingTextResource => row != null)
    .sort((a, b) => a.resourceId - b.resourceId || a.label.localeCompare(b.label));
}

function selectedScrollingTextAssetFromEntity(assets: Project["assets"], selectedEntity: SelectedEntity | null) {
  if (selectedEntity?.type !== "resource") return null;
  const resourceMatch = selectedEntity.id.match(/^resource:TEXT:(-?\d+)$/);
  const resourceId = resourceMatch ? Number(resourceMatch[1]) : NaN;
  return assets.find((asset) => {
    if (asset.resourceType.trim() !== "TEXT" && asset.kind !== "text") return false;
    if (asset.id === selectedEntity.id || asset.linkedEntity === selectedEntity.id) return true;
    return Number.isInteger(resourceId) && asset.resourceId === resourceId;
  }) ?? null;
}

function nextScrollingTextResourceId(project: Project) {
  const used = new Set<number>();
  for (const asset of project.assets ?? []) {
    if (asset.resourceType.trim() === "TEXT" || asset.kind === "text") used.add(asset.resourceId);
  }
  for (const entity of project.semanticSchema?.entities ?? []) {
    if (semanticResourceType(entity) !== "TEXT") continue;
    const id = semanticResourceId(entity);
    if (Number.isInteger(id)) used.add(id);
  }
  for (let id = -200; id >= -300; id -= 1) {
    if (!used.has(id)) return id;
  }
  return -200;
}

function scrollingTextAssetFromDraft(existing: Project["assets"][number] | null, resourceId: number, label: string, text: string): Project["assets"][number] {
  const bytes = classicTextBytes(text);
  const sha256 = `text-${hashText(text)}`;
  const safeId = String(resourceId).replace(/[^-\d]/g, "");
  const fileName = `scrolling-text-${safeId}.txt`;
  const dataUrl = bytesToDataUrl(bytes);
  return {
    id: existing?.id ?? `managed:TEXT:${resourceId}:authored`,
    label,
    kind: "text",
    resourceType: "TEXT",
    resourceId,
    fileName,
    originalPath: dataUrl,
    previewPath: dataUrl,
    resourcePath: dataUrl,
    mimeType: "text/plain",
    bytes: bytes.length,
    sha256,
    width: null,
    height: null,
    durationMs: null,
    sampleRate: null,
    channels: null,
    exportState: "ready",
    provenance: existing?.provenance ?? "Authored in Providence Scrolling Text",
    linkedEntity: `resource:TEXT:${resourceId}`,
    conversion: null
  };
}

function decodeTextAsset(asset: Project["assets"][number]) {
  return decodeTextDataUrl(asset.resourcePath) || decodeTextDataUrl(asset.previewPath) || decodeTextDataUrl(asset.originalPath);
}

function importedTextBody(summary: Record<string, unknown>) {
  if (typeof summary.textOffsetBody === "string") return summary.textOffsetBody;
  if (typeof summary.text === "string") return summary.text;
  if (typeof summary.textPreview === "string") return summary.textPreview;
  if (typeof summary.preview === "string") return summary.preview;
  return "";
}

type TextStyleCompanion = {
  entity: SelectedEntity | null;
  managedAsset: Project["assets"][number] | null;
  importedEntity: NonNullable<Project["semanticSchema"]>["entities"][number] | null;
  importedStyleBytes: Uint8Array | null;
  rawStyleBytes: Uint8Array | null;
  runCount: number | null;
  styleBytes: number | null;
  styleHex: string | null;
};

function sameIdStyleCompanion(project: Project, resourceId: number): TextStyleCompanion {
  if (!Number.isInteger(resourceId)) {
    return { entity: null, managedAsset: null, importedEntity: null, importedStyleBytes: null, rawStyleBytes: null, runCount: null, styleBytes: null, styleHex: null };
  }
  const projectAsset = (project.assets ?? []).find((asset) => asset.resourceType.trim() === "styl" && asset.resourceId === resourceId);
  const managedStyleBytes = projectAsset ? bytesFromDataUrl(projectAsset.resourcePath) ?? bytesFromDataUrl(projectAsset.originalPath) ?? bytesFromDataUrl(projectAsset.previewPath) : null;
  const importedEntity = project.semanticSchema?.entities.find((candidate) => {
    if (semanticResourceType(candidate) !== "styl") return false;
    return semanticResourceId(candidate) === resourceId;
  }) ?? null;
  const importedStyleBytes = bytesFromBase64String(importedEntity?.summary.styleResourceBase64);
  const styleBytes = managedStyleBytes ?? importedStyleBytes;
  const entity = projectAsset ? { type: "resource" as const, id: projectAsset.id } : importedEntity ? selectEntityFromId(importedEntity.id) : null;
  return {
    entity,
    managedAsset: projectAsset ?? null,
    importedEntity,
    importedStyleBytes,
    rawStyleBytes: styleBytes,
    runCount: styleBytes ? u16FromBytes(styleBytes, 0) : numberSummary(importedEntity?.summary.styleRunCountCandidate),
    styleBytes: styleBytes ? styleBytes.length : projectAsset ? projectAsset.bytes : numberSummary(importedEntity?.summary.styleBytes),
    styleHex: styleBytes ? bytesToHex(styleBytes) : null
  };
}

function sameIdStyleResourceEntity(project: Project, resourceId: number): SelectedEntity | null {
  return sameIdStyleCompanion(project, resourceId)?.entity ?? null;
}

function numberSummary(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function plainStyleAssetFromDraft(existing: Project["assets"][number] | null, resourceId: number): Project["assets"][number] {
  return styleAssetFromBytes(existing, resourceId, new Uint8Array([0, 0]), "Authored in Providence Scrolling Text as plain style");
}

function styleAssetFromBytes(existing: Project["assets"][number] | null, resourceId: number, bytes: Uint8Array, provenance: string): Project["assets"][number] {
  const safeId = String(resourceId).replace(/[^-\d]/g, "");
  const dataUrl = bytesToDataUrl(bytes, "application/octet-stream");
  return {
    id: existing?.id ?? `managed:styl:${resourceId}:${provenance.includes("plain") ? "plain" : "authored"}`,
    label: provenance.includes("plain") ? `Plain Style ${resourceId}` : `Style ${resourceId}`,
    kind: "text",
    resourceType: "styl",
    resourceId,
    fileName: `scrolling-text-${safeId}.styl`,
    originalPath: dataUrl,
    previewPath: dataUrl,
    resourcePath: dataUrl,
    mimeType: "application/octet-stream",
    bytes: bytes.length,
    sha256: `styl-${hashBytes(bytes)}`,
    width: null,
    height: null,
    durationMs: null,
    sampleRate: null,
    channels: null,
    exportState: "ready",
    provenance,
    linkedEntity: `resource:styl:${resourceId}`,
    conversion: null
  };
}

function classicTextBytes(text: string) {
  return classicTextBytesFromDisplayString(text);
}

function bytesToDataUrl(bytes: Uint8Array, mimeType = "text/plain") {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    const chunk = bytes.slice(offset, offset + 8192);
    binary += String.fromCharCode(...chunk);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function bytesFromDataUrl(dataUrl: string | null | undefined) {
  if (!dataUrl) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const metadata = dataUrl.slice(0, comma).toLowerCase();
  const payload = dataUrl.slice(comma + 1);
  if (!metadata.includes(";base64")) return null;
  return bytesFromBase64String(payload);
}

function bytesFromBase64String(payload: unknown) {
  if (typeof payload !== "string" || payload.length === 0) return null;
  try {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function normalizeHex(value: string) {
  return value.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
}

function parseHexBytes(value: string): { ok: true; bytes: Uint8Array } | { ok: false; error: string } {
  const normalized = normalizeHex(value);
  if (normalized.length === 0) return { ok: true, bytes: new Uint8Array() };
  if (normalized.length % 2 !== 0) return { ok: false, error: "Hex must contain complete byte pairs." };
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return { ok: true, bytes };
}

function base64ToText(payload: string) {
  const binary = atob(payload);
  let text = "";
  for (let index = 0; index < binary.length; index += 1) {
    text += String.fromCharCode(binary.charCodeAt(index));
  }
  return text;
}

function hashText(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function hashBytes(bytes: Uint8Array) {
  let hash = 2166136261;
  for (const byte of bytes) {
    hash = Math.imul(hash ^ byte, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function optionLabelShortcut(text: string) {
  return text
    .split("")
    .find((char) => char.trim().length > 0)
    ?.toLowerCase() ?? "";
}

function isStringReviewCandidate(record: MessageRecord) {
  return classicTextByteLength(record.text) >= 255 || unsupportedClassicTextChars(record.text).length > 0;
}

function nextReviewStringId(ids: number[], selectedId: number) {
  if (ids.length === 0) return null;
  const directIndex = ids.indexOf(selectedId);
  if (directIndex >= 0) return ids[(directIndex + 1) % ids.length];
  return ids.find((id) => id > selectedId) ?? ids[0];
}

function normalizeImportedString(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function exportDivinityTextFile(records: MessageRecord[]) {
  const content = records.map((record) => record.text ?? "").join(DIVINITY_TEXT_SEPARATOR);
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "Export Text.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function textReferenceRows(project: Project, catalog: LibraryCatalog | null | undefined, query: string) {
  const wantedTypes = new Set(["text-resource", "string-list-resource", "style-resource"]);
  const rows = [
    ...project.assets.filter((asset) => asset.kind === "text" || ["TEXT", "STR#", "styl"].includes(asset.resourceType.trim())).map((asset) => ({
      id: asset.id,
      label: asset.label,
      detail: textResourceDetail({ resourceId: asset.resourceId, type: asset.resourceType, bytes: asset.bytes }),
      source: "Project",
      preview: decodeTextAsset(asset)
    })),
    ...(project.semanticSchema?.entities ?? []).filter((entity) => wantedTypes.has(entity.type)).map((entity) => ({
      id: entity.id,
      label: entity.label,
      detail: textResourceDetail(entity.summary ?? {}),
      source: entity.source || "Scenario resource fork",
      preview: textResourcePreview(entity.summary ?? {})
    })),
    ...(catalog?.entities ?? []).filter((entity) => wantedTypes.has(entity.type)).map((entity) => ({
      id: entity.id,
      label: entity.label,
      detail: textResourceDetail(entity.summary ?? {}),
      source: "Library",
      preview: textResourcePreview(entity.summary ?? {})
    }))
  ];
  const normalized = query.trim().toLowerCase();
  if (!normalized) return rows;
  return rows.filter((row) => `${row.label} ${row.detail} ${row.source}`.toLowerCase().includes(normalized));
}

function decodeTextDataUrl(dataUrl: string | null | undefined) {
  if (!dataUrl) return "";
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return "";
  try {
    const metadata = dataUrl.slice(0, comma).toLowerCase();
    const payload = dataUrl.slice(comma + 1);
    return metadata.includes(";base64") ? base64ToText(payload) : decodeURIComponent(payload);
  } catch {
    return "";
  }
}

function textResourceDetail(summary: Record<string, unknown>) {
  const resourceId = typeof summary.resourceId === "number" ? `#${summary.resourceId}` : "";
  const preview = typeof summary.textPreview === "string" ? summary.textPreview : "";
  const count = typeof summary.stringCount === "number" ? `${summary.stringCount} strings` : "";
  return [resourceId, count, preview].filter(Boolean).join(" | ") || "Readable reference";
}

function textResourcePreview(summary: Record<string, unknown>) {
  if (typeof summary.textPreview === "string") return summary.textPreview;
  if (typeof summary.preview === "string") return summary.preview;
  return "";
}
