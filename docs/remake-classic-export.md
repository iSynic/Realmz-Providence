# Realmz Remake Classic bundle export

Providence projects can be compiled into two independent runtime products:

```text
Providence canonical project (schema 5)
|- Native compiler -> native Realmz scenario folder
`- Compatibility exporter -> Classic bundle v1 -> Realmz Remake
```

The compatibility exporter reads the canonical project. It does not read the native compiler's
output, and Realmz Remake does not consume `project.json`. The bundle is an immutable,
self-contained projection governed by Realmz Remake's
`src/scripts/classic_runtime/BUNDLE_CONTRACT.md`.

## Contract mapping

| Classic bundle concept | Providence source | Result |
| --- | --- | --- |
| Campaign identity and start | `scenario.id`, `scenario.name`, `scenario.shell` | Compatible. Schema 5 currently authors land starts only. |
| Map identity | `maps[].id`, `levelType`, `index` | Compatible namespaced string identity. |
| Action Point identity | `triggers[].id`, `source`, `recordIndex` | Compatible stable identity; array position is not used. Data ED3 rows also carry authoritative `callable` reachability. |
| Trigger action | `slot`, `rawCode`, normalized `code`, `id` | Compatible without reinterpretation. |
| Encounter result action | `slot`, `rawCode`, `id` | Compatible; Remake normalizes signed encounter opcodes when selecting a result. |
| Monster identity | `monsters[].id` and independent `nameId` | Compatible. The two IDs remain distinct. |
| Scenario item identity | record `id` and independent `itemId` | Compatible. The ownership proof is record 101 / item 901. |
| Authorship and provenance | record `authored` and normalized `provenance` | Compatible. Source paths are reduced to portable source labels. |
| Interpreter evidence | dispatcher no-op observations and compact source/record evidence | Compatible additive v1 evidence. |
| Managed resources | scenario-scoped `assets[].resourcePath` | Payload is moved to a bundle-relative file; the data URI is never serialized. |
| Scenario sound effects | managed `snd ` resources and `assetCatalog.sounds` | Classic resource bytes remain immutable; decodable sounds also receive deterministic WAV `runtimeMedia` for Remake playback. |
| Special land tile identity | negative `cicn` resource ID | Preserved in additive `assets.catalog.specialLandTiles`; v1's validated `icons` collection permits only non-negative IDs. |

All nine version-1 JSON documents are emitted. Runtime records retain semantic fields and stable
Classic identities while `rawBytes`, raw/trailing/reserved compatibility data, editor metadata,
project paths, preview paths, conversion controls, compatibility-annex locations, and embedded
data URIs are omitted. Custom-library assets are authoring-library state and are not bundled.

The exporter rebuilds Data ED3 reachability from canonical project records without reading the
compatibility annex. Every Extra Action Point remains in `scripts.triggers`; source-backed callable
rows export with `callable: true`, while unreferenced imported rows export with `callable: false`.
The corresponding classification and evidence path remain available under
`evidence.semanticDecoding.ed3Reachability`.

## Managed resource payloads

Each export-ready, scenario-scoped managed asset becomes a deterministic file under
`assets/managed`. The filename is derived from its Classic resource type, signed ID, and the first
12 hexadecimal characters of the packaged payload hash. `classic/assets.json` references it with
`payloadPath` and the additive version-1 fields:

- `payloadEncoding: "classic-resource-data"`;
- `payloadBytes`;
- `payloadSha256`; and
- `payloadMediaType`.

Providence's existing managed-asset `bytes` and `sha256` fields are not reused. For converted
assets, especially a normalized bitmap converted to PICT, those fields describe the authoring
asset while `resourcePath` contains different Classic resource bytes. The bundle fields are
computed from the actual packaged payload, avoiding a second meaning for the existing names.
For the same reason, authoring-asset `fileName` and `mimeType` are not copied onto the packaged
resource. `payloadMediaType` describes the payload container (currently
`application/octet-stream` for the generated Classic resource data).

The exporter also attaches the payload path to matching picture, icon, sound, and custom-tileset
catalog entries. TEXT and styl payloads remain addressable through `managedAssets` because bundle
v1 has no dedicated text-resource catalog.

For each scenario-scoped managed `snd ` resource, Providence decodes the same canonical Classic
resource bytes used by the native compiler into a deterministic WAV under `media/sounds`. Both the
managed-asset row and its `assets.catalog.sounds` row receive the bundle-v1 `runtimeMedia` object
with a campaign-relative path, `audio/wav` media type, byte length, and SHA-256 hash. The Classic
payload remains separately available through `payloadPath`; Providence never changes that field to
mean decoded audio. A managed sound that cannot be decoded is rejected rather than exported with a
false Remake-playback claim. Imported catalog-only sounds remain metadata until they are promoted
to a canonical scenario-managed asset.

## Genuine gaps and unresolved runtime path semantics

No format-version change is required for the current projection, but four boundaries remain:

1. Providence schema 5 has only `scenario.shell.landLevel` for the authored start. Bundle v1 can
   represent a dungeon start, but Providence cannot currently author that distinction. Current
   projects therefore export a land start without loss.
2. Bundle v1 validates `payloadPath` portability but does not define the image encoding expected by
   each Remake adapter. The current Remake picture adapter searches a campaign's `Splash Images`
   directory for displayable images and does not directly consume packaged PICT/cicn bytes.
   Providence labels those files `classic-resource-data` rather than claiming they are PNG or
   installed Remake assets. Sound is no longer part of this gap: Remake accepts additive
   `audio/*` runtime media, and Providence derives WAV from supported managed `snd ` resources.
3. Scenario-icon and monster-icon override records are preserved as portable metadata, but their
   legacy embedded resource payload fields are compatibility-annex data and are intentionally
   omitted. Only scenario-scoped `ManagedAsset` payloads are packaged. A canonical asset intended
   for direct Remake use therefore needs to be represented as a managed asset.
4. Realmz special land tiles deliberately use negative `cicn` resource IDs. Bundle v1 validates
   the known `assets.catalog.icons[].resourceId` identity as non-negative, so that collection cannot
   represent them without changing its meaning. Providence retains these identities in managed
   assets and the additive optional v1 collection `assets.catalog.specialLandTiles`. Existing v1
   consumers ignore the new catalog while still accepting the bundle; a future adapter can consume
   it without reinterpreting ordinary icon IDs.

The second boundary is an asset-adapter contract question, not a reason to change record semantics.
A future compatible addition can define derived Remake-native media alongside the immutable Classic
payload. If `payloadPath` itself is later required to mean only decoded runtime media, that meaning
must be clarified or versioned before either producer or consumer changes.

## Usage and verification

Export an existing Providence project:

```powershell
cargo run --manifest-path src-tauri/Cargo.toml --bin realmz-remake-converter -- `
  --project "C:\path\Scenario.providence" "C:\output\classic-bundle"
```

The output directory must be absent or empty. The exporter refuses absolute or parent-relative
managed-resource paths and never reads `raw-sources`.

The authoritative proof generates the bundle twice from
`fixtures/scenario-seeds/authoritative-ownership-proof.seed.json` and compares every file byte.
Run the cross-repository consumer gate with explicit checkout/tool paths:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify_remake_classic_export.ps1 `
  -ProvidenceRoot "C:\path\Realmz-Providence" `
  -RemakeRoot "C:\path\Realmz-Remake" `
  -Godot "C:\path\godot.exe"
```

The gate regenerates Providence's ignored proof workspace, passes the first deterministic bundle
to Remake's generic headless validator, and verifies that the Remake working-tree status is
unchanged.
