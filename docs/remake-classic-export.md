# Realmz Remake scenario v2 export

Providence projects can be compiled into two independent runtime products:

```text
Providence canonical project (schema 6)
|- Native compiler -> native Realmz scenario folder
`- Scenario exporter -> realmz-remake-scenario v2 -> Realmz Remake
```

The compatibility exporter reads the canonical project. It does not read the native compiler's
output, and Realmz Remake does not consume `project.json`. The bundle is an immutable,
self-contained projection governed by Realmz Remake's
`src/scripts/classic_runtime/BUNDLE_CONTRACT.md`.

## Contract mapping

| Classic bundle concept | Providence source | Result |
| --- | --- | --- |
| Campaign identity and start | `scenario.id`, `scenario.name`, `scenario.shell` | Compatible. Schema 6 currently authors land starts only. |
| Map identity | `maps[].id`, `levelType`, `index` | Compatible namespaced string identity. |
| Action Point identity | `triggers[].id`, `source`, `recordIndex` | Compatible stable identity; array position is not used. Data ED3 rows also carry authoritative `callable` reachability. |
| Classic trigger or encounter action | `slot`, `rawCode`, normalized `code`, `id`, `gosub` | Exported as an explicit `kind: "classic"` instruction without reinterpretation. |
| Remake semantic action | `remakeRuntime.semanticActions[]` | Replaces one exported action slot with a namespaced `kind: "semantic"` operation and JSON parameters. |
| Runtime requirements | `remakeRuntime` | Gameplay-profile recommendation, built-in extension/API requirements, provider bindings, and target-support declarations are emitted in `runtime.json`. |
| Monster identity | `monsters[].id` and independent `nameId` | Compatible. The two IDs remain distinct. |
| Scenario item identity | record `id` and independent `itemId` | Compatible. The ownership proof is record 101 / item 901. |
| Authorship and provenance | record `authored` and normalized `provenance` | Compatible. Source paths are reduced to portable source labels. |
| Interpreter evidence | dispatcher no-op observations and compact source/record evidence | Compatible additive evidence. |
| Managed resources | scenario-scoped `assets[].resourcePath` | Payload is moved to a bundle-relative file; the data URI is never serialized. |
| Scenario pictures | managed `PICT` resources or imported scenario-fork `assetCatalog.pictures` | Exact Classic bytes and deterministic PNG runtime media are packaged for every scenario-owned picture. |
| Scenario sound effects | managed `snd ` resources and `assetCatalog.sounds` | Classic resource bytes remain immutable; decodable sounds also receive deterministic WAV `runtimeMedia` for Remake playback. |
| Special land tile identity | negative `cicn` resource ID | Preserved in additive `assets.catalog.specialLandTiles`; referenced stock art is packaged from Providence's bundled Realmz reference resources, while the validated `icons` collection remains non-negative. |

The v2 manifest identifies `campaignKind: "classic-compiled"` and references nine Classic
documents plus the required root `runtime.json`. Each document currently uses schema version 1
inside the format-v2 envelope. Runtime records retain semantic fields and stable
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
`payloadPath` and these payload fields:

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
catalog entries. Every scenario-owned PICT receives deterministic PNG `runtimeMedia` under
`media/pictures`, including imported pictures that remain catalog metadata rather than managed
assets. For imported projects, the immutable Classic PICT bytes come from the project-local
preserved Scenario resource fork; the exporter never consults the original campaign installation.
Managed replacements take precedence over preserved imported bytes. TEXT and styl payloads remain
addressable through `managedAssets` because the current scenario contract has no dedicated
text-resource catalog.

If Providence's PICT decoder cannot produce a PNG, export fails with the picture identity and
decoder diagnostic. It does not emit a bundle that claims to be portable while silently depending
on a Remake fallback image or an installed native campaign.

For each scenario-scoped managed `snd ` resource, Providence decodes the same canonical Classic
resource bytes used by the native compiler into a deterministic WAV under `media/sounds`. Both the
managed-asset row and its `assets.catalog.sounds` row receive the `runtimeMedia` object
with a campaign-relative path, `audio/wav` media type, byte length, and SHA-256 hash. The Classic
payload remains separately available through `payloadPath`; Providence never changes that field to
mean decoded audio. A managed sound that cannot be decoded is rejected rather than exported with a
false Remake-playback claim. Imported catalog-only sounds remain metadata until they are promoted
to a canonical scenario-managed asset.

Referenced negative land fields are normalized to their signed `cicn` identities without changing
the authored field values. When a matching scenario-managed payload is absent, the exporter resolves
only those referenced IDs from Providence's bundled Realmz reference resources. Each resolved icon
ships as immutable Classic bytes under `assets/managed` and deterministic PNG `runtimeMedia` under
`media/images`. Missing referenced stock art fails export instead of becoming approximate terrain.

## Runtime extensions and native target support

Providence consumes the generated extension catalog in
`schemas/remake-extension-catalog.json`. Authors select stable built-in IDs and edit JSON data
constrained by each extension's configuration and operation-parameter schemas. No `.gd`, `.gdc`,
PCK, native library, or executable path is stored in the project or exported package.

Ordinary imported or authored Classic projects keep empty semantic actions and provider bindings,
so they remain eligible for both native Realmz and Realmz Remake export. Semantic actions or
Remake runtime bindings set `targetSupport.nativeRealmz` to false and make the native compiler
return an actionable diagnostic. Merely recommending `core.samuel` or declaring an otherwise
unused built-in extension does not make a project Remake-only.

Synchronize and verify the trusted catalog against a Remake checkout with:

```powershell
npm run generate:remake-extension-catalog -- --remake-root "C:\path\Realmz-Remake"
npm run check:remake-extension-catalog -- --remake-root "C:\path\Realmz-Remake"
```

## Genuine gaps and unresolved runtime path semantics

Three boundaries remain:

1. Providence schema 6 has only `scenario.shell.landLevel` for the authored start. Scenario v2 can
   represent a dungeon start, but Providence cannot currently author that distinction. Current
   projects therefore export a land start without loss.
2. Providence's PICT decoder does not yet support every historical PICT variant. A successful
   bundle export is complete: every scenario-owned PICT has both immutable Classic bytes and PNG
   runtime media. An unsupported variant blocks export instead of becoming an implicit Remake or
   native-installation dependency.
3. The only built-in extension currently published is a conformance fixture. Production spell,
   item, encounter, AI, lifecycle, and gameplay-provider IDs must be added to Remake's trusted
   catalog before Providence can author them.

Negative special-land identities remain in the additive optional
`assets.catalog.specialLandTiles` collection without reinterpreting ordinary non-negative icon IDs.

## Usage and verification

Export an existing Providence project:

```powershell
cargo run --manifest-path src-tauri/Cargo.toml --bin realmz-remake-converter -- `
  --project "C:\path\Scenario.providence" "C:\output\classic-bundle"
```

The output directory must be absent or empty. The exporter refuses absolute or parent-relative
managed-resource paths. For imported projects it reads only project-relative preserved resource
forks needed to materialize catalogued scenario PICTs; semantic runtime records remain canonical
project projections and do not consult `raw-sources`.

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
