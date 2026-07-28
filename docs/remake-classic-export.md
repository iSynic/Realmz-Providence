# Realmz Remake scenario v3 authoring and export

Providence projects can be compiled into two independent runtime products:

```text
Providence canonical project (schema 7)
|- Native compiler -> native Realmz scenario folder
`- Scenario exporter -> realmz-remake-scenario v3 -> Realmz Remake
```

The compatibility exporter reads the canonical project. It does not read the native compiler's
output, and Realmz Remake does not consume `project.json`. The bundle is an immutable,
self-contained projection governed by Realmz Remake's
`src/scripts/classic_runtime/BUNDLE_CONTRACT.md`.

## Export from Providence

In Providence desktop, open **Export**, choose **Realmz Remake Scenario Folder**, and select
**Export Remake Scenario Folder**. Choose or create an empty output folder. Providence writes
`campaign.json`, the canonical Classic documents under `classic`, immutable scenario-owned
resource payloads under `assets`, and decoded runtime media under `media`. The resulting folder is
ready for Realmz Remake's normal Classic campaign installer; it does not require a native Realmz
scenario installation.

The source-tree command remains available for automation and diagnostics:

```powershell
cargo run --manifest-path src-tauri/Cargo.toml --bin realmz-remake-converter -- `
  --project "C:\path\Scenario.providence" "C:\output\classic-bundle"
```

## Contract mapping

| Classic bundle concept | Providence source | Result |
| --- | --- | --- |
| Campaign identity and start | `scenario.id`, `scenario.name`, `scenario.shell` | Compatible. Schema 7 currently authors land starts only. |
| Map identity | `maps[].id`, `levelType`, `index` | Compatible namespaced string identity. |
| Runtime landlook changes | opcode `57` plus its `Data EDCD` row | Referenced stock landlooks with complete behavior tables are added to the asset catalog even when no map starts with that landlook, allowing Remake to materialize the matching Realmz PICT atlas before play. |
| Action Point identity | `triggers[].id` | Compatible stable identity; array position is not used. Data ED3 rows also carry authoritative `callable` reachability. Source and record-index evidence move to the sidecar. |
| Classic trigger or encounter action | `slot`, `rawCode`, normalized `code`, `id`, `gosub` | Exported as an explicit `kind: "classic"` instruction without reinterpretation. |
| Remake semantic action | `remakeRuntime.semanticActions[]` and script attachments | Replaces one exported action slot with a namespaced `kind: "semantic"` operation and JSON parameters. Named script attachments use `core.script.call`. |
| Runtime requirements | `remakeRuntime` | Gameplay-profile recommendation, built-in extension/API requirements, provider bindings, and target-support declarations are emitted in `runtime.json`. |
| Runtime record reachability | battle, encounter, macro, monster, map, timed-encounter, and item references | All records remain serialized. Battles and encounters carry additive `callable` markers, while `evidence.semanticDecoding.runtimeReachability` records the source-backed transitive closure and evidence paths used by Remake readiness. |
| Monster identity | `monsters[].id` and independent `nameId` | Compatible. The two IDs remain distinct, including when an authored action adds that monster as an ally. |
| Scenario item identity | record `id` and independent `itemId` | Compatible. The ownership proof includes shop item 901 and carried/equipped weapon 902. |
| Authorship and provenance | record `authored`, source fields, and normalized `provenance` | Runtime records retain gameplay fields only. Source labels, indices, byte ranges, confidence, hashes, and decoding diagnostics are keyed by record kind and stable ID in `classic/evidence.json`. |
| Interpreter evidence | dispatcher no-op observations and compact source/record evidence | Dispatcher no-op keys needed by gameplay remain in runtime data; audit explanation and source evidence live in the sidecar. |
| Managed resources | scenario-scoped `assets[].resourcePath` | Payload is moved to a bundle-relative file; the data URI is never serialized. |
| Scenario pictures | managed `PICT` resources or imported scenario-fork `assetCatalog.pictures` | Exact Classic bytes and deterministic PNG runtime media are packaged for every scenario-owned picture. |
| Scenario item icons | referenced `scenarioItems[].iconId` plus `scenarioIconResources` | Scenario-owned `cicn` bytes and deterministic PNG runtime media are packaged when a custom item references them; shared Realmz IDs remain runtime references. |
| Scenario monster icons | `monsterIconOverrides` plus `scenarioIconResources` | Each override is packaged under its target base ID and target-plus-308 facing ID with immutable `cicn` bytes and deterministic PNG runtime media. |
| Scenario sound effects | managed `snd ` resources and `assetCatalog.sounds` | Classic resource bytes remain immutable; decodable sounds also receive deterministic WAV `runtimeMedia` for Remake playback. |
| Scrolling text | managed or preserved scenario-owned `TEXT` resources with optional same-ID `styl` resources | `assets.scrollingTexts` receives decoded text and normalized `portable-rich-text-v1` presentation runs for player maps and standalone opcode 62 actions. Classic `styl` bytes are not copied into the runtime bundle. |
| Special land tile identity | negative `cicn` resource ID | Preserved in additive `assets.catalog.specialLandTiles`; referenced stock art is packaged from Providence's bundled Realmz reference resources, while the validated `icons` collection remains non-negative. |
| Race and caste table selection | project origin plus preserved `Data Race`, `Data Caste`, and main-fork `RLMZ` evidence | Emits `rules.tableSelection` so Remake does not mistake inactive built-in copies for scenario overrides. |

The v3 manifest identifies `campaignKind: "classic-compiled"` and references the eight Classic
runtime documents, required `classic/evidence.json`, `runtime.json`, and
`remake/scripts.json`. Documents use schema version 2. Every payload has a deterministic byte
count and SHA-256; the package hash is derived from the canonical manifest and its complete file
inventory. Runtime records retain semantic fields and stable Classic identities while
`rawBytes`, raw/trailing/reserved compatibility data, editor metadata, project paths, preview
paths, conversion controls, compatibility-annex locations, and embedded data URIs are omitted.
Custom-library assets are authoring-library state and are not bundled.

The exporter rebuilds Data ED3 reachability from canonical project records without reading the
compatibility annex. Every Extra Action Point remains in `scripts.triggers`; source-backed callable
rows export with `callable: true`, while unreferenced imported rows export with `callable: false`.
The corresponding classification and evidence path remain available under
`classic/evidence.json` under `semanticDecoding.ed3Reachability`.

The same source-backed traversal classifies callable battle, simple-encounter, complex-encounter,
macro, and monster records. Map triggers and random rectangles only root records for maps that
exist; timed encounters stop at Classic's first zero-day terminator; encounter result actions,
negative battle macros, battle grids, monster death macros, global scenario hooks, and usable door
items extend the transitive closure. Unreferenced imported records remain in their documents but
export with `callable: false` where the bundle record supports that marker. Consumers that predate
the marker continue to treat an absent value as callable.

Providence derives Remake media dependencies from authored actions and packages all available
scenario-owned media automatically. Authors do not separately classify pictures, sounds, or
player maps as progression-critical. Legacy project files that contain the former
`mediaRequiredForProgression` editor field remain readable, but the marker is omitted from new
Remake bundles. Missing or undecodable media remains an export/runtime diagnostic rather than an
author-maintained inclusion decision.

## Race and caste table selection

Classic selects the shared race and caste files for built-in scenarios even when the scenario
folder contains `Data Race` or `Data Caste`. Third-party scenarios use their local table when it
exists and otherwise fall back to the shared file. File presence alone therefore cannot tell a
consumer whether an exported row is active.

`classic/rules.json` includes additive `tableSelection.races` and `tableSelection.castes` evidence:

- a fresh authored project with no rows selects `shared`;
- authored rows select `scenario-local`, with their exact record IDs in `changedRecordIds`;
- an imported table paired with preserved built-in `RLMZ` metadata selects `shared`;
- an imported third-party table is compared byte-for-byte with Providence's checked-in shared
  baseline and selects `scenario-local`, with only differing records listed; and
- an imported table without enough preserved source evidence selects `unresolved`.

This is runtime-selection evidence, not a copy of the compatibility annex. Remake can ignore shared
rows, apply or gate only known changed local rows, and retain its conservative behavior for older
or unresolved bundles.

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
Managed replacements take precedence over preserved imported bytes. Every scenario-owned `TEXT`
resource is emitted through `assets.scrollingTexts`, including imported resources that remain in
the project-local preserved Scenario resource fork instead of `managedAssets`. Each object contains
decoded plain text and the TEXT payload's path, hash, byte count, and encoding. A same-ID `styl`
resource is decoded into ordered character ranges under `presentation`, using the
`portable-rich-text-v1` format with normalized font size, color, face, and stretch properties.
Remake therefore does not parse or carry Classic `styl` bytes. This campaign-wide collection
supplies standalone opcode 62 actions. When a player-map record has a negative `show` value, the
exporter also embeds the matching object on that record.

Referenced scenario item icons use the same ownership rule. Providence imports matching `cicn`
resources from the preserved Scenario resource fork into `scenarioIconResources`, retains their
Classic bytes, and emits deterministic PNG `runtimeMedia` under `media/images`. A scenario-owned
icon wins over a same-ID Vault or Realmz reference icon, matching Classic resource-chain behavior.

Scenario monster-icon overrides package both facings under the authored target IDs rather than the
source-library IDs. Their embedded Classic bytes are written under `assets/managed`, decoded PNGs
are written under `media/images`, and only portable metadata remains in `assets.json`. The
converter's `--update-icons` mode can apply the same projection to an existing Remake bundle while
preserving whether its JSON files use compact or multiline formatting.

If Providence's PICT decoder cannot produce a PNG, export fails with the picture identity and
decoder diagnostic. It does not emit a bundle that claims to be portable while silently depending
on a Remake fallback image or an installed native campaign.
The decoder recognizes QuickTime-compressed PICT records (`0x8200`) that embed GIF, JPEG, PNG, or
TIFF still images, plus QuickTime-uncompressed CopyBits records (`0x8201`), and normalizes the
decoded frame to the same deterministic PNG contract.
Unknown QuickTime codecs remain preserved and produce an explicit bounded unsupported-codec
diagnostic instead of being mislabeled as a malformed PICT.

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
referenced IDs from Providence's bundled Realmz reference resources. Resolved icons ship as
immutable Classic bytes under `assets/managed` and deterministic PNG `runtimeMedia` under
`media/images`; a genuinely missing Classic icon receives an explicit transparent runtime fallback.

## Runtime extensions, scenario scripts, and native target support

Providence consumes the generated extension catalog in
`schemas/remake-extension-catalog.json`. Authors select stable built-in IDs and edit JSON data
constrained by each extension's configuration and operation-parameter schemas. Extension code
always ships with Remake and cannot be supplied or replaced by a scenario.

Schema 7 adds `authoringTarget`, named script definitions, typed persistent variables, and
attachments for AP/XAP slots, encounter results, and campaign lifecycle hooks. The target selector
controls which authoring tools are visible; computed target support remains authoritative.
Switching the selector never discards an incompatible feature.

Scenario scripts have three explicit tiers:

- **Safe** source is parsed as an allowlisted GDScript-like subset and stored as a canonical typed
  AST. Text edits must parse and type-check before replacing that AST. Export writes deterministic
  VM instructions to `remake/scripts.json`; it does not create a `.gd` file.
- **Sandboxed** source is exact UTF-8 GDScript stored below `remake/source/` with its SHA-256,
  requested capabilities, API version, state-schema hash, and source map. Remake executes it only
  in the Windows isolated reducer runner.
- **Trusted** source uses the same exact-source and reducer contract, but Remake executes it in
  process only after Developer Scripting is enabled and the user approves the exact package hash
  and aggregate requested capabilities.

Safe syntax initially covers typed scalar values, bounded homogeneous arrays, locals, persistent
variables, assignment, arithmetic and boolean expressions, conditions, returns, acyclic named
script calls, and `await` only for registered yielding operations. Loops, recursion, arbitrary
Godot APIs, reflection, dynamic calls, classes, inheritance, signals, lambdas, and file access are
not part of the safe grammar.

The initial operation catalog covers quest flags and typed variables, text, choices, teleport,
battle start, and deterministic scenario RNG. Unavailable operations are export/readiness errors.
Providence does not silently promote a safe draft to a full tier.

Every full-tier `.gd` file must be declared in `remake/scripts.json` and in manifest integrity.
Undeclared `.gd`, `.gdc`, PCK, native libraries, executables, WebAssembly, and symlinks are
rejected. Exact source bytes are preserved; a one-byte change changes the package hash and
invalidates trusted approval.

Ordinary imported or authored Classic projects keep empty semantic actions and provider bindings,
so they remain eligible for both native Realmz and Realmz Remake export. Semantic actions or
Remake runtime bindings set `targetSupport.nativeRealmz` to false and make the native compiler
return an actionable diagnostic. Adding any scenario script also makes the project Remake-only.
Removing or converting all incompatible features makes native export eligible again. Merely
recommending `core.samuel` or declaring an otherwise unused built-in extension does not make a
project Remake-only.

Synchronize and verify the trusted catalog against a Remake checkout with:

```powershell
npm run generate:remake-extension-catalog -- --remake-root "C:\path\Realmz-Remake"
npm run check:remake-extension-catalog -- --remake-root "C:\path\Realmz-Remake"
```

## Managed Remake preview

Providence desktop keeps the Godot executable and local Remake checkout or installed-build path
in machine-local workspace settings, never in the project. **Apply and Restart** writes the current
project atomically to a temporary v3 package and starts an external Remake window with an
ephemeral profile and deterministic test party.

The companion uses a random per-launch nonce and a versioned loopback WebSocket protocol. It can
load a package; launch campaign start, a map, an AP, or a battle; stop; ping; and stream
diagnostics, VM trace, current location, state summary, and runtime errors. Remake maps trace IDs
back through script source maps and the evidence sidecar. Every run begins from clean package
state; live VM patching is intentionally deferred.

Preview follows normal Remake policy. Providence cannot bypass sandbox availability or trusted
approval. Browser Providence can author, validate, and export, but cannot launch a local process.

## Genuine gaps and unresolved runtime path semantics

Three boundaries remain:

1. Providence schema 7 has only `scenario.shell.landLevel` for the authored start. Scenario v3 can
   represent a dungeon start, but Providence cannot currently author that distinction. Current
   projects therefore export a land start without loss.
2. Providence's PICT decoder does not yet support every historical PICT variant. A successful
   bundle export is complete: every scenario-owned PICT has both immutable Classic bytes and PNG
   runtime media. An unsupported variant blocks export instead of becoming an implicit Remake or
   native-installation dependency.
3. The first scenario-script capability catalog intentionally implements only the quest vertical
   slice. Spell, item behavior, rules, AI, encounter-resolver, and broader lifecycle APIs require
   reviewed catalog additions before Providence can expose them.

Negative special-land identities remain in the additive optional
`assets.catalog.specialLandTiles` collection without reinterpreting ordinary non-negative icon IDs.

## Usage and verification

The output directory must be absent or empty. The exporter refuses absolute or parent-relative
managed-resource paths. For imported projects it reads only project-relative preserved files
needed to materialize scenario-owned PICT, `cicn`, and `TEXT` payloads, decode `styl` presentation
metadata, and establish Classic's race/caste table selection; semantic runtime records remain
canonical project projections.

To refresh scenario monster icons in an existing bundle without regenerating its other documents:

```powershell
cargo run --manifest-path src-tauri/Cargo.toml --bin realmz-remake-converter -- `
  --update-icons --project "C:\path\Scenario.providence" "C:\path\existing-classic-bundle"
```

The authoritative proof generates the bundle twice from
`fixtures/scenario-seeds/authoritative-ownership-proof.seed.json` and compares every file byte.
Its consumer-facing content covers a scenario-local shop item, a battle monster, a second
scenario-local item carried and equipped by that monster, and an authored Add Special Character
action. The same bundle separately carries immutable PICT, `snd `, and `cicn` payloads plus their
decoded PNG or WAV runtime media. Its second player-map record proves decoded scrolling TEXT with
paired immutable styl provenance.
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
