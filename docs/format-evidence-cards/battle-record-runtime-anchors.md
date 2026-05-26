# Runtime Note: Battle Record Anchors

## User-Facing Unlock

This note makes `Data BD` safe to deepen from a shell editor into a real Battle workbench. Providence can present a 13x13 monster grid, before/after message pickers, combat distance, a battle-round macro picker, signed monster side toggles, and validation against `Data MD` monsters and `Data SD2` messages.

## Runtime Model

`Data BD` is a scenario-authored fixed-record file. Each battle record is 346 bytes:

- 13x13 signed monster grid entries;
- a distance byte used to randomize initial battle placement;
- message-before and message-after `Data SD2` references;
- a battle macro field used by combat-round macro logic.

Runtime loads battle records directly from the selected scenario folder. Battle setup then loads monsters from `Data MD` using the absolute value of each nonzero grid entry.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\structs.h:125` | Defines `struct battle` with `short battle[13][13]`, `dist`, `messagebefore`, `messageafter`, and `battlemacro`. |
| `F:\Realmz\src\realmz_orig\convert.c:275` | `CvtBattleToPc` converts all 169 monster grid shorts plus the message and macro shorts. |
| `F:\Realmz\src\realmz_orig\combat.c:37` | Combat opens scenario `Data BD`, seeks by `abs(battlenum) * sizeof battle`, and converts the record. |
| `F:\Realmz\src\realmz_orig\combat.c:45` | If `messagebefore` is nonzero, combat displays it with `textbox(-1, messagebefore, ...)`. |
| `F:\Realmz\src\realmz_orig\combatsetup.c:100` | Combat setup reopens `Data BD` and reads the same battle record. |
| `F:\Realmz\src\realmz_orig\combatsetup.c:108` | `messageafter` is copied to runtime `messageafter`. |
| `F:\Realmz\src\realmz_orig\combatsetup.c:112` | `dist` is randomized with `Rand(battle.dist)` for initial monster placement. |
| `F:\Realmz\src\realmz_orig\combatsetup.c:292` | Nonzero grid cells create monsters until the runtime monster cap is reached. |
| `F:\Realmz\src\realmz_orig\combatsetup.c:300` | Monster template lookup uses `abs(battle.battle[x][y]) * sizeof monster[0]`. |
| `F:\Realmz\src\realmz_orig\combatsetup.c:388` | Negative grid entries flip the loaded monster's `traiter` side/friendly flag. |
| `F:\Realmz\src\realmz_orig\getup.c:75` | Negative `battlemacro` activates a macro at combat-round boundaries. |
| `F:\Realmz\src\realmz_orig\newland.c:579` | Opcode `126` battle combat-round macro ignores positive `battlemacro`; the runtime expects a nonpositive/negative state for active round macro behavior. |

## Byte Layout

| Offset | Size | Field | Notes |
| ---: | ---: | --- | --- |
| 0 | 338 | `battle[13][13]` | Big-endian signed shorts. `0` means empty. `abs(value)` is the `Data MD` monster record id. Negative values flip side/friendly state after load. |
| 338 | 1 | `dist` | Random initial placement distance. Runtime calls `Rand(dist)`, so `0` is risky unless old scenarios deliberately use it. |
| 339 | 1 | padding | Struct alignment padding before shorts. Preserve on import/export. |
| 340 | 2 | `messagebefore` | `Data SD2` message id shown before combat if nonzero. |
| 342 | 2 | `messageafter` | `Data SD2` message id copied to runtime for post-battle display. |
| 344 | 2 | `battlemacro` | Battle-round macro state/id. Negative values activate the macro at round boundaries. |

## Battle Grid Semantics

The editor should model the grid as 13x13 slots, not a flat list. Each slot has:

- `monsterId`: `abs(rawValue)`;
- `sideFlip`: `rawValue < 0`;
- `empty`: `rawValue == 0`;
- `monsterTarget`: resolved `Data MD` record when present.

The signed value is a compact Realmz encoding, not two separate fields. Providence should show it as a monster picker plus an explicit side/friendly toggle and preserve the signed short on export.

## Messages And Macros

`messagebefore` and `messageafter` are central `Data SD2` message references. The Battle editor should offer searchable message pickers and create-target buttons.

`battlemacro` is a macro/door reference with sign-sensitive runtime behavior. Source evidence proves negative values activate at combat-round boundaries; positive values are rejected by opcode `126`'s older round-macro path. Divinity binary evidence is still needed for exact labels and whether the editor presents this as "round macro", "single-use macro", or another option set.

## Corpus Evidence

`Data BD` appears in all 44 analyzed scenarios. Local file sizes confirm 346-byte records:

| Scenario | Size | Records |
| --- | ---: | ---: |
| Price of Power | 257,770 | 745 |
| Wrath of the Mind Lords | 186,148 | 538 |
| War in the Sword Lands | 173,346 | 501 |
| Kalypso's Island | 128,366 | 371 |
| Lord of the Abyss | 124,906 | 361 |
| Trouble in the Sword Lands | 123,868 | 358 |
| Half Truth | 103,454 | 299 |

## Providence Editor Implications

- Promote `Data BD` to a typed `Battle` collection with raw-byte preservation.
- Replace numeric monster cells with a 13x13 grid editor backed by Monster pickers.
- Show negative monster IDs as a side/friendly toggle, not as an invalid monster id.
- Make before/after messages first-class message pickers.
- Treat `dist` as "start distance/spread" with validation and an explanation that runtime randomizes it.
- Keep battle macro sign behavior visible under compatibility/source evidence until Divinity labels are proven.
- Battles should be creatable from Script/AP battle opcode target pickers once `Data MD` and message pickers are stable.

## Validation Rules

- `Data BD` file length must be divisible by 346.
- Every nonzero grid entry should resolve to an existing `Data MD` monster record by `abs(value)`.
- Warn if a battle has no nonzero monster grid entries.
- Warn if `dist <= 0` unless preserving imported data.
- `messagebefore` and `messageafter` should resolve to `Data SD2` messages when nonzero.
- `battlemacro` should resolve to a callable macro/door when nonzero; sign behavior should be shown.
- Warn if the number of nonzero monster cells exceeds runtime `maxmon` once that cap is surfaced.

## Divinity Evidence Still Needed

- Battle editor labels for distance, side/friendly state, and macro sign behavior.
- Defaults for new battle records.
- Whether Divinity exposes all 13x13 cells at once or limits placement by viewport.
- Any hidden constraints on `dist`, monster count, and empty/post-battle message behavior.

## Providence Follow-Up

- Follow-up: `parser-writer`, `editor-ui`, `validation`.
- Build `Data BD` parse/write fixtures with exact 346-byte preservation.
- Deepen the existing Battle target shell after Monster pickers are available.
- Add battle-grid editing to the Battle tool and Script/AP target drawer.
