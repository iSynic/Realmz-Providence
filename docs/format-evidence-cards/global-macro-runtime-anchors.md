# Global Macro Runtime Anchors

## User-Facing Unlock

This card unlocks a Scenario/Scripts editor surface for global macro hooks. Providence can show source-backed slots for scenario start, party death, quitting/end-game, shop entry, and temple entry, with macro target pickers that resolve to callable `Data ED3` rows. Unproven slots remain preserved evidence until Divinity binary or additional Realmz source anchors explain them.

## Realmz Anchors

- `F:\Realmz\src\realmz_orig\variables.h:71`: declares `globalmacro[30]`.
- `F:\Realmz\src\realmz_orig\main.c:114`: defines the 30-slot global macro array.
- `F:\Realmz\src\realmz_orig\handlemenuchoice.c:1195-1211`: reads `Global`, converts 30 signed shorts, and starts a new game with `globalmacro[0]`.
- `F:\Realmz\src\realmz_orig\misc.c:510-512`: `mainscreeninit` executes the start hook when `dostart` is true.
- `F:\Realmz\src\realmz_orig\partyloss.c:15-24`: party-loss flow executes `globalmacro[1]`; `-1`/revive flags can avoid the loss path.
- `F:\Realmz\src\realmz_orig\handlemenuchoice.c:1227-1235`: end-current-game flow executes `globalmacro[2]` before loss/end handling.
- `F:\Realmz\src\realmz_orig\buttonchoice.c:419-421`: shop button executes `globalmacro[4]` before shop entry.
- `F:\Realmz\src\realmz_orig\buttonchoice.c:435-437`: temple path executes `globalmacro[5]` before temple entry.
- `F:\Realmz\src\realmz_orig\editstring.c:105-125`: `Global` is read as 30 big-endian signed shorts.

## Byte Layout

`Global` is one 60-byte authored source file containing 30 big-endian signed shorts. Each nonzero short is a macro door ID consumed by specific runtime entry points when the slot has a source-backed consumer.

| Slot | Offset | Meaning | Runtime Confidence |
| ---: | ---: | --- | --- |
| 0 | 0 | Start game macro | source-backed |
| 1 | 2 | Party death macro | source-backed |
| 2 | 4 | End/quit game macro | source-backed |
| 3 | 6 | Preserved slot | consumer not found |
| 4 | 8 | Before shop macro | source-backed |
| 5 | 10 | Before temple macro | source-backed |
| 6-29 | 12-58 | Preserved slots | consumer not found |

## Corpus Evidence

The local output corpus under `F:\Realmz\out_win_clang\Scenarios` has `Global` in 28 of 28 checked scenarios, always 60 bytes.

Representative nonzero examples:

- `Wrath of the Mind Lords`: slots `0=19`, `1=60`, `2=19`, and unproven slot `29=1`.
- `Hax`: slots `0=142`, `1=142`, `2=142`.
- `War`: slots `1=182`, `2=238`.
- `The End Worlds`: slot `0=2`, and unproven slot `29=1`.
- `Half Truth`: slot `0=58`, and unproven slot `29=1`.
- `Trouble`: slot `2=83`.
- `Mithril Vault`: unproven slot `3=58`.
- `Price of Power`: unproven slot `29=1`.

The broader 44-scenario inventory also reports `Global` in every analyzed scenario.

## Providence Current Support

- `Global` is tracked as a fixed 60-byte source file.
- Desktop semantic import parses it as a `global-macro` entity with 30 decoded slots.
- Browser import mirrors the same layout and slot labels.
- Source-backed nonzero slots link to `macro:<door>` targets so ED3 reachability can treat them as callable macro roots.
- Unproven nonzero slots remain visible as preserved source evidence and should not be offered as executable hook targets yet.

## Editor Follow-Up

- Scenario tool: add a compact Global Macro Hooks section with rows for source-backed slots.
- Scripts tool: let macro target pickers include macros reached from source-backed Global slots.
- Validation: warn when a source-backed nonzero hook points to a missing `Data ED3` row.
- Validation: label nonzero unproven slots as preserved data with no confirmed runtime consumer.
- Writer: update only the 30 owned signed-short slots, preserving file size and signed big-endian encoding.

## Divinity Evidence Needed

- Confirm Divinity labels/defaults for slots 0-5.
- Determine whether Divinity exposes slots 3 or 6-29, or whether those are legacy/padding/runtime flags.
- Capture the Scenario Data / Global Macro UI write behavior from the Mac binary before making all 30 slots user-editable.
