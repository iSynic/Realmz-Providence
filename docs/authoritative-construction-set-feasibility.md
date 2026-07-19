# Providence As The Authoritative Realmz Construction Set

Date: 2026-07-18
Repository state audited: `main` at `0837de8` (`Update asset smoke for Realmz Gallery`)

## Investigation Branch Status

Implementation began after this decision was documented on
`investigation/authoritative-realmz-compiler`.

The first bounded compiler slice now:

- creates fresh desktop projects with no `raw-sources` directory or source-file inventory;
- allows annex-free authored projects to export while still rejecting an imported project whose
  preservation annex is missing;
- emits the startup `Scenario` file, empty resource fork, `Data CS`, fixed `Data NI` capacity,
  blank `Data Solids`, and required zero-length runtime tables directly as compiler defaults;
- passes `None` to preservation-aware record/resource writers for fresh projects, preventing raw
  file probes as well as raw-byte reads;
- produces the same fresh Windows folder bytes on repeated compilation and emits the same
  `Scenario`/`Scenario.rsrc` convention for the Classic-Mac folder target.

The second proof slice adds `authoritative-ownership-proof.seed.json` and a repository gate that:

- compiles one walkable land map, one message, and one Action Point with a persistent quest flag;
- serializes the TypeScript canonical model directly as `project.json`, with no generated raw
  snapshot adapter;
- opens that project through Rust and compiles complete Windows and Classic-Mac native folders;
- proves repeated Windows and Classic-Mac compilation is byte-identical for each target;
- reimports the native Windows folder and recovers the map, Action Point actions, and message;
- confirms `raw-sources` appears only on that conservative legacy reimport boundary.

The third proof slice adds a repeatable Realmz runtime gate. It found and fixed one semantic
compiler defect: Realmz treats quest flag `0` as a clear/sentinel value and `127` as its historical
registration marker, so fresh authored quests must allocate from `1..126`. The corrected native
folder then passed scenario selection, party startup, movement, message Action Point execution,
quest mutation, save, displacement, reload, and restored-state assertions.

The automated gate uses the existing Oracle-instrumented modern Realmz executable and changes no
Realmz source or binary on this branch. This proves that the ordinary native folder is sufficient
for the modern runtime path without requiring Realmz changes. Running the Classic-Mac target in a
stock Classic Realmz executable remains a separate compatibility check.

The fourth slice makes that boundary part of the project contract rather than an exporter
heuristic. Project schema v5 adds `source.origin` with `authored` and `imported` values. Fresh and
Scenario-JSON projects declare authored origin; scenario imports declare imported origin; schema-v4
projects are upgraded on open using the former `immutable`/source-inventory signals. Native export
now consults origin alone, and an authored browser project ZIP no longer contains or references a
`raw-sources` compatibility annex. Imported packages retain their captured bytes unchanged.

The fifth slice removes the browser-native generated-snapshot adapter. The browser compiler now
emits its startup shell, 600-byte support file, valid empty resource fork, security backup, fixed
`Data NI` capacity, `Data Solids`, door tables, and required empty runtime tables directly. Fresh
browser projects and Scenario-JSON projects no longer create a source inventory or save a generated
annex. Imported projects still require their captured annex and retain byte-for-byte pass-through
behavior. The nine Scenario-JSON lanes now exercise 18 direct no-annex browser-native exports, and
the authoritative proof requires the TypeScript and Rust compilers to emit byte-identical Windows
and Classic-Mac native file manifests from the same canonical project.

The sixth slice closes the first concrete TypeScript/Rust project-contract drift. Rust now
persists and migrates canonical `itemTexts`, imports legacy `Data ID` string resources into
non-authored compatibility records, and deterministically emits fresh `Data ID.rsrc` families from
authored records without an annex. The ownership proof now authors scenario item 901 entirely in
Scenario JSON, carries its names and description through Rust save/open, requires byte-identical
browser/desktop resources for both targets, and recovers the text on native-folder reimport.

The seventh slice completes the fresh custom-spell container path. Both compilers now emit the
runtime's fixed 105 x 30-byte `Data Spell` table when canonical spell overrides exist and create
the needed `STR# 5000..5006` families directly from canonical display names. Imported short files,
trailing bytes, resource entry metadata, unrelated resources, and direct legacy-name edits retain
their previous preservation behavior. The ownership proof carries custom spell 16 through
TypeScript compilation, Rust save/open, byte-identical Windows/Classic-Mac output, and semantic
reimport without an annex.

The eighth slice completes fresh race/caste rule tables and corrects a stale capacity assumption.
Scenario `Data Race` is 30 x 408 bytes, not the 70 records used by the shared race library/name
catalog; `Data Caste` is 30 x 576 bytes. Both compilers now start from one checked-in, hash-gated
Realmz rules baseline and overlay canonical records, while the project model explicitly owns the
native `spare`/`spacer` words. Fresh records carry no `rawBytes`; imported records, aligned legacy
rows, and malformed tails retain compatibility preservation. The ownership proof now carries one
race and one caste through TypeScript compilation, Rust save/open, byte-identical native output,
semantic reimport, and the unmodified Realmz runtime.

The ninth slice makes the export-time compatibility boundary explicit. Rust export now resolves
legacy files only through a bounded `CompatibilityAnnex`, and browser export constructs its annex
wrapper only for imported projects. Authored projects never receive either resolver, even when a
stray desktop `raw-sources` directory or browser snapshot is supplied. Poison-annex proof cases
fail if authored compilation enumerates pass-through files or reads a preserved record tail, while
the imported fixture corpus remains byte-identical.

The tenth slice separates Rust compilation from filesystem materialization. Desktop export first
preloads the optional compatibility annex and managed-asset payloads, then a path-free compiler
builds an ordered `NativeScenarioManifest` containing every generated and pass-through file. Only
the final exporter boundary creates the output directory and writes the completed manifest. A
direct unit proof deletes the fresh project's directory before compiling twice and requires the
same complete manifest, while the imported fixture corpus and browser/desktop parity remain
byte-identical.

The eleventh slice makes authored validation consume the compiler's expected native manifest
instead of treating `project.source.files` as the export inventory. The Export panel now reports
compiler output for fresh projects, while imported validation remains source-driven at the
compatibility boundary.

The twelfth slice makes the same origin boundary explicit for semantic mapping. Authored desktop
and browser projects now build their semantic graph with no compatibility buffers, even when a
stray `raw-sources` directory or registered browser snapshot exists. Canonical maps, Action Points,
and other directly modeled families remain available, and managed scenario resources are indexed
directly from canonical asset metadata. Imported projects retain raw-buffer enrichment. Focused
poison-snapshot tests enforce both sides of the boundary; direct canonical summaries for the
remaining supporting record families are still an incremental coverage task.

The thirteenth slice closes the first four supporting-record semantic gaps. Authored desktop and
browser projects now compile canonical scenario items (`Data NI`), treasures (`Data TD`), thief
encounters (`Data TD2`), and timed encounters (`Data TD3`) through the existing deterministic
native writers and proven semantic decoders. Their canonical records are confirmed and editable;
embedded compatibility bytes are ignored, and zero-filled native slots used to encode sparse
record IDs are not exposed as project entities. Imported buffers retain their source-backed,
inspect-only evidence path. Messages, shops, and simple/complex encounters remain the next
direct-canonical semantic tier.

The fourteenth slice completes that supporting-record tier. Authored desktop and browser projects
now compile canonical messages (`Data SD2`), shops (`Data SD`), simple encounters (`Data ED`), and
complex encounters (`Data ED2`) through the same native writers used by export and map the result
through the proven semantic decoders. Poison-byte regressions prove that embedded imported bytes
cannot influence the authored path even when a record is mislabeled `authored: false`; only
explicit canonical IDs become confirmed/editable, and sparse native padding remains hidden.
Imported records retain source-backed, inspect-only semantics and complex encounters retain their
thief-encounter links.

The fifteenth slice extends canonical semantic ownership to the remaining fixed-text records:
option labels (`Data OD`) and monster descriptions (`Data DES`). Both runtimes now encode authored
project records with the deterministic native writers, decode their semantic summaries from those
bytes, ignore embedded compatibility payloads, and prune sparse native slots. Imported text
records remain source-backed and inspect-only. This leaves combat records and rule overrides as
separate semantic-coverage slices with their own cross-record and fixed-capacity concerns.

The sixteenth slice completes canonical combat semantic ownership for battles (`Data BD`), primary
monsters (`Data MD`), and the two native alternate monster sets (`Data MD1` and `Data MD-1`). Both
runtimes now encode these project records with the deterministic native writers, decode semantic
summaries from the resulting bytes, prune sparse native slots, and rebuild battle-to-monster,
battle-to-message, monster-to-icon, and monster-to-death-macro relationships. Embedded imported
bytes cannot influence authored summaries. Imported combat buffers retain their source-backed,
inspect-only path, and non-native monster-set filenames remain compatibility material rather than
new canonical output families.

The seventeenth slice closes the remaining fixed-family semantic gap for custom spells
(`Data Spell`), races (`Data Race`), and castes (`Data Caste`). Fresh fixed-capacity byte
construction now lives in shared compiler helpers used by desktop export and desktop semantics,
with equivalent shared browser helpers used by browser export and browser semantics. Canonical
summaries are decoded from the exact 105-, 30-, and 30-record native buffers, embedded imported
record bytes cannot affect authored results, and compiler-baseline slots not present in the project
remain hidden. Imported rule files retain source-backed, inspect-only semantics.

The eighteenth slice establishes the first generated project-contract seam without changing the
persisted schema version. `schemas/providence-project.schema.json` now owns schema v5's ordered
39-field `project.json` inventory, the authored/imported source-origin boundary, and the explicit
omission of derived `semanticSchema` data. One generator emits the shared version and field
inventories for TypeScript and Rust; its check compares the schema against the TypeScript
`Project`, Rust `ProvidenceProject`, and Rust's actual `ProjectFile` serializer. Nested domain DTOs
remain handwritten for now, but a field added to only one model or serializer fails the repository
gate before it can silently diverge from another compiler target.

The nineteenth slice moves the first nested DTO family under that generator. Project origin,
source-file role, source-file metadata, and the project source snapshot now derive from the same
schema in TypeScript and Rust; the handwritten exports are aliases/re-exports rather than duplicate
definitions. The persisted schema-v5 source requires explicit origin, while the generated runtime
form keeps only `origin` optional so schema-v4 imports can be classified and normalized before
save. Source-file roles are now the shared four-value compatibility vocabulary, and browser package
import normalizes unknown legacy labels at that boundary.

The twentieth slice moves scenario identity and startup metadata under the same generator without
changing schema version 5. `ScenarioMeta`, the startup shell/support/contact/restriction/global-hook
DTOs, and global macro-hook rows now have one JSON Schema definition consumed by TypeScript and
Rust. The schema records the serialization differences required for legacy project loading while
explicitly tagging `rawBytes` and shell `trailingBytes` as compatibility-only fields. They remain
readable for imported projects during this migration, but are not reclassified as authoritative
authored data; moving their payloads into the bounded annex remains separate work.

Branch validation through the twentieth slice completed on 2026-07-18:

- full Rust suite: 203 passed, 2 ignored;
- full TypeScript suite: 524 passed, plus typecheck;
- ten-lane Scenario JSON generation smoke with 20 Windows/Classic-Mac exports;
- generated-scenario baseline check;
- canonical-to-native authoritative scenario proof;
- authored poison-annex access guard in both Rust and browser compilers;
- Oracle runtime ownership proof with seven successful gameplay steps and no fatal markers;
- browser/desktop imported-scenario parity check;
- production browser build, UI audit, and a live fresh-project native-export smoke.

The aggregate `npm run check` currently stops after the 524 passing TypeScript tests because the
module-size baseline reports unrelated pre-existing ISY-319/320/321 growth in map, assembly/economy,
and CSS files. Those files are outside this slice; architecture, lint, unit, typecheck, UI audit,
production build, scenario proof, package parity, and the full Rust suite were run independently.

## Verdict

Pursue this as an evolution of the existing Providence repository on a dedicated branch.
Do not start a separate application or repository, and do not require Realmz changes for the
feasibility path.

Providence already has the major parts of a construction set:

- a broad normalized project model in TypeScript and Rust;
- fresh-project constructors;
- a semantic Scenario JSON compiler that allocates and creates maps, Action Points, EDCD rows,
  records, rules, and managed assets;
- Rust and browser writers for nearly every practical scenario data family;
- resource-fork parsing, merging, and construction;
- Windows and Classic-Mac package targets;
- import, round-trip, fixture, browser/desktop parity, and scenario-generation test suites;
- an established editor UI that operates primarily on semantic project fields.

The investigation branch has removed that coupling from fresh desktop and browser projects: both
compile from canonical data without manufacturing or consulting a raw snapshot. Imported projects
alone retain a compatibility annex. The remaining browser/desktop duplication is a consolidation
and parity-hardening task, not evidence that the project model or editor must be replaced.

The recommended design is:

```text
Providence project (authoritative canonical data)
                 |
                 v
       deterministic Realmz compiler
                 |
       +---------+----------+
       |                    |
       v                    v
Windows native folder   Classic-Mac native package

Legacy import
     |
     +--> canonical supported data
     +--> bounded compatibility annex ----> compiler preservation input
```

Generated Realmz caches and save state remain outside the project and compiler. Realmz creates
them from the emitted scenario source files.

## Direct Answers To The Investigation Questions

| Question | Answer |
| --- | --- |
| 1. Can the current model become authoritative without a disruptive rewrite? | **Yes.** It already represents the minimum proof and most construction-set families. Add explicit authored/imported origin, remove preservation data from the normal fresh path, and migrate model drift. |
| 2. Can fresh projects export with no `raw-sources`? | **Yes on the investigation branch.** Fresh desktop projects now omit the directory and source inventory, and annex-free export emits compiler defaults directly. Imported projects still require their compatibility material. |
| 3. Which native files are completely generated? | Maps, trigger tables, random levels, ED3/EDCD, messages, options, monsters/descriptions, treasures, shops, thief/timed encounters, custom spell records/names, contact/restrictions, and most record cores have writers. The detailed matrix separates truly fresh-generated bytes from compatibility ranges and baseline-supplied capacities. |
| 4. Which still depend on preserved/placeholder/resource assumptions? | The 600-byte `Scenario`, main resource-fork default, `Data CS`, blank `Data Solids`, fixed `Data NI` capacity, required empty startup files, imported `Data Spell` tails, other record compatibility ranges, custom music, and arbitrary legacy resources. Race/caste tables no longer require preserved bytes for fresh output. |
| 5. Can legacy preservation be isolated? | **Yes, and the boundary is explicit on the investigation branch.** Schema v5 records authored/imported origin; native export requires the annex only for imported projects. Remaining work is moving embedded record tails and browser-native preservation behind the same contract. |
| 6. Can TypeScript and Rust derive from one schema? | **Yes, incrementally.** The investigation branch generates the shared schema version, persisted top-level inventory, complete source/origin/source-file DTO family, and scenario identity/startup DTO family from JSON Schema. It checks both project models plus the Rust serializer; remaining record, rule, map, and asset DTOs can migrate family by family. |
| 7. Can export become a deterministic compiler without a UI rewrite? | **Yes.** The UI already calls thin desktop/browser export boundaries with a `Project`; extract a pure file/resource manifest compiler behind them. |
| 8. Which editor components require imported byte identity? | No major workbench requires it as its primary model. A bounded set of marker fallbacks, blank-record tests, provenance displays, library decoders, parsers, semantic builders, and writers use it; see the component table below. |
| 9. What is the smallest ownership proof? | A no-annex fresh project compiled twice byte-identically, reimported, then consumed through Realmz's ordinary scenario path with movement, one message Action Point, save, and reload. |
| 10. Would a new codebase remove a blocker? | **No concrete blocker was found.** It would mostly duplicate or discard existing codecs, UI, resource handling, archaeology, fixtures, and validation. |

## Confidence And Evidence Boundaries

### Proven in the current repository

- `src/editor/scenarioSeed/projectCompiler.ts` can create a fresh `Project` without importing a
  scenario.
- `src-tauri/src/importer.rs::create_project` can create, save, export, and reimport a fresh
  desktop project.
- The Scenario JSON smoke compiles ten representative lanes and produces 20 Windows/Mac package
  exports.
- The authored compiler-baseline check passes `null` for browser raw sources and emits the marker,
  `Scenario`, resource fork, fixed item capacity, maps, door tables, and required empty startup
  tables without mutating canonical source metadata.
- Browser and desktop scenario packaging currently produce byte-equivalent results for the parity
  fixtures, including an edited City of Bywater corpus case.
- The Tauri/UI boundary already passes the project into an export command. Extracting compiler
  logic behind that command does not require a UI rewrite.
- Project schema v5 persists authored/imported origin, upgrades schema-v4 projects on open, and
  makes that value authoritative over the older `immutable` and source-inventory signals.
- `schemas/providence-project.schema.json` owns the persisted top-level schema v5 inventory;
  generated TypeScript/Rust constants are runtime-consumed and the repository gate rejects model
  or serializer field drift. `semanticSchema` is explicitly derived and omitted from interchange.
- Project origin, source-file role, source-file metadata, and source snapshots are generated in both
  languages. The sole runtime-optional source field is legacy `origin`; canonical schema-v5 output
  requires it.
- Scenario identity, startup shell/support/contact/restriction metadata, and global macro hooks are
  generated in both languages. Preserved raw payloads remain migration-tolerant but are explicitly
  marked compatibility-only in the canonical schema.
- Authored browser project ZIPs round-trip with no `raw-sources` directory or annex manifest;
  imported packages still round-trip their captured raw files.
- A live browser smoke created and saved a fresh project, selected Windows native export, and
  produced a compiler report with the complete startup/map/contact manifest and zero pass-through
  files.
- The authoritative ownership proof compares every emitted file and requires no-annex browser and
  desktop output to be byte-identical for both Windows and Classic-Mac targets.

### Not yet proven

- The Classic-Mac target is structurally deterministic but has not been played through a stock
  Classic Realmz executable. The automated runtime proof covers the existing Oracle-instrumented
  modern port.
- Custom spell name resources, arbitrary custom music, and several legacy sidecar families do not
  yet have complete fresh-authoring paths.

The feasibility verdict is now source-, fixture-, package-smoke-, and modern-runtime-backed. The
minimum no-raw ownership architecture is proven; remaining work is compatibility breadth and
production hardening rather than a branch-versus-repository uncertainty.

## Deciding Architectural Evidence

### The canonical model is already broad enough

`src/editor/types.ts::Project` and `src-tauri/src/project.rs::ProvidenceProject` contain scenario
startup metadata, maps, layout, map records, tile attributes, Action Points, random-level data,
EDCD rows, messages, options, battles, monsters, items, shops, encounters, rules, resources,
assets, diagnostics, and editor metadata. Scenario JSON compiles directly into these families.

No foundational scenario domain was found that requires an imported scenario merely to exist in
the editor. Some record types still carry `rawBytes`, but new records already initialize those
bytes deterministically. The compiler can instead zero-initialize unowned bytes for authored
projects and consult preserved bytes only for imported projects.

### `raw-sources` is concentrated at imported compatibility and hydration boundaries

The remaining important raw-source dependencies are:

- desktop and browser scenario imports capture source bytes into the compatibility annex;
- imported native export rejects a missing annex, copies it first, then overlays supported writes;
- fixed-record helpers preserve malformed file tails, imported capacities, shop suffixes, and spell
  tails only when annex bytes are available;
- imported-project open and semantic hydration can backfill missing fields and compatibility
  evidence from raw files; authored open/mapping no longer consults those buffers;
- imported-project validation derives compatibility pass-through inventories from
  `project.source.files`; authored validation now derives its expected files from the native
  compiler manifest;
- project packages retain raw payloads for conservative legacy round trips.

These are real dependencies, but they are bounded. Normal project commands and most panels do not
read raw source files. They operate on `Project` fields.

### The former synthetic baseline is now an explicit compiler manifest

Both `src-tauri/src/exporter.rs::write_authored_runtime_baseline` and
`src/editor/browser/scenarioCompilerBaseline.ts::createAuthoredScenarioCompilerBaseline` construct
the same content-neutral package directly as authored compiler output:

- authored startup marker;
- 600-byte zero-filled `Scenario` data fork;
- structurally valid empty `Scenario.rsrc`;
- `Data CS` seeded from the startup shell;
- per-level `Data DD`/`Data DDD` tables;
- 200-row zero-filled `Data NI`;
- 1,024-byte zero-filled `Data Solids`;
- required zero-length startup tables.

Neither path materializes these files as preserved input or adds them to the canonical project's
source inventory.

### The UI is not inseparable from imported byte identity

Direct editor/component uses of record bytes are narrow:

- map record markers fall back to reading the first 60 raw bytes when structured markers are
  absent;
- text panels display the number of preserved bytes as import provenance;
- rule and monster helpers use all-zero raw records to recognize blank imported rows;
- Monster Library conversion can decode a library record from raw bytes;
- writers copy raw bytes before overlaying owned fields;
- parser/semantic code uses raw bytes to describe imported material.

These uses can be replaced by structured marker fields, explicit blank/authored state, normalized
library summaries, and a compatibility-annex lookup. None requires replacing the panels or command
architecture.

| Editor area | Direct byte dependency | Refactor disposition |
| --- | --- | --- |
| `components/maps/MapRecordsWorkbench.tsx` and `app/appUtils.ts` | Decode map marker triples from `rawBytes` when structured markers are absent. | Backfill structured markers during legacy import; remove UI fallback after migration. |
| `panels/TextPanel.tsx` | Displays preserved byte counts for messages/options. | Keep as compatibility-annex provenance, not authored state. |
| `panels/rules/ruleUtils.ts`, `projectCommands/scenarioRulesCommands.ts`, and `monsterRecords.ts` | Use all-zero raw records to recognize blank imported slots. | Add explicit allocation/blank state or use semantic zero checks. |
| `panels/combat/monsterLibraryWorkflow.ts` and `monsterLibrary.ts` | Decode/copy raw Monster Library records when a normalized summary is unavailable. | Normalize at library ingestion; raw library evidence may remain in the library annex. |
| `projectCommands/mapCommands.ts` and target/rules record constructors | Maintain or initialize record-shaped `rawBytes`. | Constructors should create semantic records; the compiler should zero-initialize native buffers. |
| `browser/realmzParser.ts`, `browser/project.ts`, and `browser/semantic.ts` | Parse imported files, build evidence, and sometimes backfill semantic fields from raw buffers. | Retain in the legacy import/evidence pipeline; fresh semantic graphs should build from canonical data. |
| `browser/binaryWriters.ts` and Rust `realmz/*` writers | Copy record `rawBytes` before overlaying owned fields. | Accept an optional compatibility record from the annex; start authored buffers from zero/defaults. |
| Browser preview/source caches | Retain raw files for imported previews and browser package export. | Keep only for imported projects; managed authored assets provide fresh previews/resources. |

### The TypeScript/Rust duplication can be consolidated incrementally

The two top-level project models nearly match, but manual duplication already caused a concrete
drift: TypeScript had canonical `itemTexts` and a browser writer while Rust omitted the field from
its DTO, serializer, importer, and exporter. The investigation branch closes that gap and extends
the authoritative proof across TypeScript compilation, Rust save/open, both native compilers, and
legacy reimport.

The branch now also defines the persisted contract in language-neutral JSON Schema. Its generator
supplies the schema-version constant to both runtimes, emits one ordered top-level field inventory,
and owns the complete source/origin/source-file and scenario identity/startup DTO families. A
conformance gate compares the inventory to both project models and the Rust serializer, rejects
handwritten duplicates, and fixes the compatibility-only startup payload inventory. This removes
silent top-level, source-boundary, and startup-metadata drift while leaving record, rule, map, and
asset DTO generation as bounded, incremental work.

This is evidence for a canonical contract, not for a new repository. Introduce a versioned
language-neutral project schema and generate DTOs for both languages, with handwritten domain
helpers and codecs around generated types. Migration can be family-by-family; the UI need not wait
for every type to move at once.

A pragmatic sequence is:

1. **Implemented:** define the persisted top-level project/origin contract and add model/serializer
   conformance checks.
2. **Implemented for source and scenario startup metadata:** generate nested TypeScript and Rust
   DTO groups from that contract.
3. Move record families into the generated contract in bounded groups.
4. Keep parser, compiler, validator, and UI behavior in handwritten modules.

The exact generator is less important than checking the generated artifacts and migrations into
CI. A versioned JSON Schema is a reasonable neutral source because `project.json` is the persisted
interchange format.

### The exporter already has a clean extraction seam

`src-tauri/src/commands.rs::export_project` is a thin command wrapper. The frontend passes a
`Project` plus a target and output path. The implementation can become:

```text
compile_realmz_scenario(project, target, optional_legacy_annex)
    -> deterministic file/resource manifest

materialize_manifest(manifest, output_directory)
    -> export report
```

The first function should be filesystem-independent and deterministic. The second should handle
directory creation and target packaging. Browser export can consume the same manifest through a
Rust/Wasm build later, or retain the TypeScript writer temporarily behind byte-parity fixtures.

## Native-File Ownership Matrix

Legend:

- **Generated**: the current model and writer can construct fresh bytes without imported content.
- **Generated + compatibility**: fresh bytes can be deterministic, but legacy exports currently
  retain explicit raw fields, reserved ranges, or file tails.
- **Compiler baseline**: the authored compiler owns the deterministic default/capacity policy and
  emits it without a compatibility annex.
- **Pass-through**: current exporter copies the family and has no complete fresh authoring path.
- **Legacy annex**: known compatibility or distribution material that should never be required by a
  fresh project.
- **Runtime omitted**: Realmz creates or mutates the file; Providence should not emit it.

### Scenario shell, startup, and metadata

| Native file/family | Current ownership | Fresh authoritative target | Evidence/remaining issue |
| --- | --- | --- | --- |
| `<ScenarioName>` marker/main file | Generated + compatibility | Generate 316-byte shell | Five startup integers, code segments, and creator string are written; imported 316-320 tail remains annex data. |
| `Scenario` 600-byte data fork | Compiler baseline | Generate neutral 600-byte file or a typed support record | Both compilers emit 600 bytes directly; only offsets 23 and 38 are modeled. The modern runtime proof accepts the neutral default. |
| `Scenario.rsrc` / native `Scenario` resource fork | Compiler baseline plus generated overlays | Always construct a valid target resource fork | Both compilers emit a structurally valid empty fork and can build/merge map names, icons, pictures, sounds, text, and styles. |
| `Data CS` | Generated + imported compatibility | Generate neutral fresh security backup; annex imported bytes | Authored compilation duplicates shell bytes. Imported security/editability behavior remains preserve-only. |
| `Data CI` | Generated | Generate from contact metadata | Complete 4,608-byte writer. |
| `Data RI` | Generated, optional | Generate when restrictions exist | Complete 320-byte writer. |
| `Global` | Generated + compatibility | Generate 60 bytes with zero defaults for reserved slots | Runtime-backed slots are modeled; imported reserved slots 3 and 6-29 remain annex data. |
| `Data Solids` | Compiler baseline plus generated writer | Generate exactly 1,024 bytes | Both authored compilers emit the neutral 1,024-byte table directly. |

### Maps, Action Points, and scripts

| Native file/family | Current ownership | Fresh authoritative target | Evidence/remaining issue |
| --- | --- | --- | --- |
| `Data LD` | Generated | Generate all 16,200-byte land levels | Complete field writer and fixture coverage. |
| `Data DL` | Generated + compatibility | Generate authored dungeon bitfields; zero runtime/preserved bits | High/sign bit and revealed/runtime-state bits are preserved on legacy import. They are not needed as imported identity for fresh authoring. |
| `Data DD` | Generated | Generate one table per land level | Complete trigger-table writer. |
| `Data DDD` | Generated | Emit the file even with zero dungeon levels | The authored compiler baseline retains the empty startup file; the semantic writer overlays populated dungeon tables. |
| `Data RD` | Generated | Generate one random-level record per land level | `rawValues` is currently a low-level canonical array, not an external snapshot. It can be normalized later without blocking ownership. |
| `Data RDD` | Generated | Emit the file even with zero dungeon levels | The authored compiler baseline retains the empty startup file; the semantic writer overlays populated random levels. |
| `Data ED3` | Generated | Generate fixed Extra Action Point rows | Current export only uses raw input to preserve a longer imported allocation. Fresh allocation is deterministic. |
| `Data EDCD` | Generated | Generate EDCD settings rows | Complete fixed-row writer and deterministic Scenario JSON allocation. |
| `Layout` | Generated + compatibility, optional | Generate 256-byte layout core | Imported optional bytes 256-511 remain annex data. |

### Core records and encounters

| Native file/family | Current ownership | Fresh authoritative target | Evidence/remaining issue |
| --- | --- | --- | --- |
| `Data SD2` | Generated | Generate message records | Complete fixed-record writer; malformed imported file tail is compatibility only. |
| `Data OD` | Generated | Generate option labels | Complete 25-byte record writer. |
| `Data BD` | Generated + compatibility | Generate battle records with zero padding | Byte 339 is preserved alignment padding on legacy imports. |
| `Data MD`, `Data MD1`, `Data MD-1` | Generated | Generate monster records/sets | Complete 210-byte record writer for fresh records. |
| `Data DES` | Generated | Generate monster descriptions | Complete fixed-record writer. |
| `Data MD2` | Generated + compatibility | Generate structured map records | Bytes 74-75 and malformed file tails are preserved for legacy imports. Marker UI has a raw-byte fallback that should migrate to structured markers. |
| `Data NI` | Generated + compatibility | Always generate exactly 200 x 100 bytes | Core/effect fields are overlaid on a compiler-owned fixed-capacity table; bytes 56-69 remain compatibility words for legacy imports. |
| `Data TD` | Generated | Generate treasure records | Complete fixed-record writer. |
| `Data SD` | Generated + legacy suffix | Generate only authored shop records for fresh projects | Complete 3,002-byte shop records. Imported foreign/trailing blocks are appended from the annex; authored compilation emits the required empty file directly. |
| `Data ED` | Generated + compatibility | Generate simple encounters | Byte 103 and malformed file tails are preserved for legacy imports; authored compilation emits the required empty file directly. |
| `Data ED2` | Generated + compatibility | Generate complex encounters | Bytes 104-150 and 157 plus malformed file tails are legacy compatibility; authored compilation emits the required empty file directly. |
| `Data TD2` | Generated | Generate rogue/thief encounters | Complete writer; authored compilation emits the required empty file directly. |
| `Data TD3` | Generated with explicit compatibility slots | Generate timed encounters and zero reserved `stuff[1..9]` | The model carries the ten-word array; only `stuff[0]` has confirmed runtime meaning. Authored compilation emits the required empty file directly. |

### Rules and resource-bearing optional families

| Native file/family | Current ownership | Fresh authoritative target | Evidence/remaining issue |
| --- | --- | --- | --- |
| `Data Spell` | Generated + legacy tail | Emit exactly 105 x 30 bytes for fresh custom spells | Both compilers emit the runtime's fixed 3,150-byte table without an annex. Imported short files and bytes beyond the modeled overlay remain compatibility data. |
| `Data Spell.rsrc` / `.rsf` / AppleDouble form | Generated + compatibility | Build custom spell `STR# 5000..5006` resources from canonical names | Both compilers create missing name families and preserve imported entry metadata and unrelated resources. Byte parity and semantic reimport are proof-gated. |
| `Data Race` | Generated + legacy compatibility | Emit exactly 30 x 408 bytes | Both compilers use the shared hash-gated baseline, overlay canonical rows, and write all `struct race` fields including `spare[8]` and `spacer[31]`. The editor and seed contract now enforce scenario IDs 0..29; shared-library names may still expose 70 labels. |
| `Data Caste` | Generated + legacy compatibility | Emit exactly 30 x 576 bytes | Both compilers use the same baseline contract and write all `struct caste` fields including `spare1[2]`, `spare2[2]`, and `spacer[63]`. Fresh rows contain no compatibility bytes. |
| Race/caste display names | Project-only | Keep project labels or define an explicit external-support workflow | Realmz reads global `Data Files/Custom Names.rsrc`; Divinity does not package it as scenario data. This is not a native scenario-folder requirement. |
| `Data ID.rsrc` item strings | Generated + compatibility | Generate deterministic `STR#` families from canonical item texts | Both compilers create fresh forks without an annex and preserve existing entry metadata/unrelated resources for imported scenarios. Byte parity and semantic reimport are proof-gated. |
| `Data Custom 1/2/3 BD` | Generated + compatibility when authored; pass-through otherwise | Generate metadata and zero reserved words for fresh custom landlooks | Mapstats/base/ranges are modeled; reserved range words remain legacy annex data. Resource atlas packaging must be tested with the runtime. |
| Main-fork `PICT`, `cicn`, `snd `, `TEXT`, `styl`, map-name `STR#` | Generated/merged | Generate deterministically from managed assets and map records | Existing resource-fork writer is reusable. Unsupported imported resources stay in the annex. |
| `RLMZ`, `vers`, arbitrary/malformed resources | Pass-through | Omit unless proven required; annex imported entries | Their container format is understood, but payload ownership is not needed for the minimum proof. |

### Legacy-only, custom media, and distribution families

| Native file/family | Current ownership | Fresh authoritative target | Evidence/remaining issue |
| --- | --- | --- | --- |
| `Format` | Legacy annex | Omit by default | Observed zero-byte compatibility marker. |
| `Icon_` data companion | Legacy annex | Omit by default | Empty companion to a resource sidecar. |
| `Icon_.rsrc`, `Data SD2.rsrc`, `Data NI.rsrc`, scenario-named `.rsrc`, `.rsf`, AppleDouble sidecars | Pass-through containers | Normalize authored resources into target-specific output; annex unowned entries | Packaging representation varies by extracted platform. |
| `Custom 1` ... `Custom 9` | Legacy annex | Omit unless a proven authored feature needs them | Known compatibility/media/intermediate payloads, not a fresh-project foundation. |
| `Custom 1 Music` ... `Custom 9 Music` and sidecars | Pass-through custom media | Add a dedicated canonical asset/writer only when custom music becomes required | Current exporter preserves bytes but does not author the payload family. |
| Readme/distribution files | Ignored or legacy annex | User-managed optional output | Not scenario semantics. |

### Runtime-generated and intentionally omitted

| Runtime file/family | Policy |
| --- | --- |
| `Data MENU` | Omit. Realmz generates the monster menu cache. |
| Runtime `CL`, `CD`, `CE`, `CE2`, `CS`, `CT`, `CTD3` under Realmz `Data Files` | Omit. Realmz builds these from `Data LD/DD/RD`, `Data DL/DDD/RDD`, shops, and encounters. |
| `Data H1` and other save/runtime state | Omit. Realmz owns save and mutable gameplay state. |

## Corrections To Existing Ownership Reporting

The current generated completeness summaries are valuable for imported-scenario archaeology, but
they are not yet a fresh-authoring authority matrix. In particular:

- they can call a container semantically complete while its writer still copies unmodeled bytes;
- earlier reports did not distinguish structurally reserved race/caste words from unexplained
  preserved bytes; those words are now explicit canonical arrays and fresh writers ignore
  `rawBytes` entirely;
- the 600-byte `Scenario` data fork is labeled as a resource fork in one generated ownership entry,
  while the implementation treats it as the support data fork and uses `Scenario.rsrc` for the
  extracted resource fork;
- file-level writer readiness does not express fixed-capacity requirements or required empty-file
  emission.

Add an `authoredFromZero`/`requiresLegacyBytes` dimension to future generated ownership data. A file
must not be called fresh-authoritative merely because imported round trips are fixture-proven.

## Minimum Refactor Required Before The Proof

1. **Implemented on the investigation branch:** add explicit project origin:
   - `authored` projects have no source inventory requirement;
   - `imported` projects may reference a compatibility annex;
   - template derivation must retain annex data only when the selected template is imported.
2. **Implemented on the investigation branch:** make `raw-sources` optional in desktop and browser
   project packages.
3. **Implemented as a compiler/materializer seam:** preload filesystem-backed inputs, compile an
   ordered native file/resource manifest without paths or filesystem access, and materialize it
   only at the desktop export boundary. Moving the pure orchestration into a separate Rust source
   module is now optional organizational cleanup rather than an architectural prerequisite.
4. Make compiler defaults explicit:
   - 600-byte `Scenario` support file;
   - valid main resource fork even with no authored resources;
   - fixed `Data NI` capacity when that family is emitted;
   - **implemented:** fixed 30-record `Data Race`/`Data Caste` output from one compiler baseline,
     including all structurally reserved words;
   - **implemented:** fixed 105-record `Data Spell` output and fresh custom-spell name resources;
   - required zero-length startup files;
   - neutral `Data CS` and `Data Solids` policy.
5. **Implemented at the export boundary:** move preservation helpers behind an optional,
   path-bounded compatibility-annex interface. Fresh compilation has poison-annex tests that fail
   if it enumerates or reads supplied legacy material. Embedded imported record bytes still need
   migration into the annex model.
6. **Implemented for authored projects:** build validation and the Export panel's source plan from
   the compiler's expected native manifest. Imported projects remain intentionally source-driven
   at the compatibility boundary.
7. **Implemented at the semantic-source boundary:** authored indices consume canonical project
   fields and managed scenario resources with no raw buffers; imported indices retain raw-buffer
   enrichment. Scenario items, treasures, thief/timed encounters, messages, shops, and
   simple/complex encounters, option labels, and monster descriptions now receive direct canonical
   summaries in both runtimes. Battles, primary monsters, and both native alternate monster sets
   now follow the same writer-decoder path with their cross-record links. Spell, race, and caste
   overrides are decoded from the exact fixed-capacity fresh compiler buffers and hide baseline-only
   slots.
8. **Implemented on the investigation branch:** persist/import/export `itemTexts` in Rust and gate
   its TypeScript/Rust/native-folder conformance in the ownership proof.
9. Gate browser and desktop output with the same golden manifest/byte fixtures. Prefer one Rust
   compiler with a browser/Wasm surface after the proof; do not block the proof on that packaging
   change.

## Principal Blockers And Remaining Unknowns

1. **Shared compiler contract:** desktop and browser now both compile authored projects without an
   annex and the minimum ownership fixture enforces byte parity, but they still implement the native
   manifest in Rust and TypeScript. Broader golden fixtures or a shared Rust/Wasm compiler should
   prevent policy drift across optional families.
2. **Optional resource families:** the minimum main fork, item strings, and custom-spell strings
   are generated in both compilers, but custom media and some extracted sidecar families remain
   incomplete.
3. **Remaining nested generated DTOs:** the language-neutral schema now owns and checks the
   persisted top-level inventory, complete source-origin/source-file and scenario startup DTO
   families, and schema-version constant. Map, record, rule, and asset DTOs are still maintained
   manually and should migrate in bounded families.
4. **Preserved bytes inside records:** export-time file access is now annex-bounded, but several
   imported project records still embed unowned bytes. They must become annex slices rather than
   normal canonical fields.
5. **Canonical semantic coverage:** all currently modeled supporting, fixed-text, combat, and rule
   override families now map directly from canonical compiler bytes in both runtimes. Remaining
   semantic work concerns optional resource/media families and deeper field/link enrichment, not a
   fixed native-family ownership gap.
6. **Ownership-reporting mismatch:** current completeness reports prove conservative imported
   writing, not construction from zero, and overstate at least the Race/Caste suffixes.
7. **Classic gameplay acceptance evidence:** the full fresh no-raw scenario passes the modern
   Oracle runtime through save/reload, but stock Classic Realmz has not run the Classic-Mac target.
8. **Optional feature debt:** custom music and some extracted resource-sidecar forms need
   production decisions after the minimum proof.

The unknowns are implementation and acceptance questions, not evidence of a repository-level
architectural impasse.

## Smallest Decisive Proof Of Ownership

Proposed branch: `investigation/authoritative-realmz-compiler`

The branch should contain only the compiler seam, minimum defaults, tests, and the proof scenario.
It should not attempt broad UI redesign or optional media completion.

Proof scenario requirements:

1. Create a new Providence project with `origin: authored`.
2. Assert that no `raw-sources` directory, browser snapshot, imported template, or compatibility
   annex is created or read.
3. Compile a native scenario folder containing:
   - startup marker and 600-byte support file;
   - structurally valid main resource fork;
   - `Data CS`, `Data CI`, `Data Solids`;
   - one `Data LD`, `Data RD`, and `Data DD` level;
   - empty required dungeon/shop/encounter startup files;
   - one `Data SD2` message;
   - one `Data NI` item and canonical `Data ID.rsrc` name/description family;
   - one fixed-capacity `Data Spell` table and canonical custom-spell name resource;
   - one Action Point in `Data DD` that displays that message;
   - `Data ED3`/`Data EDCD` only if the chosen Action Point shape requires them.
4. Compile twice in clean directories and compare the complete file manifest, bytes, and resource
   entries. Exclude only target container metadata that is intentionally nondeterministic; ideally
   there should be none.
5. Reimport the output through Providence and compare authored semantics.
6. Stage it through the existing Oracle harness into its instrumented modern Realmz build without
   modifying Realmz for this investigation.
7. Start the scenario through Realmz's normal selection/setup path.
8. Move to/over the Action Point and confirm the message or encounter occurs.
9. Save, exit/reload the slot, and confirm scenario identity, location, and triggered state.
10. Record runtime logs, snapshots, generated manifest, and a no-annex access assertion as proof
    artifacts.

This proof is intentionally narrower than “all file families are complete.” It demonstrates the
architectural claim: Providence canonical data alone can produce a playable, persistent native
Realmz scenario.

## Phased Implementation Plan

### Phase 0: Contract and truth cleanup

- Add this decision record and a fresh-authoring ownership gate.
- Introduce authored/imported origin and a bounded compatibility-annex contract.
- **Implemented:** fix the TypeScript/Rust `itemTexts` drift and add native byte/semantic
  conformance coverage.
- **Implemented at the top level:** establish the versioned canonical project schema, generated
  runtime constants, model/serializer conformance tests, and generated source and scenario-startup
  DTOs; continue with later record families.

Exit: an authored project can be saved/opened without raw material, and both runtimes agree on its
serialized contract.

### Phase 1: Deterministic compiler seam

- **Implemented:** compile an ordered native file/resource manifest from preloaded inputs.
- **Implemented for desktop:** keep filesystem materialization outside the compiler; browser ZIP
  materialization remains separately byte-parity-gated.
- **Implemented:** port synthetic baseline policy into explicit compiler defaults.
- **Implemented:** retain imported compatibility behavior through a preloaded annex snapshot.

Exit: fresh compile succeeds with an access guard proving no raw/annex reads.

### Phase 2: Minimum gameplay proof

- Add the minimal map, Action Point, and message proof fixture.
- Add double-compile byte determinism and reimport tests.
- Run the existing Oracle gameplay path for start, movement, AP, save, and reload.

Exit: the smallest decisive proof passes through the existing automated modern Realmz Oracle;
stock Classic execution remains a target-specific compatibility gate.

### Phase 3: Legacy compatibility isolation

- **Implemented for export-time files/tails:** route raw file copies, preserved lengths/tails, and
  source resources through an explicit bounded annex resolver; continue by moving embedded record
  bytes and imported media payloads behind the same boundary.
- Migrate imported projects without dropping bytes.
- Ensure authored projects do not accumulate annex data merely by being saved or exported.

Exit: legacy round-trip fixtures remain green and fresh projects stay annex-free.

### Phase 4: Fixed capacities and optional authoring families

- **Implemented:** fixed-capacity `Data Race` and `Data Caste` policies; keep them with the
  completed `Data NI` and `Data Spell` paths in the cross-runtime parity gate.
- **Implemented:** generate custom spell and item-string resources in both runtimes.
- Validate custom landlook resource packaging.
- Add custom music only if it is prioritized as a construction-set requirement.

Exit: the practical Divinity-style authored surface no longer depends on imported templates.

### Phase 5: One compiler contract across desktop and browser

- Prefer exposing the Rust compiler to browser/Wasm, or generate both implementations from shared
  codec/manifest specifications.
- Keep byte-parity fixtures for every supported target.
- Remove duplicated baseline and preservation policy once both call the same compiler contract.

Exit: browser and desktop produce the same manifest and bytes from the same canonical project.

## Rough Effort

These are person-month ranges for experienced contributors already able to work in TypeScript,
Rust, Realmz binary formats, and the Oracle harness. They include implementation, migration, tests,
and documentation, not only coding.

| Scope | Existing Providence repository | Separate replacement project |
| --- | ---: | ---: |
| Decisive no-raw proof through Realmz save/reload | 1.5-2.5 | 3-5 for a narrow throwaway tool, without Providence parity |
| Production authoritative core with schema/origin split, deterministic compiler, legacy annex, fixed startup/capacity defaults, and browser/desktop gates | 6-9 | 18-30 to regain comparable maps, APs, records, assets, import, packaging, UI, fixtures, and archaeology |
| Broader construction-set parity including optional resource families, custom landlooks/music hardening, migration polish, and release UX | 9-14 total | 24-40 total |

The separate-project estimate assumes proven codecs can be extracted and reused. If they are copied
instead of reused, it creates two archaeology and compatibility implementations and raises both
cost and long-term risk. A narrow standalone generator could look smaller only by excluding the
editor, import compatibility, assets, validation, browser target, and existing feature surface; it
would not satisfy the stated construction-set goal.

## Repository Decision

Use the existing Providence repository. Start with
`investigation/authoritative-realmz-compiler`, land the proof and decision gates there, then rename
or follow with a normal feature branch once the proof is accepted.

A reusable compiler crate/package may be extracted inside this repository, but it should remain a
Providence component. There is no concrete evidence that a new application removes an
architectural blocker. It would mainly discard or duplicate the expensive parts that already work:
codecs, editors, scenario generation, resource handling, import preservation, fixtures, archaeology,
and validation.
