import { Component, ComponentType, ErrorInfo, ReactNode, lazy } from "react";

function lazyNamed<T extends ComponentType<any>>(loader: () => Promise<unknown>, exportName: string) {
  return lazy(async () => {
    const module = await loader() as Record<string, T>;
    return { default: module[exportName] };
  });
}

export const LazyCombatPanel = lazyNamed(() => import("../panels/CombatPanel"), "CombatPanel");
export const LazyExportPanel = lazyNamed(() => import("../panels/ExportPanel"), "ExportPanel");
export const LazyLibraryHubPanel = lazyNamed(() => import("../panels/LibraryHubPanel"), "LibraryHubPanel");
export const LazyLinterPanel = lazyNamed(() => import("../panels/LinterPanel"), "LinterPanel");
export const LazyMapsPanel = lazyNamed(() => import("../panels/MapsPanel"), "MapsPanel");
export const LazyPlayerMapsPanel = lazyNamed(() => import("../panels/PlayerMapsPanel"), "PlayerMapsPanel");
export const LazyRecordsPanel = lazyNamed(() => import("../panels/RecordsPanel"), "RecordsPanel");
export const LazyResourcesPanel = lazyNamed(() => import("../panels/ResourcesPanel"), "ResourcesPanel");
export const LazyRulesPanel = lazyNamed(() => import("../panels/RulesPanel"), "RulesPanel");
export const LazyScenarioPanel = lazyNamed(() => import("../panels/ScenarioPanel"), "ScenarioPanel");
export const LazyScriptingPanel = lazyNamed(() => import("../panels/ScriptingPanel"), "ScriptingPanel");
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
  { hasError: boolean; errorMessage: string | null }
> {
  state = { hasError: false, errorMessage: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error?.message ?? "Unknown editor load error" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Workbench chunk failed to load", error, info);
    this.setState({ errorMessage: error?.message ?? String(error ?? "Unknown editor load error") });
  }

  componentDidUpdate(prevProps: { resetKey?: string }) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, errorMessage: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="panel-card workbench-loading" role="alert">
          <div className="section-kicker">Could Not Load</div>
          <h2>This editor section could not be opened.</h2>
          <p>Try switching tools again, or reload the app if this keeps happening.</p>
          {isDevelopmentRuntime() && (
            <details className="advanced-details">
              <summary>Developer Details</summary>
              <p>{this.state.errorMessage ?? "No error details were reported."}</p>
            </details>
          )}
        </section>
      );
    }
    return this.props.children;
  }
}

function isDevelopmentRuntime() {
  return Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
}
