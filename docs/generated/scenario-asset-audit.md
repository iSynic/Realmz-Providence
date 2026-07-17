# Scenario Asset Audit

Generated from 35 known scenarios under the local Realmz scenario corpus. The repeatable audit is available as `npm run archaeology:scenario-assets -- <scenario-root> [output.json]`.

## Corpus Coverage

The audit inspected 55 resource forks and 4,870 resources that Providence can reasonably present as author-facing media or preserved resource data.

| Resource type | Count | Current support |
| --- | ---: | --- |
| `cicn` | 4,197 | Preview-ready |
| `PICT` | 78 | Preview-ready after the 16-bit word-PackBits fix |
| `snd` | 166 | 152 playable; 14 unresolved format-2 variants |
| `TEXT` | 92 | Readable text |
| `STR#` | 267 | Readable string lists |
| `styl` | 52 | Preserved metadata |
| `vers` | 18 | Preserved metadata |

Status totals are 4,275 preview-ready, 152 playable, 359 text-ready, 70 metadata-only, and 14 unsupported variants.

## Confirmed Findings

### Spires of Steel `PICT 170`

`PICT 170` is a 114 by 387, 16-bit DirectBits picture stored in Spires of Steel's `Scenario.rsrc`. Its PackBits stream is encoded in 16-bit words. Providence previously expanded that stream byte-by-byte, producing the narrow field of colored noise seen in the Assets preview.

The decoder now handles QuickDraw pack type 3 as word PackBits in both desktop and browser imports. The decoded resource is a vertical Realmz interface category strip containing labels such as Weapons, Armor, Magic, Future, Supplies, Open, and Share.

This resource is not an ordinary scenario Display Picture. It deliberately occupies a low Realmz runtime picture ID and overrides interface art while the scenario resource fork is active. Providence now preserves and previews it in Scenario Assets, but does not offer it as a normal Display Picture target. Low-ID resources already referenced by imported scripts remain inspectable and carry an override warning.

### Realmz `PICT 302` Dungeon Top Down

The white upper portion is present in the original Realmz resource and is not a Providence decoding error. Realmz loads the full 640 by 640 picture, but the useful dungeon overhead tile atlas occupies a 64 by 64 region at the right side of the source image.

Assets now defaults this reference to a focused useful-region preview and offers a Full Source view for archaeology. Stock fallback tilesets are no longer mislabeled as scenario-owned assets merely because they are available to the map renderer.

## Picture Ownership

The corpus contains:

- 32 ordinary scenario pictures in `PICT 30000-30128`.
- 16 custom landlook overrides at `PICT 306-308`.
- 4 intentional low-ID system or interface overrides in Spires of Steel (`170`, `200`, `202`, `225`).
- 26 nonstandard picture IDs, principally `32128`, plus examples at `32000`, `32127`, `30129`, and `30130`.

Providence preserves nonstandard imported resources because shipped scenarios prove that they exist, but new ordinary Display Pictures allocate only `30000-30127`. `PICT 30128` remains reserved for the scenario title picture.

## Ownership And Authoring Rules

- **Scenario Assets** ship in the scenario resource fork. Imported raw scenario resources can now be removed explicitly; removal is recorded in project metadata and applied by browser packaging and desktop export.
- **Custom Library** is Providence-wide reusable material. Copying an asset to Scenario Assets creates a scenario-owned duplicate with a collision-free scenario resource ID. The reusable source remains in Custom Library until explicitly deleted there.
- **Realmz Reference Assets** are not copied when Realmz already owns the resource. Authoring pickers reference the stock resource ID.
- **Divinity-only reference media** is not safe to reference by stock ID. Eligible media must be copied into Scenario Assets and assigned a valid scenario-owned ID before an authoring picker offers it.
- Project asset ID allocation considers managed assets, imported scenario resources, icon resources, and parsed text resources to avoid collisions.

## Remaining Decoder Work

Fourteen sounds from The Realmz Of Fire use a format-2 command stream containing command `0x8050` where the current decoder expects `0x8051`. They remain preserved and clearly marked as unsupported variants. Their runtime meaning needs source or fixture evidence before the decoder is broadened.

## Presentation Changes

- Scenario, Custom Library, and Reference ownership guidance is stated in authoring terms.
- The selection inspector exposes Copy to Scenario Assets, Add to Custom Library, Replace, Delete, and raw-resource removal where those actions are valid.
- Compact cards no longer need to carry every management action.
- Reference assets explain whether the correct action is using a Realmz stock ID or copying non-stock media.
- Display Picture pickers exclude Custom Library-only assets, Divinity-only references, `cicn` resources, and unsafe low-ID runtime overrides.
