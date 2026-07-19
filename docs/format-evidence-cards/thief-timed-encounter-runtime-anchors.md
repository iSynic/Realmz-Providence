# Runtime Note: Thief/Rogue And Timed Encounter Records

## User-Facing Unlock

This note gives Providence source-backed footing for two important but currently inspect-heavy record families:

- `Data TD2`: thief/rogue encounters used by complex encounters, traps, locks, and thief-skill actions.
- `Data TD3`: timed encounters used for scheduled or conditional macro dispatch.

The immediate editor value is contextual forms, validation, and better links from complex encounters and scripts. Full write UI should come after fixtures because both families mutate through runtime caches during play.

## Runtime Model

Realmz stores source records in the scenario folder:

- `Data TD2` -> runtime `:Data Files:CT`
- `Data TD3` -> runtime `:Data Files:CTD3`

At first start, `setupnewgame` copies source records into runtime caches. Runtime then mutates those caches:

- thief encounters can disable action types, mark traps as detected/disarmed/sprung, and persist that state to `CT`;
- timed encounters update their next `day`, percent, and increment state in `CTD3`;
- saves persist runtime timed encounters as `Data TD3` and runtime thief encounters as `Data H1`.

Providence should edit source `Data TD2` / `Data TD3`, while showing runtime/cache mutations as effective-state evidence.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\structs.h:133` | Defines `struct timeencounter`: 20 shorts, 40 bytes. |
| `F:\Realmz\src\realmz_orig\structs.h:192` | Defines `struct thief`: type flags, modifiers, success/failure codes, text/sound refs, trap spell/damage/tumblers, prompts, sounds. |
| `F:\Realmz\src\realmz_orig\convert.h:86` | `CvtTimeEncounterToPc` treats `timeencounter` as all shorts. |
| `F:\Realmz\src\realmz_orig\convert.c:206` | `CvtThiefToPc` converts thief flags and numeric fields. Writer fixtures are required because it uses legacy broad conversions over adjacent byte arrays. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:140` | First-start copies `Data TD2` into runtime `CT`. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:152` | First-start copies `Data TD3` into runtime `CTD3`. |
| `F:\Realmz\src\realmz_orig\encounters.c:17` | Thief encounter flow loads `CT` by `enc2.thiefsuccess * sizeof thief`. |
| `F:\Realmz\src\realmz_orig\encounters.c:41` | Thief encounter prompt starts with `thief.sound[0]` and `thief.prompt[0]`. |
| `F:\Realmz\src\realmz_orig\encounters.c:80` | Thief action availability combines character skill, `thief.modifer`, and `thief.type`. |
| `F:\Realmz\src\realmz_orig\encounters.c:116` | Thief non-lock actions roll against skill plus modifier. |
| `F:\Realmz\src\realmz_orig\encounters.c:149` | Disarm trap clears `thief.type[9]`. |
| `F:\Realmz\src\realmz_orig\encounters.c:162` | Failed thief actions can spring traps and mutate trap state. |
| `F:\Realmz\src\realmz_orig\encounters.c:222` | Thief encounter mutations are written back to runtime `CT`. |
| `F:\Realmz\src\realmz_orig\encounters.c:753` | Runtime can create/reset a timed encounter in `CTD3`. |
| `F:\Realmz\src\realmz_orig\textbox-time.c:220` | Timed encounter checks scan runtime `CTD3`. |
| `F:\Realmz\src\realmz_orig\textbox-time.c:235` | Timed encounter triggers when `dotime.day == tyme.tm_yday`. |
| `F:\Realmz\src\realmz_orig\textbox-time.c:243` | Triggered timed encounters increment their next day. |
| `F:\Realmz\src\realmz_orig\textbox-time.c:245` | Timed encounter percent chance gates execution. |
| `F:\Realmz\src\realmz_orig\textbox-time.c:247` | Timed encounter item prerequisite uses `recitem`. |
| `F:\Realmz\src\realmz_orig\textbox-time.c:249` | Timed encounter quest prerequisite uses `recquest`. |
| `F:\Realmz\src\realmz_orig\textbox-time.c:252` | `stuff[0]` selects required location kind: land, dungeon, or none. |
| `F:\Realmz\src\realmz_orig\textbox-time.c:265` | Timed encounter can require a random rectangle. |
| `F:\Realmz\src\realmz_orig\textbox-time.c:271` | Timed encounter can require exact X coordinate. |
| `F:\Realmz\src\realmz_orig\textbox-time.c:277` | Timed encounter can require exact Y coordinate. |
| `F:\Realmz\src\realmz_orig\textbox-time.c:369` | If conditions pass, timed encounter executes `newland(..., dotime.door, ...)`. |
| `F:\Realmz\src\realmz_orig\newland.c:3281` | Opcode `54` mutates runtime timed encounter percent, increment, and next day. |
| `F:\Realmz\src\realmz_orig\save-direction-order.c:132` | Save flow persists runtime `CTD3` as save `Data TD3`. |
| `F:\Realmz\src\realmz_orig\save-direction-order.c:150` | Save flow persists runtime `CT` as save `Data H1`. |

## Thief/Rogue Encounter Layout

`Data TD2` records are 118 bytes in the current source/corpus evidence.

| Offset | Size | Field | Notes |
| ---: | ---: | --- | --- |
| 0 | 10 | `type[10]` | Enabled/type state flags. Runtime mutates these; `type[9]` is trap-set state in source paths. |
| 10 | 8 | `modifer[8]` | Skill modifiers for the eight thief action buttons. Source spelling is `modifer`. |
| 18 | 8 | `codes[8]` | Success result codes returned to complex encounter flow. |
| 26 | 8 | `codef[8]` | Failure result codes. |
| 34 | 16 | `texts[8]` | Success message IDs. |
| 50 | 16 | `textf[8]` | Failure message IDs. |
| 66 | 16 | `sounds[8]` | Success sound IDs. |
| 82 | 16 | `soundf[8]` | Failure sound IDs. |
| 98 | 2 | `spell` | Trap spell ID, if any. |
| 100 | 2 | `lowdamage` | Trap damage low bound. |
| 102 | 2 | `highdamage` | Trap damage high bound. |
| 104 | 2 | `tumblers` | Pick-lock mini-game difficulty/tumblers. |
| 106 | 6 | `prompt[3]` | Prompt/message/sound-power support fields. Prompt 0 is the opening prompt; prompt 1 is used as trap damage sound; prompt 2 as spell power. |
| 112 | 6 | `sound[3]` | Opening and support sound/chance fields. |

### Thief Runtime Semantics

The thief UI enables action buttons by checking character skill, `type[action]`, and `modifer[action]`. The eight slots follow the character skill order: Acrobatic Act, Detect Trap, Disarm Trap, Hear Noise, Force Lock, Move Silently, Pick Lock, and Pick Pocket. Success and failure paths show the paired text/sound fields and return a result code when present.

Trap behavior is stateful:

- detect trap can enable disarm trap;
- disarm trap clears `type[9]`;
- failed actions can spring trap damage/spells;
- runtime changes are written back to `CT`.

## Timed Encounter Layout

`Data TD3` records are 40 bytes, all big-endian shorts.

| Offset | Size | Field | Notes |
| ---: | ---: | --- | --- |
| 0 | 2 | `day` | Runtime day-of-year trigger. Zero terminates scan. |
| 2 | 2 | `increment` | Days added after a trigger check. |
| 4 | 2 | `percent` | Percent chance to execute. |
| 6 | 2 | `door` | Macro/door ID executed through `newland`. |
| 8 | 2 | `reclevel` | Required land/dungeon level when location-gated. |
| 10 | 2 | `recrect` | Required random rectangle index; `-1` means none. |
| 12 | 2 | `recx` | Required X coordinate; `-1` means none. |
| 14 | 2 | `recy` | Required Y coordinate; `-1` means none. |
| 16 | 2 | `recitem` | Required item; positive values must be present. |
| 18 | 2 | `recquest` | Required quest flag; `-1` means none. |
| 20 | 2 | `stuff[0]` | Location kind: `1` land, `2` dungeon, otherwise any. Providence models this as `locationKind`. |
| 22 | 18 | `stuff[1..9]` | Unnamed compatibility words. Fresh Providence output is deterministic zero; imported values remain annex-owned pending stronger evidence. |

### Timed Runtime Semantics

`textbox-time.c` scans runtime `CTD3` records while `day` is nonzero. When `day == tyme.tm_yday`, Realmz:

- adds `increment` to `day`;
- checks percent chance;
- checks required item and quest;
- optionally checks land/dungeon level, random rectangle, and exact coordinates;
- writes the updated record back to `CTD3`;
- executes `dotime.door` through `newland` when all gates pass.

Opcode `54` mutates runtime timed encounters by record ID, changing percent, increment, and next-day state.

## Corpus Evidence

Both files appeared in the prior 44-scenario inventory. A focused authoritative-writer audit on
2026-07-19 scanned the current `F:\Scenarios` payloads while excluding `.finf` Finder metadata.

| File | Unit | Evidence |
| --- | ---: | --- |
| `Data TD2` | 118 bytes | Local corpus sizes divide cleanly by 118; Hax has 117,410 bytes = 995 records. |
| `Data TD3` | 40 bytes | Local corpus sizes divide cleanly by 40; White Dragon has 2,080 bytes = 52 records. |

The focused `Data TD2` audit found 30 physical payloads, 27 distinct payloads, and 1,414 complete
records. Every data payload was exactly divisible by 118. Three related scenarios contain the same
noncanonical nonzero Boolean bytes in record 2 (`type[5..7] = 72, 191, 128`); Realmz treats these
as true. Providence normalizes authored Boolean output to `0` or `1`, while unchanged imported rows
retain exact legacy encodings through the compatibility annex.

The focused `Data TD3` audit found 30 physical payloads and 301 complete rows. Every payload was
exactly divisible by 40. The nine unnamed words had 10 distinct patterns: 109 rows were all zero,
while 192 rows had at least one nonzero value (1,465 nonzero cells total). This is evidence that the
range must be preserved for legacy imports, not evidence that Providence should assign it invented
authoring meanings.

## Timed Reserved Field Report

`scripts/report_timed_encounter_reserved_fields.mjs` scans `Data TD3` `stuff[1..9]` so Providence can decide whether the remaining nine signed fields deserve deeper archaeology before giving them normal UI labels.

The generated report lives at:

- `docs/generated/timed-encounter-reserved-fields.json`
- `docs/generated/timed-encounter-reserved-fields.md`

The current benchmark scan found nonzero reserved values in the Wrath timed encounter benchmark records, with two repeated nine-field patterns. Optional raw scenario-root scans also show repeated patterns across local scenario folders. That proves the bytes are not simply always zero, but the repeated pattern shape is not enough to name user-facing behavior.

The cheap source pass found the classic runtime location gate reading `dotime.stuff[0]` in `textbox-time.c`; no named main-loop use of `stuff[1..9]` was found in that path. `stuff[1..9]` therefore remain read-only compatibility evidence in Providence. Fresh compilation does not consult them and emits zero; imported edits recover the exact 18-byte range only from the compatibility annex. Follow-up should test named scenarios/records in Divinity or Realmz before promoting any slot into authoring UI.

## Providence Editor Implications

- Keep source `Data TD2` and `Data TD3` separate from runtime `CT`, `CTD3`, and saved `Data H1`.
- Complex Encounter editor should link `thiefsuccess` directly to `Data TD2`.
- Timed Encounter editor should show schedule, chance, macro target, item/quest requirements, and location gates.
- Thief Encounter editor should expose all eight source-backed action rows plus guided trap, lock, Pick Lock, and Disarm Trap spell paths.
- Runtime mutation opcodes should be labeled as effects that alter runtime caches, not source records.
- `Data TD2` now has complete canonical writer coverage. Imported row identity belongs to the compatibility annex, not the authored record model.
- `Data TD3` now has canonical writer coverage for every source-backed field. Fresh output zeroes the unnamed range; imported preservation is isolated to the annex.

## Validation Rules

- `Data TD2` length must be divisible by 118.
- `Data TD3` length must be divisible by 40.
- Thief success/failure text IDs should resolve to `Data SD2` when nonzero.
- Thief success/failure sound IDs should resolve to sound resources when nonzero.
- Thief trap damage should validate `lowdamage <= highdamage` when both are nonzero.
- Thief `spell` should resolve through the spell picker when nonzero.
- Timed `door` should resolve to a callable macro/door.
- Timed `percent` should be 0-100 unless preserving imported data.
- Timed `recitem` should resolve through the item library when positive.
- Timed `recquest` should be `-1` or a valid quest flag.
- Timed location gates should validate level, rectangle, and coordinates against current map/dungeon bounds.

## Divinity Evidence Still Needed

- Exact Divinity presentation for the two state flags and three support-sound fields.
- Exact labels for prompt/sound support fields.
- Whether Divinity treats `day` as absolute day-of-year, relative days, or a UI abstraction.
- Timed encounter `stuff[1..9]` meanings.
- Exact Divinity labels and writer behavior for timed schedules.

## Providence Follow-Up

- Follow-up: name `stuff[1..9]` only if source, Divinity fixtures, or controlled runtime behavior provides evidence.
- Add a Timed Encounter editor before a full Thief editor; its fields are cleaner and directly source-backed.
- Keep Rogue Encounter fixtures covering all eight action slots and the two runtime-mutated state flags.
- Update Complex Encounter target pickers to link `thiefsuccess` to `Data TD2`.
