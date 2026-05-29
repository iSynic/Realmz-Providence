# Evidence Card: Dungeon Editor Writer Safety

## User-Facing Unlock

Providence can turn dungeon authoring from raw bitfields into named primitives: walls, doors, stairs, secret passages, pass-throughs, pillars, notes, and Action Point placement. The editor should only expose controls where the bit layout and runtime consumer are proven.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:104` | First-start copies source `Data DDD` into runtime dungeon trigger cache. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:107` | First-start copies source `Data DL` into runtime dungeon field cache. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:110` | First-start copies source `Data RDD` into runtime random-level cache. |
| `F:\Realmz\src\realmz_orig\editstring.c:550` | Realmz internal editor/source utility references dungeon trigger data `Data DDD`. |
| `F:\Realmz\src\realmz_orig\editstring.c:553` | Realmz internal editor/source utility references dungeon field data `Data DL`. |
| `F:\Realmz\src\realmz_orig\editstring.c:556` | Realmz internal editor/source utility references dungeon random data `Data RDD`. |
| `F:\Realmz\src\realmz_orig\threed.c:580` | Dungeon cells with bit index `3` call `newland(floorx, floory, ...)`, so this is the Action Point / encounter trigger marker, not a generic wall flag. |
| `F:\Realmz\src\realmz_orig\handlemenuchoice.c:970` | Dungeon note saving owns bit index `10`; notes should be edited through a note workflow, not raw geometry painting. |
| `F:\Realmz\src\realmz_orig\combatmap.c:68` | Dungeon combat map conversion uses mask `0x4F0E`, so combat preview needs the runtime mask model in addition to top-down dungeon sprites. |
| `F:\Realmz\src\realmz_orig\combatmap.c:64-68` | The `0x4F0E` combat conversion mask includes `0x4000`, matching Divinity's No Wall in Battle control. |
| Existing card | `docs/format-evidence-cards/dungeon-runtime-anchors.md` contains current bitfield masks and runtime consumers. |

## Divinity Evidence

| Manual Line | Evidence |
| ---: | --- |
| 4087-4094 | Dungeon levels have Action Points and Random Rectangles like land levels, but land and dungeon levels are separate. |
| 4124 | Dungeon Editor uses Command/Control like the Land Editor; Option erases any location including Action Points. |
| 4157 | Stairs are visual/geometry primitives and need Action Points to actually move the party. |
| 4169-4173 | No Wall in Battle makes walls placed on the combat map become clear floor tiles, similar to paths through mountains. |
| 5959 | Manual FAQ discusses secret Action Points in the Dungeon Editor. |

## Byte Layout Notes

- `Data DL` is the source dungeon map/geometry file.
- `Data DDD` is the source dungeon Action Point file.
- `Data RDD` is the source dungeon random rectangle file.
- Runtime `CD`/related caches are generated on new game and should not be treated as source authoring files.

## Corpus Evidence

- `Data DL`, `Data DDD`, and `Data RDD` are present in 44/44 scenarios.
- Existing dungeon evidence now distinguishes geometry bits, note markers, Action Point trigger markers, runtime reveal/hidden markers, and combat-map conversion masks.
- The high-bit audit closes `0x4000` as Divinity's No Wall in Battle primitive and leaves `0x8000` as preserve-only unresolved high/sign data.

## Providence Follow-Up

- Follow-up: `parser-writer`, `editor-ui`, `validation`.
- Build named dungeon primitives from the existing bitfield profile.
- Generated coverage artifacts:
  - `docs/generated/dungeon-byte-ownership.json`
  - `docs/generated/dungeon-cell-bit-taxonomy.json`
  - `docs/generated/dungeon-primitive-writer-gate.json`
  - `docs/generated/dungeon-high-bit-audit.json`
- Route note markers and Action Point trigger markers through Notes and Action Point workflows where possible.
- Treat visible arch/revealed passage and hidden visual markers as runtime-sensitive until Divinity writer fixtures prove authored defaults.
- Treat `0x4000` No Wall in Battle as a writer-safe primitive; preserve `0x8000` until ownership is proven.
- Keep dangerous raw bit toggles under Advanced Details.
- Add fixtures for each primitive before exposing broad brush tools.
- Link dungeon Action Points and Random Encounters through the same Action Point Hub concepts as land maps.

## Writer Gate

No new broad Dungeon Editor workflow is ready until the exact bit masks, compatible combinations, runtime render effect, and save/reopen/export roundtrip are fixture-tested. The primitive helper coverage now includes source-backed No Wall in Battle while preserving unresolved high/sign bits.
