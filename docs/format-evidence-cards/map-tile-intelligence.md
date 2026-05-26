# Evidence Card: Map Tile Intelligence

## User-Facing Unlock

Providence's tile palette can group and validate terrain like Divinity: walkable, solid, shore/water, path, boat-required, fly/float-required, line-of-sight blocking, movement sound/time, and special/icon-backed values.

## Realmz Anchors

- `structs.h:87`: `struct mapstats { sound, time, solid, shore, needboad, ispath, los, flyfloat, forest, spare }`.
- `variables.h`: `mapstats[402]`, `solids[1024]`.
- `buttonchoice.c`: movement, boats, shore, solid, and special negative tile behavior.
- `cansee.c`, `cast.c`, `centerpict.c`: line-of-sight and darkness consumers.
- `combatmap.c`: combat-map terrain summaries.
- `loadland-loadpixmap.c`: landlook and tile atlas runtime behavior.

## Divinity Evidence Needed

- Edit Land Tiles screen field mapping.
- Divinity tile range screen: mountain/open/rubble/house ranges.
- Picture Import / Special Tile controls.
- Binary evidence for how Divinity writes tile attribute tables and custom tile metadata.

## Byte Layout Notes

- `Data Solids` is 1024 bytes and currently parsed as source-backed partial.
- `mapstats` is the richer Divinity-visible attribute model for standard landlook tiles. Realmz loads it from standard/custom landlook `* BD` files, not from scenario `Data Solids`.
- `Data Solids` is scenario-local special negative tile solidity: Realmz checks it only for raw map values `-1..-998`.
- Land tiles and negative/special `cicn` values are both field-grid values, not separate overlay storage.
- Negative/special field values render through an icon-aware path: draw the current landlook base tile, normalize the negative field value into a `cicn` ID, then draw the icon. Terrain-only rendering (`fastplot`) intentionally ignores negative IDs.

See `map-tile-runtime-anchors.md` for the source-backed split between `mapstats`, `Data Solids`, and runtime field-value normalization.
See `resource-icon-runtime-anchors.md` for source-backed special/icon tile rendering rules.
See `map-field-value-runtime-anchors.md` for the raw signed-short field-value layers: standard terrain, negative special icons, positive thousand-band state, note/path marker bits, and secret/action normalization.
See `random-level-runtime-anchors.md` for the level-level metadata that drives landlook, dark level, line-of-sight, and random rectangles.
See `outdoor-visibility-runtime-anchors.md` for why dark/LOS controls are source-backed flags whose visible effects depend on runtime party position and generated `site` cache state.

## Corpus Evidence

- `Data Solids` appears in all 44 analyzed scenarios.
- Resource inventory sees 7,535 `cicn` resources and 160 `PICT` resources across the corpus.
- Maps currently expose field values from `Data LD` and `Data DL` in every analyzed scenario.

## Providence Follow-Up

- Follow-up: `parser-writer`, `editor-ui`, `validation`.
- Expand `TileAttributeProfile` from `Data Solids` into source-backed `mapstats` fields from bundled landlook `* BD` files.
- Treat `Data Solids` as special/icon tile solidity, not standard land tile solidity.
- Add selected-cell field-value evidence for raw value, normalized terrain, icon candidates, note/path bits, positive state band, and secret/door suspicion.
- Keep arbitrary positive values above `999` in `Raw / Advanced` unless they are authored through a known Action Point, secret, note, or path workflow.
- Validate random rectangle chance as times in 10000, extra AP percent as chance out of 100, and positive extra AP percent as one-shot.
- Treat dark/LOS visual effects as preview layers with a chosen focal point; do not export generated `site` cache data as scenario source.
- Add tile-attribute writer fixtures only after Divinity and Realmz write/read paths agree.

## Acceptance Evidence

- Providence can explain every visible Divinity “Edit Land Tiles” field as source-backed, inferred, or unknown.
- Palette filters stop showing unknown categories as if they are decoded.
- Edited tile metadata exports to Realmz-standard data and roundtrips through import.
