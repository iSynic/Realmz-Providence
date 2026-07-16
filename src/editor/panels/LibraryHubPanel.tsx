import { FileArchive, LibraryBig } from "lucide-react";
import { TutorialTip } from "../components/TutorialTip";
import { LibraryCatalog, ProvidenceWorkspace } from "../types";
import { PanelHeader } from "../ui";

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
          <span>Realmz and Divinity reference assets are packaged with Providence. Rebuild this catalog from source only during developer asset updates.</span>
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
            <div className="library-source-list">
              {catalog.sources.slice(0, 80).map((source) => (
                <article key={source.id}>
                  <FileArchive size={14} />
                  <div>
                    <strong>{source.relativePath}</strong>
                    <small>{source.sourceKind} | {source.role} | {source.bytes.toLocaleString()} bytes</small>
                  </div>
                </article>
              ))}
            </div>
            {catalog.diagnostics.length > 0 && (
              <div className="library-diagnostic-list">
                <TutorialTip title="Library Diagnostics" body={LIBRARY_DIAGNOSTIC_HELP} side="below">
                  <span className="subsection-label">Diagnostics</span>
                </TutorialTip>
                {catalog.diagnostics.slice(0, 6).map((diagnostic) => (
                  <article key={diagnostic.id}>
                    <strong>{diagnostic.severity}</strong>
                    <span>{diagnostic.message}</span>
                  </article>
                ))}
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
