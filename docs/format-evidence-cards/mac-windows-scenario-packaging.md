# Evidence Card: Mac / Windows Scenario Packaging And Media Boundary

## User-Facing Unlock

Providence can treat Realmz scenario compatibility as a packaging contract instead of a media-codec completion problem. Authors need scenario data, resource references, custom media payloads, and target packaging preserved or rewritten safely; they do not need Providence to expose arbitrary PICT opcodes or Sound Manager command streams as normal editor fields.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\misc.c:2753` | Scenario `Data Spell` can open scenario-local spell data and resource-fork evidence. |
| `F:\Realmz\src\realmz_orig\mapstuff.c:67` | Map records can reference picture-backed views, so scenario resources remain runtime targets. |
| `F:\Realmz\src\realmz_orig\loadland-loadpixmap.c:36` | Landlook graphics and mapstats can come from built-in or custom landlook media/data. |
| `F:\Realmz\src\realmz_orig\textbox-time.c:34` | Runtime message display uses `Data SD2`; resource `TEXT`/`STR#` data is separate reference/resource payload. |

## Divinity Evidence

| Manual Area | Evidence |
| --- | --- |
| Special Land Tiles | Divinity places custom special land art as `cicn` resources in the scenario. |
| Pictures & Sounds | Divinity imports scenario pictures and System Sound resources rather than editing arbitrary codec internals. |
| Picture Editor | Scenario pictures live in reserved high `PICT` ID ranges used by scenario startup/picture flows. |

## External Format Evidence

- AppleSingle/AppleDouble resource/data fork packaging is documented by RFC 1740.
- Classic Mac resource forks are Resource Manager containers with type/reference/name/data areas; Providence owns the container and payload boundaries.
- `PICT` is a QuickDraw picture command stream. Providence preserves arbitrary PICT payloads and writes only known-good project-owned replacements.
- `cicn` is a Classic color icon payload. Providence preserves arbitrary cicn payloads and writes only known-good 32 x 32 project-owned replacements.
- `snd ` is a Sound Manager resource. Providence preserves arbitrary snd payloads and writes only known-good project-owned sound effects.

## Generated Artifacts

- `docs/generated/scenario-target-compatibility.json`: per-scenario target/package shape and compatibility notes.
- `docs/generated/media-codec-boundary.json`: resource type policy for preserve/preview/write boundaries.
- `docs/generated/package-contract-matrix.json`: target export contract for Mac Classic, Windows Realmz, and portable Providence folders.

## Current Providence Behavior

- Import preserves raw source files and classifies resource forks, sidecars, custom music, runtime caches, and ignored OS metadata.
- Export copies raw source files first, then rewrites supported authored records and merges project-owned `PICT`, `cicn`, and `snd ` managed media into the source resource fork.
- `.DS_Store`, `Thumbs.db`, and `desktop.ini` are ignored as non-scenario metadata.
- Runtime caches remain inspect-only unless future target evidence proves a cache is required for loadability.

## Writer Gate

Normal authoring may write scenario records and known-good managed media. Full codec-internal editing of `PICT`, arbitrary `cicn`/icon-suite payloads, Sound Manager command variants, and custom music modules is stage-two media work and is not required for scenario semantic completion.
