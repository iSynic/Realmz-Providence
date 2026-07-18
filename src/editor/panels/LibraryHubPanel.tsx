import { FileArchive, LibraryBig } from "lucide-react";
import { useMemo, useState } from "react";
import { TutorialTip } from "../components/TutorialTip";
import { LibraryCatalog, ProvidenceWorkspace } from "../types";
import { EntityRow, IncrementalListFooter, IssueGroup, PanelHeader, SearchField, useIncrementalListLimit, type WorkbenchTone } from "../ui";

const LIBRARY_SOURCE_STEP = 80;
const LIBRARY_DIAGNOSTIC_STEP = 6;

const LIBRARY_WORKBENCH_HELP =
  "Library Workbench is Providence's bundled reference catalog. It explains Realmz and Divinity built-ins used for previews, pickers, fallbacks, and comparison, but those entries are not scenario-owned export data.";
const LIBRARY_PACKAGE_HELP =
  "Bundled library data is seeded with Providence so Maps, Combat, Economy, Rules, Assets, Records, and Search can resolve known Realmz material before a scenario is loaded.";
const LIBRARY_SOURCE_HELP =
  "Managed Catalog lists the source files behind the current reference catalog: Realmz reference files, Divinity import material, and Providence-only draft/reference entries.";
const LIBRARY_RECORD_HELP =
  "Library records are decoded evidence from bundled sources. They can inform authoring tools, but editing a scenario still happens through project records or copied scenario-owned data.";
const LIBRARY_ENTITY_HELP =
  "Entities are searchable library objects such as built-in monsters, items, spells, races, castes, icons, pictures, sounds, and special land tiles.";
const LIBRARY_ASSET_HELP =
  "Assets are previewable reference resources. A library asset can satisfy a Realmz fallback or paint/reference picker, but it only exports when the scenario owns or imports its own resource.";
const LIBRARY_DIAGNOSTIC_HELP =
  "Diagnostics report library parsing, trailing bytes, missing previews, or confidence gaps. They are developer/reference health notes, not current scenario validation errors.";
const LIBRARY_EMPTY_HELP =
  "If the catalog is missing, Providence has not loaded the bundled library manifest yet. Project editing can continue, but reference previews and built-in pickers will be incomplete until it loads.";

export function LibraryHubPanel({
  workspace,
  catalog
}: {
  workspace: ProvidenceWorkspace | null;
  catalog: LibraryCatalog | null;
}) {
  const [sourceQuery, setSourceQuery] = useState("");
  const normalizedSourceQuery = sourceQuery.trim().toLowerCase();
  const matchingSources = useMemo(() => (catalog?.sources ?? []).filter((source) => {
    if (!normalizedSourceQuery) return true;
    return `${source.relativePath} ${source.sourceKind} ${source.role}`.toLowerCase().includes(normalizedSourceQuery);
  }), [catalog?.sources, normalizedSourceQuery]);
  const [sourceLimit, showMoreSources] = useIncrementalListLimit(
    LIBRARY_SOURCE_STEP,
    `${catalog?.importedAt ?? "none"}:${normalizedSourceQuery}`
  );
  const [diagnosticLimit, showMoreDiagnostics] = useIncrementalListLimit(
    LIBRARY_DIAGNOSTIC_STEP,
    catalog?.importedAt ?? "none"
  );
  const visibleSources = matchingSources.slice(0, sourceLimit);
  const visibleDiagnostics = (catalog?.diagnostics ?? []).slice(0, diagnosticLimit);

  return (
    <section className="library-hub">
      <PanelHeader
        className="library-hero"
        headingLevel={1}
        leading={<LibraryBig size={30} />}
        title={(
          <TutorialTip title="Library Workbench" body={LIBRARY_WORKBENCH_HELP} side="below">
            <span>Library Workbench</span>
          </TutorialTip>
        )}
        description="Bundled Divinity and Realmz reference data for tools that should work even before a scenario is loaded."
      />
      <p className="library-note">
        <TutorialTip title="Bundled Reference Data" body={LIBRARY_PACKAGE_HELP} side="below">
          <span>Realmz stock assets and Providence's protected built-in custom assets are packaged with the app. Rebuild this catalog from source only during developer asset updates.</span>
        </TutorialTip>
      </p>
      <div className="library-summary-grid">
        <SummaryCard label="Sources" value={catalog?.summary.sourceCount ?? 0} help={LIBRARY_SOURCE_HELP} />
        <SummaryCard label="Records" value={catalog?.summary.recordCount ?? 0} help={LIBRARY_RECORD_HELP} />
        <SummaryCard label="Entities" value={catalog?.summary.entityCount ?? 0} help={LIBRARY_ENTITY_HELP} />
        <SummaryCard label="Assets" value={catalog?.summary.assetCount ?? 0} help={LIBRARY_ASSET_HELP} />
        <SummaryCard label="Diagnostics" value={catalog?.summary.diagnosticCount ?? 0} help={LIBRARY_DIAGNOSTIC_HELP} />
      </div>
      <section className="library-section">
        <header>
          <TutorialTip title="Managed Catalog" body={LIBRARY_SOURCE_HELP} side="below">
            <span>Managed Catalog</span>
          </TutorialTip>
          <small>{workspace?.managedLibraryPath ?? "No workspace loaded"}</small>
        </header>
        {catalog ? (
          <>
            <div className="library-source-toolbar">
              <SearchField
                value={sourceQuery}
                onChange={setSourceQuery}
                placeholder="Search catalog sources..."
                ariaLabel="Search managed catalog sources"
                resultCount={matchingSources.length}
                resultNoun="source"
              />
            </div>
            <div className="library-source-list">
              {visibleSources.map((source) => (
                <EntityRow
                  key={source.id}
                  icon={<FileArchive size={14} />}
                  title={source.relativePath}
                  subtitle={`${source.sourceKind} | ${source.role}`}
                  meta={`${source.bytes.toLocaleString()} bytes`}
                />
              ))}
              {matchingSources.length === 0 && <p className="empty-copy compact">No managed catalog sources match that search.</p>}
            </div>
            <IncrementalListFooter
              visibleCount={visibleSources.length}
              totalCount={matchingSources.length}
              step={LIBRARY_SOURCE_STEP}
              noun="source"
              onShowMore={showMoreSources}
            />
            {catalog.diagnostics.length > 0 && (
              <div className="library-diagnostic-list">
                <IssueGroup
                  title={(
                    <TutorialTip title="Library Diagnostics" body={LIBRARY_DIAGNOSTIC_HELP} side="below">
                      <span>Diagnostics</span>
                    </TutorialTip>
                  )}
                  issues={visibleDiagnostics.map((diagnostic) => ({
                    id: diagnostic.id,
                    severity: libraryDiagnosticTone(diagnostic.severity),
                    message: diagnostic.message,
                    detail: diagnostic.source ?? diagnostic.type
                  }))}
                />
                <IncrementalListFooter
                  visibleCount={visibleDiagnostics.length}
                  totalCount={catalog.diagnostics.length}
                  step={LIBRARY_DIAGNOSTIC_STEP}
                  noun="diagnostic"
                  onShowMore={showMoreDiagnostics}
                />
              </div>
            )}
          </>
        ) : (
          <p className="empty-copy">
            <TutorialTip title="No Managed Catalog" body={LIBRARY_EMPTY_HELP} side="below">
              <span>No managed library catalog yet. Bundled fixtures should seed automatically when the app starts.</span>
            </TutorialTip>
          </p>
        )}
      </section>
    </section>
  );
}

export function libraryDiagnosticTone(severity: string): WorkbenchTone {
  const normalized = severity.trim().toLowerCase();
  if (normalized === "error" || normalized === "fatal") return "danger";
  if (normalized === "warning" || normalized === "warn") return "warning";
  if (normalized === "success") return "success";
  return "info";
}

function SummaryCard({ label, value, help }: { label: string; value: number; help: string }) {
  return (
    <article className="library-summary-card">
      <TutorialTip title={label} body={help} side="below">
        <span>{label}</span>
      </TutorialTip>
      <strong>{value.toLocaleString()}</strong>
    </article>
  );
}
