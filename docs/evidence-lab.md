# Providence Evidence Lab

The Evidence Lab records how Divinity mutates Realmz scenario files. It is an archaeology workflow, not an editor feature: a fixture captures a scenario before a Divinity action, captures it again after exactly one Divinity action, and stores deterministic snapshot and diff evidence.

## Why This Exists

Providence can parse and write many Realmz records, but Divinity remains the canonical authoring reference for subtle behaviors. Evidence Lab fixtures let us say:

- what Divinity changed byte-for-byte;
- which resource fork entries changed;
- which file or decoded record family probably owns the change;
- which parts remain unknown instead of guessed.

This gives us durable writer targets without relying on memory, screenshots, or one-off manual inspection.

## Eligibility Gate

Evidence Lab is for named compatibility blockers only. Before preparing a fixture or report, write a short task brief that names:

- **Behavior to prove**: the exact runtime/editor behavior in doubt.
- **Scenario or tool used**: the specific scenario, synthetic fixture, Divinity screen, Realmz source path, or Providence report that will produce evidence.
- **Providence decision unlocked**: the authoring, validation, export, UI-label, or preserve-only decision that depends on the result.
- **Evidence confidence target**: `runtime-proven`, `Divinity-editor behavior`, `fixture-gated`, or `corpus breadth only`.
- **Artifact policy**: whether the work may commit only docs/reports, synthetic fixtures, or no artifacts.

If a task cannot fill those fields, do not run Evidence Lab yet. Capture the uncertainty in `docs/archaeology-priorities.md` or the relevant Linear issue instead.

Current named blocker candidates:

| Blocker | Behavior to prove | Scenario/tool | Providence decision unlocked |
| --- | --- | --- | --- |
| Opcode 84 manual/source discrepancy | Whether Divinity's manual wording maps to actual Realmz runtime behavior or an editor-only/imported state | Realmz source plus AP action-gap report, with a fixture only if source stays ambiguous | Keep opcode 84 preserve-only, relabel it, or promote a first-class action form |
| Opcode 7 action-code replacement | Whether Divinity rewrites opcode 7 into another action code or uses it directly in saved scenarios | Divinity before/after fixture against a synthetic AP row | Decide whether Providence should expose opcode 7 authoring or only preserve/import it |
| Timed Encounter `Data TD3` reserved fields | Whether `stuff[1..9]` affect runtime beyond preserved compatibility data | Realmz source, `report_timed_encounter_reserved_fields`, and fixtures only for a named nonzero pattern | Keep compatibility data collapsed/read-only or promote named authoring fields |
| Recognized scenario continuity facts | Whether a story-flow claim is strong enough to become curated context | Decoded scenario strings/scripts, developer reports, or cited walkthrough-derived notes | Add or withhold read-only curated Story Flags context |

Evidence Lab output is developer-facing. It may inform normal UI, but raw fixture diffs and archaeology reports should not become author-facing copy.

## Commands

Create a canonical snapshot of a scenario folder:

```powershell
npm run archaeology:snapshot -- "C:\Path\To\Scenario" --out tmp\scenario.snapshot.json --label "Scenario before edit"
```

Diff two canonical snapshots:

```powershell
npm run archaeology:diff-snapshots -- --before before.snapshot.json --after after.snapshot.json --out diff.json --markdown-out diff.md
```

Prepare a manual Divinity fixture:

```powershell
npm run archaeology:prepare-divinity-fixture -- strings-sound-field-change --baseline "C:\Path\To\Baseline Scenario" --action "Change one string sound field in Divinity." --behavior "String Sound field write location" --scenario-tool "Divinity Strings editor on synthetic scenario" --decision "Decide whether Providence exposes per-string sound authoring"
```

Capture the edited scenario after Divinity saves it:

```powershell
npm run archaeology:capture-divinity-fixture -- strings-sound-field-change --after "C:\Path\To\Edited Scenario"
```

Generate the fixture diff and evidence card:

```powershell
npm run archaeology:diff-divinity-fixture -- strings-sound-field-change
```

## Fixture Layout

Fixtures live under `fixtures/divinity-write-fixtures/<fixture-id>/`:

- `metadata.json`: fixture title, status, intended Divinity action, and output paths.
- `README.md`: human workflow checklist.
- `before/`: baseline scenario folder, only when intentionally captured.
- `after/`: Divinity-edited scenario folder, only when intentionally captured.
- `before.snapshot.json`: deterministic snapshot with raw bytes embedded.
- `after.snapshot.json`: deterministic snapshot with raw bytes embedded.
- `diff.json`: machine-readable before/after diff.
- `diff.md`: human-readable before/after diff.

Evidence cards live under `docs/evidence-cards/<fixture-id>.md`.

## Safety Rules

Do not commit proprietary scenario folders, Divinity binaries, Mac OS files, or CD assets unless the fixture was intentionally made from synthetic or otherwise redistributable data. Placeholder fixtures are allowed and preferred until we have clean redistributable inputs.

The snapshot format embeds raw data fork and resource fork bytes so diffs are self-contained. That is useful evidence, but it also means snapshot files can contain scenario content. Treat them with the same care as the original scenario folder.

For proprietary or user-owned scenarios, commit only developer-facing summaries that cite the local artifact path and the observed conclusion. Keep raw `before/`, `after/`, `*.snapshot.json`, and `diff.json` files under `tmp/` or another uncommitted location unless redistribution is explicitly safe.

## Interpreting Diffs

The diff command reports exact byte ranges and resource entry changes. It also labels known file families such as maps, monsters, messages, and action points when the file name is known. Unknown changes stay marked as raw byte changes until a parser or writer test proves a better interpretation.

An evidence card means “Divinity did this.” It does not mean Providence can safely write the same change until a matching writer test exists.
