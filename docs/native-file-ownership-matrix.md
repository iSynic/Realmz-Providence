# Native file ownership matrix

This matrix records the authoritative compiler policy for optional media and legacy packaging.
The canonical Providence project owns scenario semantics; a native Realmz folder and a Realmz
Remake Classic bundle are independent projections of that model. Container names and wrappers do
not become canonical merely because an imported scenario used them.

The classifications used here are:

- **authored**: canonical scenario data or media that Providence can create and change;
- **normalized-container**: deterministic packaging generated from canonical data;
- **annex-only**: imported compatibility material retained byte-for-byte outside ordinary fresh
  authoring; and
- **intentionally omitted**: OS or distribution state that is not scenario content.

| Native family | Classification | Fresh authored project | Imported project | Native Realmz projection | Realmz Remake projection | Follow-up owner |
| --- | --- | --- | --- | --- | --- | --- |
| Scenario `snd ` sound effects | authored | Import or create as scenario-scoped managed sounds with stable Classic resource IDs. | Catalog-only legacy sounds remain metadata until promoted to managed canonical assets; unsupported payloads stay in the annex. | Compiled into the generated scenario resource sidecar with the other managed resources. | Classic `snd ` payload is preserved and a deterministic WAV is emitted as `assets.catalog.sounds[].runtimeMedia` when Providence can decode it. | Current compiler/exporter; no music dependency. |
| `Custom 1 Music` through `Custom 9 Music` | authored family, implementation deferred | Not emitted until Providence has a canonical playlist/reference contract. | Preserve exact imported files in the compatibility annex and pass them through only on legacy-preserving native export. | Optional scenario-local runtime files, not part of authoritative compiler acceptance. | Omitted: Classic bundle v1 defines sound effects but no custom-music or playlist semantics. | [ISY-347](https://linear.app/isynic/issue/ISY-347/add-scenario-music-asset-import-authoring-and-export-support), after the runtime contract is settled. |
| Legacy `Custom 1` through `Custom 9` companions without ` Music` | annex-only | Omitted. Custom landlook authoring uses canonical metadata plus managed PICT atlases, not these pass-through files. | Preserve byte-for-byte when present; do not infer music or landlook semantics. | Legacy-preserving export may copy them unchanged. | Omitted because no bundle-v1 meaning is defined. | New evidence issue only if a runtime consumer is proven. |
| `Scenario.rsrc`, `Data ID.rsrc`, and `Data Spell.rsrc` | normalized-container | Generated deterministically from canonical resources and semantic updates. | Parse supported resources into the canonical model; keep unsupported resource entries in the bounded annex. | Emitted at the contract-v14 target paths. | Semantic catalogs and immutable managed payloads are projected directly from the canonical model, not parsed from native output. | Current compiler/exporter. |
| Legacy `.rsf` resource-sidecar names | normalized-container representation plus annex residue | Not selected as a distinct authored format; fresh output uses the target path from the native manifest policy. | Parse as a resource-fork container when supported. Preserve malformed or unsupported wrapper bytes in the annex. | Normalize supported resources into deterministic compiler output; retain exact legacy form only for an explicitly legacy-preserving export. | Never bundled as a wrapper merely because the import used `.rsf`. | No core blocker. |
| AppleDouble `._*` resource-fork wrappers | normalized transport container plus annex residue | Not currently emitted. A future fork-aware Classic transport may generate AppleDouble from canonical resource-fork bytes. | Parse the resource-fork entry when supported and preserve unparsed entries in the annex. | Current folder/ZIP output keeps `Scenario.rsrc` separate; stock Classic HFS attachment remains optional transport work. | Omitted; the bundle carries portable payload files and hashes instead. | Classic-Mac fork-aware packaging follow-up. |
| Extracted resource payload sidecars | normalized-container when generated; annex-only when unknown | Generated only for a named compiler or compatibility target. | Preserve unknown extraction-tool sidecars in the annex; do not make them semantic inputs. | Required payloads are rebuilt from canonical assets rather than copied from extraction output. | Bundle-relative managed payloads are generated directly from canonical assets. | Target-specific exporter work only. |
| `Format` and `Icon_` legacy companions | annex-only | Omitted unless new runtime evidence establishes a required generated meaning. | Preserve when present without exposing normal authoring controls. | Legacy-preserving export may copy them unchanged. | Omitted. | Evidence issue if promoted. |
| Finder/OS metadata (`.DS_Store`, `.finf`, `Thumbs.db`, `desktop.ini`) | intentionally omitted | Never created. | Ignore rather than preserve as scenario data. | Never emitted. | Never emitted. | None. |
| README, installer, archive, and storefront material | intentionally omitted from compiler; user-managed distribution | Authors may place these beside built output, but they are not part of the canonical scenario definition. | Do not treat them as scenario semantics or compiler inputs. | Distributed separately at the author's discretion. | Distributed separately at the author's discretion. | Distribution tooling, outside compiler acceptance. |

## Acceptance boundary

Core authoritative compiler completion requires the canonical model, deterministic native files,
generated resource containers, and runtime-relevant managed assets. It does not require custom
music, AppleDouble/HFS transport, preservation of Finder state, or reconstruction of unknown
extraction-tool sidecars.

This boundary does not make scenario audio optional as a whole. Scenario `snd ` effects already
have canonical authoring, native resource output, and a Remake runtime-media projection. Only the
separate filename-based custom-music family remains deferred.
