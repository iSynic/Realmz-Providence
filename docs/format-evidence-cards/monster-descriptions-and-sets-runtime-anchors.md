# Evidence Card: Monster Descriptions And Monster Sets

## User-Facing Unlock

Providence can stop treating `Data DES`, `Data MD1`, and `Data MD-1` as unrelated mystery files. They are part of the monster authoring surface:

- `Data DES` is the monster description text pool used by Realmz bestiary/monster inspection.
- `Data MD1` and `Data MD-1` are alternate monster template sets selected by the runtime `monsterset` preference.
- All monster set files use the same 210-byte `struct monster` layout as `Data MD`.

This unlocks a safer Monster workbench plan: parse all monster sets, show descriptions alongside monster templates, preserve unknown/extra description slots, and only write after fixtures prove Divinity's monster editor behavior.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\structs.h:159` | Defines the 210-byte `struct monster` template used by `Data MD` and monster-set variants. |
| `F:\Realmz\src\realmz_orig\convert.c:236` | `CvtMonsterToPc` converts the short fields in monster templates. |
| `F:\Realmz\src\realmz_orig\beast.c:56` | Bestiary/monster display opens `Data MD`. |
| `F:\Realmz\src\realmz_orig\beast.c:58` | If `monsterset` is nonzero, Realmz appends the numeric set value to the `Data MD` filename. This yields names such as `Data MD1` and `Data MD-1`. |
| `F:\Realmz\src\realmz_orig\beast.c:74` | Bestiary seeks by `specific * sizeof monpick` when a specific monster id is requested. |
| `F:\Realmz\src\realmz_orig\beast.c:76` | Bestiary seeks by `(menupos[index] - 1) * sizeof monpick` for menu-selected monsters. |
| `F:\Realmz\src\realmz_orig\beast.c:113` | Bestiary opens `Data DES` for monster description text. |
| `F:\Realmz\src\realmz_orig\beast.c:117` | `Data DES` seeks by `specific * 256` or menu position `* 256`. |
| `F:\Realmz\src\realmz_orig\partyselect.c:262` | Party selection presents monster set choices. |
| `F:\Realmz\src\realmz_orig\partyselect.c:266` | Choosing a monster set writes `monsterset = itemHit - 55`, allowing `-1`, `0`, and `1` in observed UI paths. |
| `F:\Realmz\src\realmz_orig\save-direction-order.c:421` | `monsterset` is saved in save-game preferences/state. |
| `F:\Realmz\src\realmz_orig\spelllist.c:168` | Summon/polymorph logic also appends `monsterset` to `Data MD` before choosing a random monster. |
| `F:\Realmz\src\realmz_orig\newland.c:1052` | Add-ally script logic appends `monsterset` to `Data MD` before loading the ally template. |

## Byte Layout Notes

### `Data DES`

- Fixed record size: 256 bytes.
- Runtime use: Pascal-style text is read directly into a dialog item.
- Indexing: same menu/specific monster index used for `Data MD`, but corpus files can contain more description slots than active monster records.
- Endian behavior: none; this is text/byte data.
- Writer status: parser-ready, writer-gated until Divinity Monster editor behavior is confirmed.

### `Data MD1` / `Data MD-1`

- Fixed record size: 210 bytes, same as `Data MD`.
- Runtime use: selected when `monsterset` is nonzero.
- Filename construction: `getfilename("Data MD")` followed by appending `monsterset`.
- Writer status: parser-ready through the normal `Data MD` monster parser, writer-gated until monster-set editing semantics are proven.

## Corpus Evidence

The byte-roundtrip audit found these files in every visible known-valid scenario root:

| File | Frequency | Size Pattern |
| --- | ---: | --- |
| `Data DES` | 87/87 | All observed sizes are divisible by 256. |
| `Data MD1` | 87/87 | All observed sizes are divisible by 210. |
| `Data MD-1` | 87/87 | All observed sizes are divisible by 210. |

Representative observed sizes:

| File | Size | Records |
| --- | ---: | ---: |
| `Data DES` | 55,296 | 216 description slots |
| `Data DES` | 74,496 | 291 description slots |
| `Data DES` | 121,856 | 476 description slots |
| `Data MD1` | 28,770 | 137 monster records |
| `Data MD-1` | 28,980 | 138 monster records |
| `Data MD1` | 70,560 | 336 monster records |

## Providence Follow-Up

- Follow-up: `parser-only`, then `parser-writer` after fixture proof.
- Add a monster-set resolver that treats `Data MD`, `Data MD1`, and `Data MD-1` as variants of the same record family.
- Add a `Data DES` parser that exposes description slots by monster index and preserves extra slots.
- In normal UI, call these "Monster Sets" and "Monster Descriptions" rather than showing raw filenames.
- Keep write controls hidden until Divinity Monster editor labels, set behavior, and before/after fixtures prove safe mutation.

## Writer Gate

Do not write `Data DES`, `Data MD1`, or `Data MD-1` yet. Before enabling writes, Providence needs:

- record-level fixtures for all three monster template files;
- a fixture that changes a monster description in Divinity or a source-backed writer test for the 256-byte text slot;
- confirmation whether Divinity edits all monster sets, only the active set, or only `Data MD`;
- validation for description slots that have no matching active monster template.

