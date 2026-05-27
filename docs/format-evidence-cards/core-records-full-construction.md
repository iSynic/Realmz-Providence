# Evidence Card: Core Records For Full Scenario Construction

## User-Facing Unlock

Providence can recreate Divinity-authored monsters, items, spells, races, castes, battles, treasure, shops, thief/timed encounters, and map notes with typed editors and Realmz-standard exports.

## Realmz Anchors

- `structs.h`: `monster`, `itemattr`, `spell`, `race`, `caste`, `battle`, `treasure`, `shop`, `thief`, `timeencounter`, `maps`.
- `convert.c`: endian and owned field conversion functions for race/caste/item/monster/battle/shop/thief/random/map records.
- `beast.c`, `combatsetup.c`, `combat.c`: monster and battle consumers.
- `booty.c`, `showitems-showspecial.c`, `wear.c`: item and treasure behavior.
- `spelllist.c`, `castspell.c`: spell behavior and availability.
- `core-rules-record-runtime-anchors.md`: scenario-authored records vs shared/override rules-library split.

## Divinity Evidence Needed

- Monster, Item, Spell, Race, Caste, Battle, Treasure, Shop, Rogue/Thief, Time Encounter, and Map Note editor screens.
- Field order, defaults, option labels, range constraints, and hidden validation.
- Ghidra write routines for each editor form.

## Byte Layout Notes

- Several structs are source-backed but only partially surfaced in Providence.
- Existing Providence support includes shell authoring for messages, battles, treasure, shops, simple encounters, and complex encounters.
- Monsters are scenario-authored through `Data MD`; `monster-record-runtime-anchors.md` now provides a source-backed 210-byte layout, runtime/menu behavior, battle placement semantics, and death macro hooks.
- Battles are scenario-authored through `Data BD`; `battle-record-runtime-anchors.md` provides the 346-byte layout, 13x13 signed monster grid, before/after message references, combat distance, and battle macro semantics.
- Items split between shared `Data ID` families for IDs 0-799 and scenario `Data NI` supply/special records for IDs 800-999; full custom item writing should begin with Divinity's 900-999 range.
- Treasure and shop records are source-backed through `Data TD` and `Data SD`; `item-treasure-shop-runtime-anchors.md` separates those authoring files from shared item definitions and runtime shop cache `CS`.
- Simple and complex encounters are source-backed through `Data ED` and `Data ED2`; `encounter-record-runtime-anchors.md` separates source records from runtime `CE`/`CE2` mutation and corrects complex encounter field semantics.
- Thief and timed encounters are source-backed through `Data TD2` and `Data TD3`; `thief-timed-encounter-runtime-anchors.md` separates source records from runtime `CT`/`CTD3` mutation and saved `Data H1` state.
- Map records are source-backed through `Data MD2`; `map-record-runtime-anchors.md` proves the 340-byte layout, ten embedded `cicn` marker slots, map preview fields, optional `PICT` view, clip rectangle, and note text.
- Races and castes have source-backed scenario override behavior for third-party scenarios when `Data Race` / `Data Caste` exists, but writer defaults need fixture proof.
- Custom spells have a scenario `Data Spell` open path, but its file/resource semantics need a focused pass before editing.
- Spell, race, and caste runtime anchors now prove key record units: byte-only 30-byte spell records, 408-byte race records, and 576-byte caste records. Rules UI should correct rough library parser debt before presenting these as editable definitions.

## Corpus Evidence

- `Data MD`, `Data BD`, `Data SD`, `Data TD`, `Data TD2`, `Data TD3`, and `Data MD2` appear in all 44 analyzed scenarios.
- `Data MENU` appears in 28 scenarios and should remain generated/effective monster-menu evidence, not authored identity.
- Local Bywater record sizes reinforce fixed-record units: `Data MD` 210 bytes, `Data BD` 346 bytes, `Data TD` 48 bytes, `Data SD` 3002 bytes, and `Data MD2` 340 bytes.
- Local corpus samples range from Bywater's 155 monster records to War in the Sword Lands' 336 records, reinforcing that `Data MD` is a dense fixed-record authoring file rather than generated menu state.
- Large corpus battles range into hundreds of records per scenario, with Price of Power at 745 battle records, reinforcing that Battle authoring needs searchable target management rather than raw numeric IDs.
- Local output corpus `Data MD2` usage is heavy: 427 records, 370 notes, 1,181 icon marker slots, and 53 picture-backed records across 28 scenarios.

## Providence Follow-Up

- Follow-up: `parser-writer`, `editor-ui`, `validation`.
- Implement record editors in dependency order: items/spells/races/castes first, then monsters, then battles/shops/treasure/encounters using those pickers.
- Revised dependency order from runtime anchors: Text/messages first, item/spell/race/caste pickers with fallback badges, then Monsters, then Battles/Treasure/Shops/Encounters.
- Rules picker follow-up should decode packed spell IDs, show scenario overrides before shared fallback data, and mark `Data Spell` resource/tail evidence as preserve-first. See `rules-spell-race-caste-runtime-anchors.md`.
- Monster follow-up should expose icon, item, spell, battle placement, spawn/add-ally, and death macro links through pickers; `Data MENU` remains generated bestiary evidence.
- Battle follow-up should expose a 13x13 grid with signed monster side toggles, message pickers, and macro picker instead of raw grid integers.
- Treasure/Shop follow-up should add a shared item library picker first, then deepen reward/stock editors with clear source-vs-runtime cache labeling.
- Encounter follow-up should correct the complex encounter typed model, preserve simple encounter tail bytes, and expose spell/item/thief/word/action outcomes as real forms.
- Timed Encounter follow-up is cleaner than Thief/Rogue and can become the first editor; Thief/Rogue should wait for Divinity labels and writer fixtures.
- Map Record follow-up should deepen the Maps sidebar with related map, note, picture, and icon-slot links. Names remain resource-fork evidence until STR# writing is proven.
- Keep generated cache mutation separate from authored source records.

## Acceptance Evidence

- Every Divinity editor field has a Providence field, an explicit preserve-only label, or an unknown evidence note.
- Edited records export at exact fixed record sizes and preserve unsupported imported bytes.
- Cross-record pickers resolve icons, items, spells, macro hooks, and messages.
