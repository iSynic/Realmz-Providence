# Evidence Card: Resource Authoring

## User-Facing Unlock

Providence can manage scenario pictures, icons, sounds, styled/external text, map names, custom land tiles, monster/item icons, and shared-resource fallback references with clear source precedence.

## Realmz Anchors

- `ResourceManager.cpp`: resource lookup and scenario/shared fallback behavior.
- `GWorldInit.c`, `loadland-loadpixmap.c`: tile atlas and shared picture resources.
- `newland.c`: show-picture, sound, and icon/tile mutation actions.
- Resource fork parser evidence in `resource-fork-taxonomy.md`.
- `resource-icon-runtime-anchors.md`: source-backed negative field value rendering through `cicn` resources.

## Divinity Evidence Needed

- Import Picture, Creating Special Land Tiles, Adding Monster & Item Icons, Pictures & Sounds, Text Import/Export, and map name flows.
- Binary evidence for resource ID allocation, conflict handling, naming, and export/write routines.

## Byte Layout Notes

- Resource forks include `PICT`, `cicn`, `snd `, `STR#`, `TEXT`, `styl`, `vers`, `RLMZ`, and malformed legacy entries.
- Resource IDs can resolve through scenario resources or shared Realmz resources.
- Negative outdoor map field values render as current landlook base tile plus a normalized negative `cicn` icon ID; the raw field value must still be preserved.
- `fastplot` ignores negative values, so special/icon tiles need the icon-aware render path rather than a terrain-atlas fallback.
- `RLMZ` role is source-backed, but payload taxonomy remains inferred.

## Corpus Evidence

- Observed resources across the 44-scenario corpus: 7,535 `cicn`, 386 `snd `, 259 `RLMZ`, 222 `STR#`, 160 `PICT`, 150 `TEXT`, 91 `styl`, 31 `vers`, and 2 malformed type entries.
- Opcode `12` tile/icon mutation appears 5,352 times in the generated corpus inventory.

## Providence Follow-Up

- Follow-up: `parser-writer`, `editor-ui`, `validation`.
- Build a resource table that distinguishes scenario-supplied bytes, bundled/shared fallback bytes, and unresolved references.
- Use source-backed negative icon normalization for Maps palette/canvas previews before adding custom icon authoring.
- Add resource writer fixtures before enabling ID reassignment or custom asset creation.

## Acceptance Evidence

- Script/media/map/icon target pickers show resource source and conflict status.
- New or edited resources write into the scenario resource fork without changing Realmz lookup rules.
- Missing or fallback-only assets are diagnostic, not silently treated as authored scenario bytes.
