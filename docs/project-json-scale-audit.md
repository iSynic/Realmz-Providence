# Project JSON Scale Audit

Status vocabulary: `measured`, `source-backed`, `stale-artifact`, `candidate`.

## Scope

This audit supports `ISY-271` and focuses on why imported Providence projects are much larger than original scenario folders, and which size owners are safe candidates for reduction without changing Realmz import/export semantics.

## Current Measurements

Measured on July 3, 2026 from existing `tmp/` projects.

The measurements below are historical. The authoritative-compiler work subsequently
moved imported byte identity out of the completed canonical record families and into
the bounded compatibility annex. The architecture notes below describe the current
state as of July 20, 2026.

| Sample | Pretty JSON | Minified JSON | Main owners | Status |
| --- | ---: | ---: | --- | --- |
| `tmp/oracle-runs/.../War in the Sword Lands.providence/project.json` | 220.98 MB | 116.92 MB | `semanticSchema` 100.85 MB, provenance 7.43 MB, values arrays 5.00 MB | stale-artifact |
| `tmp/performance-smoke/combat-imported-benchmark-project/project.json` before compact benchmark writer | 49.43 MB | 21.37 MB | provenance 7.31 MB, `rawBytes` 2.33 MB, values arrays 2.02 MB, tiles 0.64 MB | measured |
| `tmp/performance-smoke/combat-benchmark-project/project.json` before compact benchmark writer | 9.13 MB | 3.10 MB | `rawBytes` 0.88 MB, provenance 0.19 MB, tiles 0.09 MB | measured |
| `tmp/performance-smoke/combat-imported-benchmark-project/project.json` after compact benchmark writer | 21.37 MB | 21.37 MB | same semantic data, no pretty-print overhead | measured |
| `tmp/performance-smoke/combat-benchmark-project/project.json` after compact benchmark writer | 3.10 MB | 3.10 MB | same semantic data, no pretty-print overhead | measured |

## Findings

- Current desktop `save_project` writes compact JSON with `serde_json::to_writer`, and `src-tauri/src/importer.rs` has a test proving saved `project.json` omits derived `semanticSchema`.
- Very large `tmp/oracle-runs` projects are old/stale artifacts because they persist `semanticSchema`; they should not be treated as current desktop-save behavior.
- The smoke performance benchmark builder was still writing pretty JSON and could carry stale derived semantic data from a source project. It now writes compact JSON and replaces benchmark `semanticSchema` with an empty current-version schema.
- After the benchmark writer change, `npm run smoke:ui:performance -- --combat-benchmark` passes with no warnings. `--combat-imported-benchmark` passes with four warnings: cold open 1738 ms, Combat Monsters tab open 414 ms, monster selection 2 at 150 ms, and monster selection 3 at 216 ms.
- Current persisted size pressure in representative imported-heavy projects is mostly repeated provenance objects, raw byte arrays, `values` arrays, and tile arrays. These are real schema questions, unlike pretty-print overhead.
- Non-mutating estimates on `tmp/performance-smoke/combat-imported-benchmark-project/project.json` show that dropping all per-record `provenance` fields would save about 8.29 MB, dropping all `rawBytes` fields would save about 2.37 MB, and dropping both would reduce the compact file from 21.37 MB to about 10.71 MB. This is a diagnostic estimate only; it does not prove those fields are safe to remove.

## Consumption Map

- The compatibility annex is now the export-critical source of imported byte identity for completed canonical families. Untouched legacy records can still round-trip exactly; authored records compile from semantic fields and preserve only explicitly bounded unsupported annex data.
- `ScenarioSupportFile.rawBytes` is the remaining embedded scenario-record identity payload. Scenario shell and security-backup records now compile from semantic fields, while imported singleton identity and malformed suffixes live in the annex.
- Browser tooling still reads raw import buffers and library/evidence payloads for parsing, diagnostics, and reusable source assets. Those uses are separate from keeping raw bytes embedded in canonical scenario records.
- `provenance` is mostly regular source/file/record/offset metadata. It feeds semantic byte ranges, validation/source diagnostics, authored record allocation, and UI source context. It looks more suitable for table compression or load-time rehydration, but authored records and inferred/custom sources need sparse exceptions.

## Decision

- Keep `semanticSchema` as a derived cache, not persisted project state. Current desktop saves already follow this rule; old `tmp/oracle-runs` projects with persisted semantic data are stale scale artifacts.
- Treat benchmark JSON size separately from project schema size. Benchmark projects should stay compact and carry an empty current-version `semanticSchema` unless a specific smoke test is intentionally measuring semantic-link stress.
- The authoritative-compiler compatibility annex now provides the source-snapshot boundary this audit required. Completed record families no longer keep imported identity bytes in their canonical DTOs.
- Finish the support-file compiler boundary before declaring scenario-record byte identity fully removed from the canonical model. Keep raw payloads only where they are intentionally import evidence, library data, or the bounded compatibility annex.
- Leave `values` arrays and map tile compaction as secondary work after provenance. They are real contributors, but their measured savings are smaller and the current invalidation pain is better addressed by reducing repeated provenance and avoiding derived semantic payloads.

## Implementation Follow-Up

- Continue the current compatibility contract: UI source context, allocation diagnostics, untouched-import identity, and authored export behavior must remain equivalent while record DTOs become semantic-only.
- The remaining source-byte follow-up is the 600-byte scenario support file. Its semantic writer and annex overlay must prove fresh authored output, untouched legacy identity, and deterministic authored rewrite before `ScenarioSupportFile.rawBytes` is removed.

## Repeatable Report

Run:

```powershell
node scripts\report_project_json_scale.mjs --project tmp\performance-smoke\combat-imported-benchmark-project\project.json
```

Pass comma-separated `--project` paths to compare multiple project files. The report shows pretty/minified size, top-level owners, and repeated hot fields such as `provenance`, `rawBytes`, `values`, and `semanticSchema`.
It also prints non-mutating what-if reductions for derived diagnostics and high-volume provenance/raw byte fields so schema proposals can be compared before any migration work.

## Deferred Questions

- How much provenance should be stored as compact project state versus rebuilt entirely at load time from source snapshots?
- Which browser-only raw byte readers should be moved behind source-slice helpers before a byte-slice model is attempted?
- Should tile arrays get run-length or domain-specific compression after provenance has been reduced?
