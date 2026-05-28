import { Component, ComponentType, ErrorInfo, ReactNode, lazy } from "react";

function lazyNamed<T extends ComponentType<any>>(loader: () => Promise<unknown>, exportName: string) {
  return lazy(async () => {
    const module = await loader() as Record<string, T>;
    return { default: module[exportName] };
  });
}

export const LazyEncountersPanel = lazyNamed(() => import("../panels/EncountersPanel"), "EncountersPanel");
export const LazyExportPanel = lazyNamed(() => import("../panels/ExportPanel"), "ExportPanel");
export const LazyLibraryHubPanel = lazyNamed(() => import("../panels/LibraryHubPanel"), "LibraryHubPanel");
export const LazyLinterPanel = lazyNamed(() => import("../panels/LinterPanel"), "LinterPanel");
export const LazyMapsPanel = lazyNamed(() => import("../panels/MapsPanel"), "MapsPanel");
export const LazyRecordsPanel = lazyNamed(() => import("../panels/RecordsPanel"), "RecordsPanel");
export const LazyResourcesPanel = lazyNamed(() => import("../panels/ResourcesPanel"), "ResourcesPanel");
export const LazyRulesPanel = lazyNamed(() => import("../panels/RulesPanel"), "RulesPanel");
export const LazyScenarioPanel = lazyNamed(() => import("../panels/ScenarioPanel"), "ScenarioPanel");
export const LazyScriptsPanel = lazyNamed(() => import("../panels/ScriptsPanel"), "ScriptsPanel");
export const LazySuiteDomainPanel = lazyNamed(() => import("../panels/SuiteDomainPanel"), "SuiteDomainPanel");
export const LazyTextPanel = lazyNamed(() => import("../panels/TextPanel"), "TextPanel");
export const LazyDocumentsView = lazyNamed(() => import("../views/DocumentsView"), "DocumentsView");

export function WorkbenchLoading({ label = "Loading editor..." }: { label?: string }) {
  return (
    <section className="panel-card workbench-loading" aria-live="polite">
      <div className="section-kicker">Loading</div>
      <h2>{label}</h2>
    </section>
  );
}

export class WorkbenchChunkErrorBoundary extends Component<
  { children: ReactNode; resetKey?: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Workbench chunk failed to load", error, info);
  }

  componentDidUpdate(prevProps: { resetKey?: string }) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="panel-card workbench-loading" role="alert">
          <div className="section-kicker">Could Not Load</div>
          <h2>This editor section could not be opened.</h2>
          <p>Try switching tools again, or reload the app if this keeps happening.</p>
        </section>
      );
    }
    return this.props.children;
  }
}
