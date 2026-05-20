import { Database, FileArchive, FolderDown, LibraryBig } from "lucide-react";
import { LibraryCatalog, ProvidenceWorkspace } from "../types";

export function LibraryHubPanel({
  workspace,
  catalog,
  desktopRuntime,
  browserFileSystem,
  onImportDivinity,
  onImportRealmz
}: {
  workspace: ProvidenceWorkspace | null;
  catalog: LibraryCatalog | null;
  desktopRuntime: boolean;
  browserFileSystem: boolean;
  onImportDivinity: () => void;
  onImportRealmz: () => void;
}) {
  const canImport = desktopRuntime || browserFileSystem;
  return (
    <section className="library-hub">
      <div className="library-hero">
        <LibraryBig size={30} />
        <div>
          <h1>Library Workbench</h1>
          <p>Bundled Divinity and Realmz reference data for tools that should work even before a scenario is loaded.</p>
        </div>
      </div>
      <div className="library-actions">
        <button className="btn btn-primary" type="button" onClick={onImportDivinity} disabled={!canImport}>
          <FolderDown size={16} />
          Refresh From Divinity Folder
        </button>
        <button className="btn" type="button" onClick={onImportRealmz} disabled={!canImport}>
          <Database size={16} />
          Refresh From Realmz Data Folder
        </button>
      </div>
      <div className="library-summary-grid">
        <SummaryCard label="Sources" value={catalog?.summary.sourceCount ?? 0} />
        <SummaryCard label="Records" value={catalog?.summary.recordCount ?? 0} />
        <SummaryCard label="Entities" value={catalog?.summary.entityCount ?? 0} />
        <SummaryCard label="Diagnostics" value={catalog?.summary.diagnosticCount ?? 0} />
      </div>
      <section className="library-section">
        <header>
          <span>Managed Catalog</span>
          <small>{workspace?.managedLibraryPath ?? "No workspace loaded"}</small>
        </header>
        {catalog ? (
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
        ) : (
          <p className="empty-copy">No managed library catalog yet. Bundled fixtures should seed automatically; use refresh only to rebuild from a local source folder.</p>
        )}
      </section>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="library-summary-card">
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </article>
  );
}
