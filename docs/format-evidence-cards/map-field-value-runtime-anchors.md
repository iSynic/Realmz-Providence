# Runtime Note: Map Field Value Anchors

This note sits underneath the Map Tile Intelligence and Resource/Icon cards. It describes the signed short stored in outdoor `Data LD` map cells before Providence resolves it into terrain art, icon art, path/note overlays, action-point behavior, or secret/door state.

## User-Facing Unlock

Providence can explain a selected map cell as a Realmz field value instead of a vague "tile":

- standard terrain value;
- static special/icon value;
- positive runtime/action/secret state band;
- note/path marker bits;
- movement and line-of-sight terrain target after normalization.

This directly supports the Maps right sidebar, tile meaning inspector, palette grouping, and validation warnings for authored values that Realmz will interpret differently than they look.

## Realmz Source Anchors

| Topic | Anchor | Evidence |
| --- | --- | --- |
| Bit numbering | `F:\Realmz\src\realmz_orig\variables.h` | `MyrBitSetShort`, `MyrBitClrShort`, and `MyrBitTstShort` operate on bit position `15 - b`; source comments call bit `1` the note marker and bit `2` the path marker. |
| Full-map render | `F:\Realmz\src\realmz_orig\mapstuff.c` | `fastplotmap` renders negative values as current landlook base terrain plus `ploticon3`, while positive values over `999` have note/path bits cleared and thousand bands removed before terrain render. |
| Main-screen render | `F:\Realmz\src\realmz_orig\centerpict.c` | The outdoor view branches negative values to `cicn` icon rendering before note/path handling; positive values test note/path bits, subtract thousand bands, and draw secret/note/path overlays. |
| Movement normalization | `F:\Realmz\src\realmz_orig\buttonchoice.c` | Movement checks `Data Solids` only for raw negative values `-1..-998`; positive values clear note/path bits, treat `>2999` or `<-2999` as undetected secret area, then reduce thousand bands for door/action handling. |
| Path marking | `F:\Realmz\src\realmz_orig\buttonchoice.c` | When the normalized terrain has `mapstats[hit].ispath` and is not solid, Realmz sets bit `2` on the field value to mark the traversed path. |
| Line of sight | `F:\Realmz\src\realmz_orig\cansee.c` | LOS checks clear note/path bits and reduce positive thousand bands before consulting `mapstats[hit].los`. |
| Secret discovery | `F:\Realmz\src\realmz_orig\checkforsecret.c` | Secret checks normalize absolute field values and clear the note bit before testing secret-state bands. |

## Field Value Layers

| Layer | Source-backed behavior | Providence implication |
| --- | --- | --- |
| Standard terrain | Positive values in the visible terrain range render from the current landlook atlas and resolve `mapstats` attributes after note/path/thousand-band normalization. | Show as normal placeable landlook tiles with attribute grouping. |
| Negative special/icon | Negative values render as current landlook base terrain plus a `cicn` icon candidate. `Data Solids[-rawValue]` can make raw `-1..-998` special tiles solid. | Keep curated or scenario-used values in the unified `Special / Advanced` palette; loading an unrelated negative resource ID is not sufficient evidence that it is map-placeable. |
| Positive thousand band | Values over `999` are reduced by subtracting `1000` bands after clearing note/path bits; movement treats remaining bands as door/action/secret state. | Label as Realmz field state, not just "raw preserved"; warn before authoring arbitrary high positive values. |
| Note marker bit | Positive values can carry a note marker bit; rendering clears it before terrain lookup and draws note overlay art. | Show as a field-state badge and keep map-note links contextual. |
| Path marker bit | Positive values can carry a path marker bit; runtime sets it when the party walks over path-capable terrain. | Treat as runtime/save-state-like evidence unless the user explicitly authors the raw value. |
| Secret bands | `>2999` and `<-2999` participate in hidden/undetected secret-area logic; detected/normal handling uses lower bands. | Preserve/import and explain, but require more Divinity evidence before offering broad authoring controls. |

## Positive And Negative Values Are Not Symmetric

The source paths are easy to conflate because both positive and negative values can cross thousand boundaries. Realmz does not interpret them the same way:

- Positive high values are field-state/action/secret carriers. They are normalized toward terrain for render and movement after note/path bits are cleared.
- Negative values are special/icon candidates. Render code branches them to `cicn` icon drawing before note/path handling.

Providence should therefore classify `-1091` as a special/icon value with normalized icon candidates, not as a generic marker-bit tile.

## Known Confidence Debt

- Main-screen `centerpict` and full-map `fastplotmap` normalize very negative values differently: the full-map path subtracts up to three negative thousand bands, while the main-screen path performs one `if/else` adjustment. This needs a corpus screenshot or Realmz runtime fixture before Providence claims one universal visible icon ID for every very negative value.
- The exact authored meaning of every positive thousand band needs Divinity binary/manual mapping. Runtime comments prove "door", "detected secret", and "undetected secret area" families, but not the editor labels/defaults.
- Path and note bits can exist in source files, but path marking is also runtime mutation. Providence should distinguish static imported field data from runtime cache/save-state evidence whenever possible.

## Providence Follow-Up

- Add a `MapFieldValueProfile` or equivalent inspector model for selected cells: raw value, normalized terrain, icon candidates, note/path bits, positive state band, secret/door suspicion, attribute profile, and evidence source.
- Keep the default palette focused on a deduplicated union of standard terrain and evidence-backed special/icon values; put arbitrary positive high and imported compatibility values in `Special / Advanced`.
- Add warnings for authored positive values over `999` unless created through a known Action Point, secret, note, or path workflow.
- Treat path marker bits as runtime mutation evidence by default.
- Link map records and map notes from note-marked cells once Divinity/source evidence proves the exact note marker relationship.
