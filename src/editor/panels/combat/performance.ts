import { useEffect, useRef } from "react";

type CombatPerfWindow = Window & {
  __providenceCombatPerf?: Array<{ label: string; durationMs: number; at: number }>;
};

function combatBenchmarkEnabled() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("benchmarkCombat");
}

export function recordCombatPerf(label: string, durationMs: number) {
  if (!combatBenchmarkEnabled()) return;
  const target = window as CombatPerfWindow;
  const entry = { label, durationMs, at: performance.now() };
  target.__providenceCombatPerf = [...(target.__providenceCombatPerf ?? []), entry].slice(-500);
  if (durationMs >= 4) console.debug(`[combat-perf] ${label}: ${durationMs.toFixed(1)}ms`);
}

export function measureCombatWork<T>(label: string, work: () => T): T {
  if (!combatBenchmarkEnabled()) return work();
  const startedAt = performance.now();
  try {
    return work();
  } finally {
    const durationMs = performance.now() - startedAt;
    recordCombatPerf(label, durationMs);
    performance.measure?.(`combat:${label}`, {
      start: startedAt,
      end: startedAt + durationMs
    });
  }
}

export function useCombatRenderTiming(label: string) {
  const startedAtRef = useRef(0);
  if (combatBenchmarkEnabled()) startedAtRef.current = performance.now();
  useEffect(() => {
    if (!startedAtRef.current) return;
    recordCombatPerf(`${label} render`, performance.now() - startedAtRef.current);
  });
}
