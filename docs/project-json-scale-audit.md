# Project JSON Scale Audit

Status vocabulary: `measured`, `source-backed`, `stale-artifact`, `candidate`.

## Scope

This audit supports `ISY-271` and focuses on why imported Providence projects are much larger than original scenario folders, and which size owners are safe candidates for reduction without changing Realmz import/export semantics.

## Current Measurements

Measured on July 3, 2026 from existing `tmp/` projects.

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

- `rawBytes` is export-critical today. `src-tauri/src/realmz.rs` copies preserved raw records before writing authored fields for maps, messages, battles, monsters, items, shops, encounters, spells, races, castes, scenario shell/support/metadata, and other target records. Removing persisted `rawBytes` requires an alternate source-snapshot/byte-slice model that can reconstruct those preserved bytes during export.
- Browser tooling also reads `rawBytes` for map marker extraction, browser semantic/resource parsing, monster-library decoding, blank-record checks, and exact byte counts in editor panels. Some of those uses could move to helpers that fetch from source slices, but they cannot simply disappear.
- `provenance` is mostly regular source/file/record/offset metadata. It feeds semantic byte ranges, validation/source diagnostics, authored record allocation, and UI source context. It looks more suitable for table compression or load-time rehydration, but authored records and inferred/custom sources need sparse exceptions.

## Repeatable Report

Run:

```powershell
node scripts\report_project_json_scale.mjs --project tmp\performance-smoke\combat-imported-benchmark-project\project.json
```

Pass comma-separated `--project` paths to compare multiple project files. The report shows pretty/minified size, top-level owners, and repeated hot fields such as `provenance`, `rawBytes`, `values`, and `semanticSchema`.
It also prints non-mutating what-if reductions for derived diagnostics and high-volume provenance/raw byte fields so schema proposals can be compared before any migration work.

## Candidate Next Steps

- Decide whether per-record `provenance` can be represented as shared source/file/stride metadata plus sparse exceptions.
- Decide whether unchanged `rawBytes` arrays should remain embedded in every semantic record or move to a compact source snapshot/byte-slice model.
- Keep `semanticSchema` derived and non-persisted in desktop saves; for browser benchmark projects, keep an empty current-version schema unless the benchmark explicitly needs semantic-link stress.
- Prefer provenance compression before raw-byte removal: it has a larger measured payoff and lower direct export risk.
