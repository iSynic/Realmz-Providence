export type CoverageStatus =
  | "decoded-writable"
  | "decoded-readonly"
  | "preserved-known"
  | "preserved-unknown"
  | "runtime-cache"
  | "ignored-non-scenario"
  | "unknown-active-risk"
  | "understood-resource-container"
  | "decoded-resource-payload"
  | "preserved-standard-media-payload"
  | "custom-media-payload"
  | "needs-codec-work";

export type ScenarioCoverageContainer = {
  container: string;
  label: string;
  status: string;
  coverageStatus: CoverageStatus;
  count: number;
  sizes: number[];
  policy: string;
};

export type ScenarioCoverageRisk = {
  id: string;
  family: string;
  priority: number;
  status: string;
  summary: string;
  evidenceCard: string | null;
};

export type ScenarioCoverageManifest = {
  schemaVersion: number;
  generatedAt: string;
  summary: {
    scenarioRoots: number;
    fileFamilies: number;
    ignoredNonScenarioFiles: number;
    editableContainers: number;
    preservedContainers: number;
    understoodResourceContainers?: number;
    resourceCoverage?: {
      resourceForkFiles: number;
      parsedResourceForks: number;
      resourceEntries: number;
      payloadBytesByStatus: Record<string, number>;
    } | null;
    targetCompatibility?: {
      macClassicScenarios: number;
      windowsRealmzScenarios: number;
      targetCompatibilityIssues: number;
      warnings: number;
      errors: number;
    } | null;
    completeness?: {
      scenarioSemanticOwnership: {
        status: string;
        observedBytes: number;
        totalObservedBytes: number;
        activeRiskBytes: number;
        note: string;
      };
      resourceContainerOwnership: {
        status: string;
        parsedResourceForks: number;
        resourceForkFiles: number;
        resourceEntries: number;
      };
      mediaCodecInternals: {
        status: string;
        preservedOrCustomPayloadBytes: number;
        decodedResourcePayloadBytes: number;
        note: string;
      };
    };
    dungeon?: {
      status: string;
      bits: number | null;
      writerSafeBits: number | null;
      routedWorkflowBits?: number | null;
      runtimeStateBits: number | null;
      preservedUnknownBits: number | null;
      evidence: string;
    };
    runtimeStateContainers: number;
    needsFormatWork: number;
    ed3: { status: string; recordBytes: number; runtimeCallsites: number | null; evidence: string };
    edcd: { status: string; edcdBackedOpcodes: number | null; fieldComparisonGaps: number | null; evidence: string };
  };
  statusLabels: Record<string, string>;
  topRisks: ScenarioCoverageRisk[];
  containers: ScenarioCoverageContainer[];
};

export async function loadScenarioCoverageManifest(): Promise<ScenarioCoverageManifest> {
  const module = await import("./generated/scenarioCoverageManifest.json");
  return module.default as ScenarioCoverageManifest;
}
