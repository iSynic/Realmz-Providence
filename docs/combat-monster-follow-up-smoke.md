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

## Monster Sets And Export

- Generate Monster and Mega variants for a scenario monster.
- Switch Battle preview between Normal, Monster, and Mega and confirm the displayed icon/stats change without changing the battle grid monster IDs.
- Export the scenario and confirm `Data MD1` and `Data MD-1` are emitted when authored.
- Confirm Providence Monster Library data is not exported as a Realmz scenario file.
