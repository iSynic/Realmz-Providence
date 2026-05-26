# Runtime Note: Special/Icon Tile Rendering Anchors

## User-Facing Unlock

This note gives the Maps palette a source-backed rule for special land/icon tiles: negative map field values are still map field values, but the renderer draws the current landlook base tile first and then plots a `cicn` icon. Providence should therefore present terrain tiles and special/icon tiles in one paint workflow, while clearly labeling thousand-band field values as encoded Realmz field values rather than plain icon IDs.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\centerpict.c:106` | Main outdoor renderer treats negative `field` values as special icons. |
| `F:\Realmz\src\realmz_orig\centerpict.c:108` | Main renderer normalizes negative thousand bands before icon lookup: values below `-1999` add `2000`; values below `-999` add `1000`. |
| `F:\Realmz\src\realmz_orig\centerpict.c:113` | Main renderer draws `basetile[lastpix]` underneath the special icon. |
| `F:\Realmz\src\realmz_orig\centerpict.c:115` | Main renderer loads the normalized value with `GetCIcon(tempicon)`. |
| `F:\Realmz\src\realmz_orig\mapstuff.c:5` | Map overview renderer has its own `fastplotmap` path. |
| `F:\Realmz\src\realmz_orig\mapstuff.c:8` | Map overview also detects negative field values and normalizes them by adding `1000` repeatedly. |
| `F:\Realmz\src\realmz_orig\mapstuff.c:16` | Map overview draws the current landlook base tile first. |
| `F:\Realmz\src\realmz_orig\mapstuff.c:17` | Map overview plots the normalized negative value through `ploticon3`, which loads a `cicn`. |
| `F:\Realmz\src\realmz_orig\fastplot.c:5` | Terrain atlas drawing is separate from icon drawing. |
| `F:\Realmz\src\realmz_orig\fastplot.c:7` | `fastplot` returns immediately for negative values, so negative tiles must not use the terrain-only render path. |
| `F:\Realmz\src\realmz_orig\buttonchoice.c:79` | Movement solidity for raw negative values only checks `Data Solids` for `-1..-998`. |
| `F:\Realmz\src\realmz_orig\newland.c:1845` | Opcode `12` writes a raw field value to a land or dungeon level, so script-mutated icon/tile changes share the same field-value model. |
| `F:\Realmz\src\realmz_orig\loadland-loadpixmap.c:100` | Landlook terrain atlas art is `PICT 300 + landlook`. |

## Rendering Rule

For outdoor map rendering:

1. If the field value is non-negative, draw it through the landlook terrain atlas path after Realmz clears note/path/thousand modifiers where appropriate.
2. If the field value is negative, normalize it for icon lookup:
   - `-1..-998` stays as that negative `cicn` ID.
   - `-1000..-1999` adds `1000`, for example `-1091 -> -91`.
   - `-2000..-2999` adds `2000`, for example `-2091 -> -91`.
   - Map overview repeats `+1000` up to three times; main viewport has a narrower two-band normalization path.
3. Draw `basetile[lastpix]` from the current landlook.
4. Draw `GetCIcon(normalizedNegativeId)` on top.

Providence implication: a swatch for `-1091` should not ask the terrain atlas to render `-1091`. It should resolve and preview the normalized icon candidate `-91` over the current landlook base tile, while preserving the raw value `-1091` as the field value that would be written.

## Field Value Classes

| Class | Example | Editor Treatment |
| --- | --- | --- |
| Standard terrain tile | `1`, `62`, `155` | Render from `PICT 300 + landlook`; group by `mapstats` when available. |
| Raw special icon tile | `-91`, `-223` | Render as `basetile[lastpix]` plus `cicn -91` or `cicn -223`; use `Data Solids[-value]` for solidity when `-1..-998`. |
| Encoded special/icon field value | `-1091`, `-2091` | Preserve/write raw value; preview by normalizing to the icon candidate; label as encoded field value, not just icon `-91`. |
| Script-mutated field value | opcode `12` EDCD tile value | Show as runtime script effect when attached to an AP/script; do not silently convert it into static placed art. |
| Missing icon resource | any normalized negative without a `cicn` | Show a missing-resource badge; do not fall back to grass without a warning. |

## Corpus Evidence

- The 44-scenario resource inventory observes 7,535 `cicn` resources.
- Opcode `12` "new land icon" appears 5,352 times in the generated corpus inventory, so script-mutated tile/icon behavior is common enough to link from selected cells.
- `uses_icon_resource` appears 7,839 times across decoded semantic links.
- Current map values in City of Bywater include negative thousand-band values such as `-1091`, which should be previewed by normalized icon lookup while preserving the raw field value.

## Providence Follow-Up

- Add one shared `resolveTileRender` path for canvas, palette swatches, selected-cell inspector, and map overview previews.
- Resolve negative values to icon resources before terrain fallback.
- Keep raw value, normalized icon candidate, base tile, and missing-resource status visible in the tile meaning inspector.
- Use `Data Solids` only for raw negative `-1..-998` solidity evidence.
- Label opcode `12` and other field mutations as runtime script effects when shown beside static map data.

## Validation Rules

- Warn when a negative field value normalizes to an icon ID with no `cicn` in scenario or shared resources.
- Warn when an authored "special/icon tile" uses a thousand-band encoded value without a known static authoring reason.
- Do not treat missing icon art as a valid terrain render.
- Do not collapse raw negative field values to normalized icon IDs on export; Realmz field values must roundtrip exactly unless the user intentionally changes them.

## Divinity Evidence Still Needed

- Special Land Tiles editor resource ID allocation and whether it prefers raw `-1..-998` values for newly placed special art.
- Import Picture workflow for custom `cicn` creation, naming, and collision handling.
- Any Divinity UI distinction between plain negative icons and thousand-band encoded field values.
