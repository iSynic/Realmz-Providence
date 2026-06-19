# Providence Evidence Lab

The Evidence Lab records how Divinity mutates Realmz scenario files. It is an archaeology workflow, not an editor feature: a fixture captures a scenario before a Divinity action, captures it again after exactly one Divinity action, and stores deterministic snapshot and diff evidence.

## Why This Exists

Providence can parse and write many Realmz records, but Divinity remains the canonical authoring reference for subtle behaviors. Evidence Lab fixtures let us say:

- what Divinity changed byte-for-byte;
- which resource fork entries changed;
- which file or decoded record family probably owns the change;
- which parts remain unknown instead of guessed.

This gives us durable writer targets without relying on memory, screenshots, or one-off manual inspection.

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
npm run archaeology:prepare-divinity-fixture -- strings-sound-field-change --baseline "C:\Path\To\Baseline Scenario" --action "Change one string sound field in Divinity."
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

## Interpreting Diffs

The diff command reports exact byte ranges and resource entry changes. It also labels known file families such as maps, monsters, messages, and action points when the file name is known. Unknown changes stay marked as raw byte changes until a parser or writer test proves a better interpretation.

An evidence card means “Divinity did this.” It does not mean Providence can safely write the same change until a matching writer test exists.
