export type CoverageStatus =
  | "decoded-writable"
  | "decoded-readonly"
  | "mixed-writable-preserved"
  | "preserved-known"
  | "preserved-unknown"
  | "runtime-cache"
  | "ignored-non-scenario"
  | "unknown-active-risk"
  | "understood-resource-container"
  | "decoded-resource-payload"
  | "preserved-standard-media-payload"
  | "custom-media-payload"
  | "needs-codec-work"
  | "understood-runtime-writer-gated";

export type ContainerTruthStatus = {
  semanticOwnership: "complete" | "mixed" | "runtime-only" | "ignored" | "needs-format-work";
  writerReadiness: "fixture-proven" | "partially-proven" | "writer-gated" | "read-only" | "preserve-only" | "not-applicable";
  evidenceQuality: "cited" | "fixture-backed" | "missing-evidence" | "skipped-fixture" | "target-warning";
  riskFlags: string[];
};

export type ScenarioCoverageContainer = {
  container: string;
  label: string;
  status: string;
  coverageStatus: CoverageStatus;
  truth?: ContainerTruthStatus | null;
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
    functionalAuthoringReadiness?: {
      status: string;
      readySystems: number;
      totalSystems: number;
      functionalBlockers: number;
      blockerIds: string[];
    } | null;
    strictCompleteness?: {
      scenarioSemantics: {
        label: string;
        status: string;
        completeContainers: number;
        mixedContainers: number;
        needsFormatWorkContainers: number;
        percentContainers: number;
      };
      writerProvenData: {
        label: string;
        status: string;
        fixtureProvenContainers: number;
        partiallyProvenContainers: number;
        writerGatedContainers: number;
        percentContainers: number;
      };
      packageCompatibility: {
        label: string;
        status: string;
        targetCompatibilityIssues: number;
        warnings: number;
        errors: number;
      };
      codecInternals: {
        label: string;
        status: string;
        preservedOrCustomPayloadBytes: number;
        decodedResourcePayloadBytes: number;
      };
      strictOutstanding: {
        writerGatedContainers: number;
        missingEvidenceContainers: number;
        skippedFixtureContainers: number;
        preservedUnknownContainers: number;
        targetWarnings: number;
        backlogRisks: number;
      };
    };
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
    ed3: {
      status: string;
      recordBytes: number;
      writerStatus?: string | null;
      semanticExposure?: string | null;
      runtimeCallsites: number | null;
      evidence: string | string[];
    };
    edcd: {
      status: string;
      edcdBackedOpcodes: number | null;
      fieldComparisonGaps: number | null;
      writerStatus?: string | null;
      semanticExposure?: string | null;
      evidence: string | string[];
    };
  };
  statusLabels: Record<string, string>;
  topRisks: ScenarioCoverageRisk[];
  containers: ScenarioCoverageContainer[];
};

export async function loadScenarioCoverageManifest(): Promise<ScenarioCoverageManifest> {
  const module = await import("./generated/scenarioCoverageManifest.json");
  return module.default as ScenarioCoverageManifest;
}
