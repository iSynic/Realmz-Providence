# Global Macro Runtime Anchors

## User-Facing Unlock

This card unlocks Divinity's author-facing Global Macros workflow. The Scenario Data screen assigns Extra Action Point scripts to scenario start, party death, quitting/end-game, the Shop button, and the Temple button. Providence exposes those five assignments in Scenario and shows their assigned `Data ED3` rows through a filtered Global Macros view in Action Points. Unproven slots remain preserved evidence.

## Divinity Manual Evidence

The bundled Divinity manual documents a **Global Macros** section inside **Scenario Startup Information**. It says authors script an Extra Action Point and assign it to one of five automatic times in the Scenario Data screen:

- Start: when the player starts a new adventure.
- Death: when the party is killed.
- Quit: when the player quits without dying.
- Shops: when the player clicks the Shop button; direct scripted shop entry does not run it.
- Temples: when the player clicks the Temple button.

The manual does not define a separate Global Event record or editor. Global Macro scripts are ordinary Extra Action Point rows selected by the five Scenario Data fields.

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

The combined local corpus under `F:\Realmz\base\Realmz\Scenarios` and `F:\Realmz\out_win_clang\Scenarios` contains 37 unique scenarios with a 60-byte `Global` file. Fourteen have any nonzero slot, but only eight use a source-backed Global Macro slot.

Observed source-backed usage is limited to Start, Death, and Quit:

- Start: 6 scenarios.
- Death: 4 scenarios.
- Quit: 5 scenarios.
- Shop: 0 scenarios.
- Temple: 0 scenarios.

This makes Global Macros a real but optional authoring feature. Most scenarios leave all five assignments at zero.

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

- Scenario tool: present Divinity's five Global Macro X-AP assignments with searchable Extra Action Point pickers.
- Scripts tool: treat Global Macros as a filtered view of assigned Extra Action Points, not a separate record type.
- Validation: warn when a source-backed nonzero hook points to a missing `Data ED3` row.
- Validation: label nonzero unproven slots as preserved data with no confirmed runtime consumer.
- Writer: update only the 30 owned signed-short slots, preserving file size and signed big-endian encoding.

## Remaining Evidence Needed

- Determine why unconsumed slot 3 is nonzero in `Mithril Vault`.
- Determine why slot 29 is `1` in ten scenarios and whether it is editor metadata, a compatibility flag, or runtime state.
- Keep slots 3 and 6-29 preservation-only unless a source consumer or explicit authoring contract is found.
