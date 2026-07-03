# Combat Monster Follow-Up Smoke Checklist

Use this after Combat monster-library or monster-set UI changes. It covers browser-only persistence and export boundaries that are not fully exercised by the command regression script.

## Monster Library Persistence

- Open a browser workspace and load or create a scenario.
- In Combat > Monsters, select a protected built-in Monster Library entry.
- Use `Customize`, edit at least the name or one stat, reload the browser workspace, and confirm the customized override still appears.
- Use `Restore Scrapbook Default`, reload again, and confirm the protected built-in fallback returns.
- Use `Copy To Library Variant`, reload, and confirm the variant persists.

## Copy And Replace

- Drag a Monster Library entry into Scenario Monsters and confirm it creates or selects the default non-destructive target slot.
- Drag a Scenario Monster into Monster Library and confirm it creates a reusable Providence library entry.
- Drag a Monster Library entry onto the Monster Library pane and confirm it duplicates or variants the entry.
- Select an occupied Scenario Monster, return to a Monster Library entry, use `Replace Scenario N`, and confirm only that explicit target slot changes.
- Place a scenario monster in Combat > Battles, return to Combat > Monsters, and confirm the selected monster shows the battle-reference affordance.
- Use a destructive clear/switch action on a referenced scenario monster and confirm the repair modal offers cancel, clear placements, replacement, and record-only behavior as appropriate.

## Monster Sets And Export

- Generate Monster and Mega variants for a scenario monster.
- Switch Battle preview between Normal, Monster, and Mega and confirm the displayed icon/stats change without changing the battle grid monster IDs.
- Export the scenario and confirm `Data MD1` and `Data MD-1` are emitted when authored.
- Confirm Providence Monster Library data is not exported as a Realmz scenario file.

## Battle Runtime Cap

- Create or select a dense battle and confirm the grid counter tracks nonzero `Data BD` cells as loaded monster anchors.
- Confirm painting the 101st nonzero battle cell is blocked by validation and export rejects authored over-cap battles.
- Confirm large/tall/wide monster footprint previews do not increase the counter unless another anchor cell is written.

## Monster Icon Targets

- In Combat > Icon Set, confirm default target rows are visible with `Default art` badges but do not count as scenario-owned overrides.
- Replace a default target with a Monster Mash or Providence Icon Library source and confirm exactly one scenario override appears.
- Delete that override and confirm the target falls back to default art when available.
- Import a scenario-owned paired monster icon set and confirm both `cicn base` and `base + 308` are preserved as one target override.
- Confirm incomplete scenario-owned pairs produce diagnostics and do not create blank target rows.
