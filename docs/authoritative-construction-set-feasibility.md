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
- emits the startup `Scenario` file, canonical 46-byte zero-entry resource fork, `Data CS`, fixed
  `Data NI` capacity,
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

The twenty-first slice closes the generated startup contract's remaining handwritten dependency.
The shared `Provenance` record and its five-value confidence vocabulary now derive from JSON Schema
in both languages, so generated TypeScript no longer references handwritten `types.ts` and Rust no
longer owns a duplicate struct/enum pair. Tightening TypeScript from an unrestricted confidence
string found only two browser import sites where literal values had widened during inference; both
now declare the canonical return type, with no persisted value or runtime behavior change.

The twenty-second slice moves the stable map identity/layout family under the generator: level
kind, render mode/metadata, map identity and tile cells, and the optional land-layout grid. The
contract now requires map provenance in both languages and marks only the imported layout tail as
compatibility-only. Its closed render-mode vocabulary exposed one real compiler drift: Scenario
JSON emitted `dungeon-landlook`, which Rust could not deserialize. It now emits the existing
`dungeon-top-down` contract value; browser-native map import and terrain-authoring maps also provide
the provenance Rust already required. Map codecs and `LevelType` behavior methods remain
handwritten around the generated data types.

The twenty-third slice moves random-level identity, runtime settings, and random-rectangle records
under the same generated contract. `rawValues` is now optional compatibility-only storage rather
than authored authority: fresh browser, desktop, and Scenario JSON projects omit it, while both
native writers deterministically compile the full modeled record from semantic fields. Imported
322-word streams remain available as a compatibility base, with semantic edits taking precedence
and no-edit legacy boolean encodings preserved byte-identically. The final unmodeled record byte
therefore remains bounded without forcing fresh projects to synthesize preserved-looking data. The
codec now has its own Rust module rather than adding more responsibility to the deferred ISY-320
`maps.rs` refactor.

The twenty-fourth slice moves map markers, rectangles, and complete map-record metadata under the
generated contract. Fresh map records now contain exactly ten semantic marker slots and omit
`rawBytes`; both native writers zero-initialize a record and compile all 338 modeled bytes from
canonical fields. Browser import decodes marker triples immediately, and project-open migration
backfills them for older imported packages, so map UI and project commands no longer inspect raw
record identity. An optional 340-byte imported compatibility base is confined to the parser,
migration, and compiler boundaries: it preserves only the unknown bytes 74-75, unchanged Pascal
note tails, and equivalent noncanonical true encodings until the corresponding semantic value is
edited.

The twenty-fifth slice moves the complete 100-byte scenario-item record under the generated
contract and makes `Data NI` fully semantic compiler output. Its seven source-backed `spare2`
words are canonical fields rather than preserve-only gaps; fresh UI, project-command, and Scenario
JSON constructors omit `rawBytes`, while browser and Rust writers compile every word from the
canonical record. Imported raw storage is now a bounded no-edit compatibility base used only to
retain a zero stored item ID that Realmz interprets as the row's `800 + id` alias. Project-open
migration backfills the seven words for older packages, and the item codec now has its own Rust
module rather than adding more responsibility to the deferred ISY-320 `economy.rs` refactor.

The twenty-sixth slice moves the complete 48-byte treasure record under the generated contract and
makes `Data TD` independent of record byte identity. The canonical record requires exactly twenty
signed item IDs plus experience, gold, gems, and jewelry reward words. Fresh UI, project-command,
and Scenario JSON constructors omit `rawBytes`; both compilers rebuild all 48 bytes from semantics,
including on legacy imports. Project-open migration expands older short item arrays from their
decoded values, optional imported compatibility bytes, and zero defaults. Only malformed file tails
remain compatibility-annex data. The ownership proof now authors and semantically reimports a
treasure containing scenario item 901.

The twenty-seventh slice moves the complete 3,002-byte shop record under the generated contract and
makes ordinary `Data SD` rows independent of record byte identity. Each canonical row requires
exactly one thousand signed item IDs, one thousand quantity bytes, and an inflation word. Fresh UI,
project-command, and Scenario JSON constructors omit `rawBytes`; both compilers rebuild every row
from semantics, including on legacy imports. Project-open migration expands older short arrays from
their decoded values, optional imported compatibility bytes, and zero defaults. The existing narrow
classifier still excludes City of Bywater's five dense foreign records from the authoring model, and
export appends that suffix or a malformed tail only from the compatibility annex. The ownership
proof now authors and semantically reimports a shop stocking scenario item 901.
The shop codec and suffix classifier now live in a dedicated Rust module, so this slice does not
add responsibility or a new module-size exception to the deferred ISY-320 `economy.rs` refactor.

The twenty-eighth slice moves the complete 256-byte `Data SD2` message row under the generated
contract. Fresh UI/project-command and Scenario JSON constructors omit `rawBytes`, and both native
writers compile the Str255 length, Classic-text payload, and deterministic zero fill from semantic
text even when embedded compatibility bytes are poisoned. A focused scan of 25 local files found
nonzero post-length bytes in 22,862 of 24,442 rows plus malformed tails in eight files, so unchanged
legacy rows and tails remain conservatively preserved from the compatibility annex at export. The
message codec now has its own Rust module, and the ownership proof asserts a raw-free canonical
message plus exact 256-byte native output and semantic reimport.

The twenty-ninth slice moves the complete 25-byte `Data OD` option-label row under the generated
contract and adds `optionLabels` to the Scenario JSON authoring surface. Fresh UI/project-command
and Scenario JSON constructors omit `rawBytes`; both native writers compile the Str24 length,
Classic-text payload, and deterministic zero fill from semantic text even when embedded bytes are
poisoned. A focused scan deduplicated 66 local copies into seven distinct payloads containing 343
rows: every one of the 270 valid Str24 rows had nonzero legacy padding, mostly spaces, while 73
capacity rows used noncanonical length bytes including `0xFF` sentinels. Unchanged legacy rows and
malformed tails therefore remain annex-owned until authored. The ownership proof now authors two
option labels from Scenario JSON, requires exact 50-byte `Data OD` output, and semantically
reimports both labels.

The thirtieth slice closes complete byte ownership for the 346-byte `Data BD` battle row. The
generated contract now owns the battle DTO in both languages; fresh UI/project-command and
Scenario JSON constructors omit `rawBytes`; and both writers compile the 169 signed grid cells,
distance, before/after messages, battle macro, and deterministic zero alignment byte directly from
canonical semantics. A focused scan found 39 distinct authored-data payloads with 7,553 complete
rows and no malformed tails; 866 rows carry nonzero legacy alignment bytes. Four additional
32-byte `.finf` payloads are Finder metadata companions, not battle tables. Unchanged imported rows
and malformed tails therefore remain annex-owned until authored. The ownership proof now authors a
battle placement and distance from Scenario JSON, requires exact 346-byte `Data BD` output with
zero padding, and semantically reimports the battle. The battle codec lives in a dedicated Rust
module, so the slice reduces `combat.rs` without adding to deferred ISY-320 growth.

The thirty-first slice closes complete byte ownership for each 426-byte `Data ED` simple-encounter
row. `EncounterActionRow` and `SimpleEncounterRecord` now come from the same generated schema in
TypeScript and Rust. Fresh UI/project-command and Scenario JSON constructors omit `rawBytes`, and
both native writers compile all action codes and IDs, choice results, controls, prompt, four Pascal
text buffers, and deterministic zero alignment padding from canonical semantics. A broader local
audit found 37 distinct data payloads: 14 were exactly aligned, while 23 carried historical tails;
42 of 194 complete rows in the aligned payloads had nonzero legacy padding. Those observations do
not make imported bytes canonical. Unchanged legacy rows and malformed tails are recovered only
from the compatibility annex at export. The ownership proof now authors a simple encounter from
Scenario JSON, requires exact 426-byte `Data ED` output in both native targets and compilers, and
semantically reimports the record.

The thirty-second slice closes complete byte ownership for each 520-byte `Data ED2`
complex-encounter row. `ComplexEncounterRecord` now joins `EncounterActionRow` in the generated
TypeScript/Rust project contract. The practical canonical model uses the source-declared action
result, word result, eight group flags, ten spell routes, five item routes, controls, prompt, and
nine inline text buffers; the obsolete `choiceResults`/`wordResults` arrays survive only as
load-time migration inputs and are removed on normalization. Fresh UI/project-command and
Scenario JSON constructors omit `rawBytes`, and both native writers compile all 520 bytes from
canonical semantics with deterministic zero at alignment byte 157. A focused audit found 37
distinct data payloads, all exactly aligned, totaling 954 complete rows; 71 rows carry nonzero
legacy padding. Unchanged imported rows and any future malformed tails remain annex-owned. The
ownership proof now authors physical, typed-word, spell, item, and all four result-script routes,
requires exact 520-byte `Data ED2` output in both native targets and compilers, and semantically
reimports the record.

The thirty-third slice closes complete byte ownership for each 118-byte `Data TD2` thief/rogue
encounter row. `ThiefEncounterRecord` now comes from the generated TypeScript/Rust contract, with
fixed canonical capacities for ten flags, the eight action routes, and the three prompt/support
slots. Fresh UI/project-command and Scenario JSON records omit `rawBytes`; desktop and browser
writers compile every byte from canonical flags, modifiers, result codes, message and sound links,
trap spell/damage state, lock tumblers, and prompt support fields. A focused current-corpus audit
found 30 physical payloads, 27 distinct payloads, and 1,414 complete aligned rows. Three related
legacy scenarios contain noncanonical nonzero Boolean encodings in the same record; unchanged
imported rows retain those exact encodings through the compatibility annex, while authored output
normalizes flags to deterministic `0` or `1`. The ownership proof now covers all eight rogue
actions plus message, sound, trap, spell, damage, lock, and Complex Encounter result routing.

The thirty-fourth slice makes fresh `Data TD3` timed encounters authoritative without claiming
unknown legacy semantics. `TimedEncounterRecord` and its location-kind enum now come from the
generated TypeScript/Rust contract. Day, increment, chance, Extra Action Point target, level,
random rectangle, coordinates, required item, required quest, and location kind are canonical;
fresh UI/project-command and Scenario JSON records omit `rawBytes` and compatibility words. Both
writers compile those 22 bytes from semantics and emit deterministic zero for offsets 22..39. A
focused current-corpus audit found 30 physical payloads, 301 aligned rows, no malformed tails, and
10 distinct patterns in the nine unnamed words; 192 rows had at least one nonzero unnamed word.
Those 18 bytes therefore remain explicitly unowned: unchanged imported rows remain byte-exact,
while edited imported rows recover only that range from the compatibility annex. The ownership
proof now authors a timed schedule with macro, item, quest, and exact land-position gates, requires
exact 40-byte output with zero reserved words, and semantically reimports it.

The thirty-fifth slice closes complete byte ownership for the 210-byte `Data MD`, `Data MD1`, and
`Data MD-1` monster rows plus the 256-byte `Data DES` description row. `MonsterRecord` and
`MonsterDescriptionRecord` now come from the generated TypeScript/Rust contract with exact byte
domains and fixed array capacities. Fresh UI/project-command, Monster Library copy, and Scenario
JSON paths omit `rawBytes`; both native writers compile every scalar, array, Boolean, fixed-name,
and Pascal-description byte from canonical semantics even when embedded bytes are poisoned.
Project-open normalization expands older short arrays. Unchanged imported rows and malformed file
tails are restored only from the compatibility annex, including both alternate native set names.
The ownership proof now authors monster 1 and its description without `raw-sources`, checks exact
native bytes and deterministic padding in both targets/compilers, and semantically reimports both.

The thirty-sixth slice closes the corresponding authoritative rule-record boundary for `Data
Spell`, `Data Race`, and `Data Caste`. Their complete TypeScript and Rust DTOs now derive from the
canonical JSON Schema, including exact native domains and fixed array/matrix capacities. Fresh
commands and Scenario JSON omit `rawBytes`; both native writers zero-initialize and encode every
byte of an authored row from semantic fields, rejecting malformed compatibility storage and array
dimensions instead of silently truncating them. Race/caste compiler baselines still supply
deterministic defaults for unoverridden slots, but authored rows replace their complete native row.
Unchanged imported rows and malformed tails are restored only from the compatibility annex. The
ownership proof now asserts exact semantic bytes for one spell, race, and caste in both compilers
without `raw-sources`, including deterministic zero compatibility words.

The thirty-seventh slice closes the same authoritative boundary for scenario contact metadata and
optional party restrictions. The generated schema now omits empty compatibility storage when Rust
saves fresh `ScenarioContactInfo` and `ScenarioRestrictions` values. Browser project commands drop
imported `rawBytes` as soon as either record is authored, and both low-level writers always
zero-initialize and compile the complete 4,608-byte `Data CI` or 320-byte `Data RI` singleton from
semantic fields, regardless of embedded byte identity or the `authored` flag. Untouched imported
singletons and malformed tails are restored only by the compatibility-annex layer in both native
compilers. The canonical semantic index now exposes these records as editable, confirmed compiler
inputs at `project.json#scenario/contactInfo` and `project.json#scenario/restrictions`; imported
buffers remain source-backed and inspect-only. The ownership proof now requires raw-free contact
metadata, exact `Data CI` output, deterministic Pascal padding, and semantic reimport.

The thirty-eighth slice closes the authoritative boundary for the 60-byte `Global` hook record
without inventing semantics for reserved words. Scenario JSON can now bind keyed Extra Action
Points to the source-backed start, death, quit, shop, and temple hooks. Fresh editor commands and
Scenario JSON values omit `rawBytes`; both low-level writers zero-initialize the record and compile
only those five slots from canonical semantics, ignoring embedded compatibility bytes and values
placed in reserved slots. Untouched imported `Global` identity remains annex-owned. After an
imported hook is edited, the compiler restores only reserved slot 3, slots 6-29, and any malformed
tail from the annex. The canonical semantic index exposes the authored record as an editable,
confirmed compiler input at `project.json#scenario/globalMacroHooks`. The ownership proof now
requires a nonzero authored start hook, exact 60-byte output, deterministic zero reserved slots,
cross-compiler parity, and semantic reimport.

The thirty-ninth slice closes the same boundary for the scenario-named marker shell and `Data CS`.
Both low-level writers now zero-initialize and compile exactly 316 bytes from canonical recommended
and maximum levels, startup location, two fixed security-code segments, and creator text; embedded
`rawBytes`, `trailingBytes`, and the `authored` flag cannot affect that semantic core. Editing the
shell or creating a security backup drops imported compatibility storage, and Scenario JSON does
the same when it adopts a template shell. Desktop export now routes both files through the same
singleton annex boundary already used for contact and restrictions: an untouched imported file is
restored byte-exactly, while an edited import receives only its malformed tail from the annex.
Fresh `Data CS` deterministically duplicates the canonical shell unless an explicit semantic
security backup exists. Both semantic indices expose the authored marker and `Data CS` as confirmed
compiler inputs and mark startup/security entities editable. The exact Divinity publish/refusal
behavior remains source/decompiler-supported; that uncertainty no longer requires preserved bytes
for fresh compilation.

The fortieth slice makes the 600-byte `Scenario` support data fork an explicit bounded compiler
surface without promoting Divinity editor state to Realmz scenario semantics. Both low-level
writers now emit exactly 600 deterministic bytes, populate only the existing string-editor slot at
offset 23 and signed sound value at offsets 38-39, and ignore embedded `rawBytes` and `authored`.
Fresh projects continue to receive the neutral all-zero compiler baseline. Untouched imports retain
their exact support file through the compatibility annex; after an edit, the exporter recovers the
unowned editor/view-state bytes and overlays only the three bounded bytes. The editor command drops
embedded raw storage when those fields are changed. Import and generated ownership reporting now
distinguish an exact 600-byte support data fork from a real `Scenario` resource fork or sidecar.
The report deliberately classifies the file as mixed/partially editable: its remaining bytes stay
fixture-proven or correlated Divinity editor state, preserved for legacy imports and zero-filled for
fresh compilation.

The forty-first slice establishes the minimum main resource-fork contract instead of treating an
empty fork as a placeholder. Realmz source requires scenario selection to open the resource fork,
but applies `RLMZ` count/index checks only to the built-in scenario range. Forty-nine of 87 main
scenario-fork captures in the current corpus contain no `RLMZ` entries, including third-party and
Divinity-authored roots. Both compilers now call a named minimum-fork writer that emits the exact
46-byte Resource Manager container with zero data bytes, a 30-byte map, the standard empty type
list, and no synthetic `RLMZ` metadata. Baseline and ownership proofs reject any byte or resource
entry drift. Canonical resource workflows still add map names, media, text/style, and icons as
needed; legacy extras remain annex-owned. This closes the payload/default question while keeping
stock Classic-Mac HFS/AppleDouble transport as a separate packaging acceptance gate.

The forty-second slice closes complete byte ownership for the 1,024-byte `Data Solids` table.
Both native compilers now use equivalent deterministic writers: an empty canonical collection
produces the neutral table, while each `data-solids` profile writes its canonical `solidType` to
the indexed special-tile byte. Embedded `rawByte` provenance cannot influence authored output;
duplicate rows, out-of-range tile indices, and values outside `0..255` are rejected instead of
silently depending on array order or truncation. This fixes a concrete browser/desktop asymmetry:
browser ZIP export previously emitted only the neutral baseline and ignored authored special-tile
solidity. Imported bytes beyond the runtime-owned 1,024-byte table now remain annex-owned and are
appended unchanged by both compilers. The ownership proof authors row 190 without raw bytes,
requires byte `2` in Windows and Classic-Mac browser/desktop output, and recovers it semantically
on native-folder reimport.

The forty-third slice closes runtime byte ownership for the optional `Layout` file. Both native
writers now require the canonical 8 x 16 shape and deterministically compile exactly 256 bytes
from all 128 signed-short cells; `LandLayout.trailingBytes` remains migration-readable but cannot
influence compiler output. Imported bytes after offset 255 are restored only from the bounded
compatibility annex, including the observed 512-byte form whose suffix was previously missed by
the browser exporter's generic malformed-tail rule. Land-layout editor commands clear embedded
tail identity when authoring begins. The browser/desktop parity fixture poisons the model tail,
authors both edge cells, and proves that an exact 256-byte annex suffix survives unchanged. The
fresh ownership proof now authors a layout without compatibility bytes, emits the same exact grid
for Windows and Classic Mac in both compilers, and recovers all 128 cells on native reimport. The
focused Rust codec also moves out of `maps.rs`, reducing rather than extending the deferred
ISY-320 refactor surface.

The forty-fourth slice closes the compiler/compatibility boundary for `Data ED3` and `Data EDCD`.
Realmz source establishes exact runtime records: ED3 uses the same 40-byte `struct door` shape as
map Action Points, and EDCD is exactly five signed shorts. The canonical project already contains
all of those fields and no embedded record bytes. Both compilers now regenerate every complete
row from that semantic model. An imported file may retain its historical row capacity, but removed
complete rows become deterministic zero records instead of being copied from source. Only a final
partial-record suffix remains compatibility-annex identity. This fixes the prior browser/desktop
drift on shrunk imports and prevents a malformed tail from pulling deleted complete source rows
back into output. The parity fixture proves the rule with nonzero removed rows and partial suffixes
for both files and both native targets. The fresh ownership seed now also emits a linked EDCD-backed
action, requires exact 120-byte ED3 and 10-byte EDCD output, and checks their semantic words without
`raw-sources`.

The forty-fifth slice makes `Data Custom 1/2/3 BD` metadata authoritative. Tile-attribute,
mapstats, range-slot, writer-gate, and custom-landlook DTOs now come from the shared generated
TypeScript/Rust contract. Both low-level writers allocate a fresh exact 8,104-byte buffer and
compile all semantic mapstats, base, and range fields without reading embedded `rawBytes`, tails,
spare words, or reserved words. Fresh custom-landlook creation omits that compatibility state.
For edited imports, the compiler restores only the 201 unnamed mapstats spare words, ten unnamed
range reserved words, and bytes after offset 8,104 from the optional annex; untouched imported
files remain pass-through. Browser import now creates the same editable `customLandlooks` records
as desktop import instead of only deriving preview tile profiles. The ownership proof authors a
complete Custom 1 table without `raw-sources`, poison-tests both compilers, proves byte parity on
both native targets, and recovers all 201 rows and ten ranges on native reimport. Custom atlas
resource packaging remains the separate next milestone and is not claimed by this metadata slice.

The forty-sixth slice closes that custom-atlas milestone. Providence now converts canonical RGBA
atlas pixels into a deterministic indexed PackBits `PICT`, including the resource frame rectangle
that Realmz expects, and the Land Tiles workbench stores those converted bytes rather than
mislabeling its PNG preview as a ready resource. Both compiler boundaries reject a managed
custom-landlook asset unless its converted payload is the normalized 640 x 320 form. The fresh
ownership project selects Custom 1 in `Data RD`, owns both its 8,104-byte metadata file and `PICT
306`, and contains no compatibility annex. Rust and browser packages are byte-identical for both
native targets, repeat compilation is byte-identical, and native reimport recovers both the
canonical metadata and decoded atlas preview. The existing modern Realmz runtime gate loads `PICT
306`, renders the map, moves, executes both authored Action Points, saves, and reloads with ten
completed render markers and no fatal resource markers. A separate ordinary, non-instrumented
Realmz build also accepted and selected the generated folder from its Adventure menu without any
Realmz source changes. Stock Classic execution remains the next target-specific compatibility
gate; arbitrary PICT editing and `Custom 1/2/3` companion-file authoring remain out of scope.

The forty-seventh slice closes representative main-fork resource ownership. The fresh project now
owns deterministic payloads for `PICT 306`, referenced special-land `cicn -100`, `snd  321`, and a
paired `TEXT`/`styl -200` resource without an imported fork or `raw-sources`. Both compilers emit
the same five-entry `Scenario.rsrc` for Windows and Classic-Mac targets, repeat compilation is
byte-identical, and the proof compares every resource name and payload against canonical project
bytes. Rust save/open retains the embedded resource payloads. Native-folder reimport decodes the
icon and sound previews, and the on-demand semantic builder recovers the TEXT body, valid 20-byte
style run, and `styled_by` relationship. Browser and Rust validation now reject ready assets with
no converted `resourcePath` and duplicate scenario-managed resource type/ID keys before export;
custom-library assets remain outside that scenario ownership check. Imported unrelated resource
entries remain compatibility-annex data. Arbitrary PICT editing and stock Classic execution remain
separate gates.

The forty-eighth slice adds Realmz Remake as an independent compiler target without routing
through the native Realmz folder. A Providence-owned exporter projects the same schema-v5
canonical project into all nine Classic bundle v1 documents, packages scenario-managed resource
payloads at deterministic bundle-relative paths, and omits editor state, absolute paths, embedded
data URIs, and compatibility-annex bytes. The ownership proof emits the bundle twice and compares
every document and payload byte. Realmz Remake's generic Godot validator accepts the result from
its unchanged checkout. One real contract edge is recorded instead of reinterpreted: negative
`cicn` IDs are Realmz special-land-tile identities, while v1 validates ordinary icon IDs as
non-negative. Providence therefore preserves them in the additive optional v1
`assets.catalog.specialLandTiles` collection. Runtime-native decoding/adapter behavior for the
packaged immutable Classic resource payloads remains a consumer contract question.

Compatibility-target validation for this slice completed on 2026-07-19: six focused Rust tests,
the full Rust suite (260 passed, 2 ignored), deterministic repeated ownership-proof bundles, and
the unchanged Remake checkout's generic Godot bundle validator all passed.

The forty-ninth slice begins the remaining compiler-facing DTO convergence without changing either
compiler's output. The language-neutral schema now owns the complete monster-set wrapper, its
closed `-1`/`0`/`1` identity vocabulary, and item-text records including their authored and
provenance labels. Generated TypeScript and Rust definitions replace the former handwritten
duplicates while preserving the existing TypeScript union, Rust `i16` wire shape, optional-field
serde behavior, and schema-v4/v5 compatibility path. The native and Remake compilers continue to
consume the same canonical values. Action Point/EDCD and managed/resource asset DTOs remain the
bounded follow-on families under ISY-392.

The fiftieth slice moves the complete Action Point/EDCD compiler-facing DTO family into the same
generated contract. The schema now owns trigger records, map coordinates, action rows, normalized
Rust action categories with their legacy aliases, and fixed five-signed-short EDCD rows. Generated
TypeScript and Rust definitions replace all five handwritten Rust types and the three duplicated
editor types while preserving nullable level/coordinate fields, fixed native integer widths,
serializer field order, and the browser's historically optional `landid`, target-coordinate,
`gosub`, and provenance fields. The audit also records a genuine language-boundary distinction:
the editor retains open author-facing action-category labels such as `Travel` and `Empty`, whereas
Rust normalizes persisted/runtime categories to its closed snake-case enum. The schema therefore
keeps the shared `category` property as a string and uses the generated Rust enum only as the Rust
boundary type instead of falsely declaring both meanings identical. Focused ED3/EDCD
browser/desktop parity and the full deterministic ownership proof pass without native or Remake
output changes. Managed/resource asset DTOs are now the only remaining ISY-392 family.

Branch validation through the fiftieth slice completed on 2026-07-19:

- full Rust suite: 260 passed, 2 ignored;
- full TypeScript suite: 608 passed, plus typecheck;
- ten-lane Scenario JSON generation smoke with 20 Windows/Classic-Mac exports;
- generated-scenario baseline check;
- canonical-to-native authoritative scenario proof;
- authored poison-annex access guard in both Rust and browser compilers;
- Oracle runtime ownership proof with seven successful gameplay steps and no fatal markers;
- browser/desktop imported-scenario parity check;
- production browser build, UI audit, and a live fresh-project native-export smoke.

The aggregate `npm run check` currently stops after the passing TypeScript tests because the
module-size baseline reports unrelated pre-existing ISY-319/320/321 growth in map, assembly,
and CSS files. The random-level, scenario-item, shop, message, option-label, and battle codec
extractions add no new module-size violation; moving `Data NI` and `Data SD` out of `economy.rs`
also removes that file from the current violation list, and the simple-encounter changes remain
within the existing `encounters.rs` ceiling; the complex- and thief-encounter changes add no new
module-size violation. The authoritative rules slice likewise keeps `rules.rs` within its ceiling
by separating exact-shape validation from the native codec. The `Data Solids` slice likewise moves
its 1,024-byte codec and tests into a focused module, returns `landlooks.rs` below its baseline, and
does not add a new ISY-320 violation. The `Layout` slice likewise moves its codec and tests into a
focused module and reduces `maps.rs`; the remaining size failures are the pre-existing ISY-319 map
UI files, ISY-320 `assembly.rs`, and ISY-321 stylesheets. The ED3/EDCD slice changes only the
exporter/package boundary and adds no new module-size violation. The custom-landlook metadata
slice adds a focused browser parser test and changes only existing contract/compiler owners. The
atlas slice adds one focused shared PICT writer and only small workbench/compiler-boundary wiring,
so neither slice adds an ISY-319/320/321 violation. Architecture, lint, unit,
typecheck, UI audit, production build, scenario proof, package parity, and the full Rust suite were
run independently.

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
| 3. Which native files are completely generated? | The 316-byte scenario marker and `Data CS` cores, neutral 600-byte support-file baseline, maps, trigger tables, random levels, ED3/EDCD, messages, options, monsters/descriptions, treasures, shops, thief/timed encounters, custom spell records/names, contact/restrictions, and most record cores have writers. The detailed matrix separates semantic generation from neutral compiler defaults and compatibility ranges. |
| 4. Which still depend on preserved/placeholder/resource assumptions? | The unmodeled Divinity editor-state ranges in imported 600-byte `Scenario` support files, required empty startup files, imported `Data Spell` tails, other record compatibility ranges, custom music, arbitrary legacy resources, and Classic-Mac resource-fork transport metadata. The fresh main resource container, support output, marker, `Data CS`, and complete `Data Solids` table no longer require preserved bytes; exact legacy security/publish and stock Classic-Mac behavior remain acceptance unknowns. |
| 5. Can legacy preservation be isolated? | **Yes, and the boundary is explicit on the investigation branch.** Schema v5 records authored/imported origin; native export requires the annex only for imported projects. Remaining work is moving embedded record tails and browser-native preservation behind the same contract. |
| 6. Can TypeScript and Rust derive from one schema? | **Yes, incrementally.** The investigation branch generates the shared schema version, persisted top-level inventory, source/origin/source-file DTOs, scenario identity/startup DTOs, shared provenance/confidence primitives, map identity/layout and map-record DTOs, random-level/rectangle DTOs, and complete scenario-item, treasure, shop, message, option-label, battle, monster, monster-description, spell, race, and caste DTOs from JSON Schema. It checks both project models plus the Rust serializer; remaining DTO families can migrate incrementally. |
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
- The shared provenance record and exact `confirmed`, `source-backed`, `fixture-backed`, `inferred`,
  and `unknown` confidence vocabulary are generated in both languages; generated DTOs no longer
  refer back to a handwritten project-model type.
- Level kind, render mode/metadata, map identity/tile cells, and land layout are generated in both
  languages. The schema requires canonical map provenance and identifies layout trailing bytes as
  compatibility-only data.
- Random-level settings and random-rectangle records are generated in both languages. Fresh
  projects carry semantic settings only; imported `rawValues` is optional compatibility data and
  both native writers overlay the semantic contract before emission.
- Map-record marker, rectangle, and metadata DTOs plus complete scenario-item, treasure, shop,
  message, option-label, and battle records are generated in both languages. Fresh records omit
  `rawBytes`; the item writer owns all
  100 `Data NI` bytes, including the seven source-backed spare words, the treasure writer owns all
  48 `Data TD` bytes, the shop writer owns all 3,002 bytes in each ordinary `Data SD` row, and the
  message writer owns all 256 canonical `Data SD2` bytes, the option-label writer owns all 25
  canonical `Data OD` bytes, and the battle writer owns all 346 canonical `Data BD` bytes.
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
- Arbitrary custom music and several legacy sidecar families do not yet have complete
  fresh-authoring paths.

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
the editor. Some record types still carry `rawBytes`, but map records, random levels, and scenario
items now demonstrate the preferred pattern: omit compatibility storage from authored records,
zero-initialize compiler output, and consult preserved bytes only for imported projects.

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
- exact canonical 46-byte zero-entry `Scenario.rsrc` baseline, extended only by canonical managed
  resources used by the project (`PICT 306`, `cicn -100`, `snd  321`, `TEXT -200`, and `styl -200`
  in the current ownership proof);
- `Data CS` seeded from the startup shell;
- per-level `Data DD`/`Data DDD` tables;
- 200-row zero-filled `Data NI`;
- 1,024-byte zero-filled `Data Solids`;
- required zero-length startup tables.

Neither path materializes these files as preserved input or adds them to the canonical project's
source inventory.

### The UI is not inseparable from imported byte identity

Direct editor/component uses of record bytes are narrow:

- text panels display the number of preserved bytes as import provenance;
- rule helpers use semantic zero checks for blank rows; imported raw bytes remain evidence only;
- Monster Library ingestion can decode legacy library evidence from raw bytes, but copied scenario
  records now contain semantics only;
- completed authoritative writers build semantic buffers; older family-specific codecs may still overlay compatibility bytes;
- parser/semantic code uses raw bytes to describe imported material.

These uses can be replaced by structured marker fields, explicit blank/authored state, normalized
library summaries, and a compatibility-annex lookup. None requires replacing the panels or command
architecture.

| Editor area | Direct byte dependency | Refactor disposition |
| --- | --- | --- |
| `components/maps/MapRecordsWorkbench.tsx` and `app/appUtils.ts` | **Resolved:** consume ten structured marker slots only. | Browser import and project-open migration backfill legacy markers at the compatibility boundary. |
| `panels/TextPanel.tsx` | **Resolved for messages and option labels:** authored records no longer create or consult `rawBytes`; imported byte counts remain legacy evidence. | Move imported text-record byte counts to compatibility-annex provenance when the evidence UI is next revised. |
| `panels/rules/ruleUtils.ts` and `projectCommands/scenarioRulesCommands.ts` | **Resolved for rules and scenario startup metadata:** fresh constructors omit `rawBytes`; shell, security, contact, and restriction edits strip compatibility storage; template copies strip shell identity; and blank detection uses semantic fields. | Imported library summaries may continue exposing raw byte counts as compatibility evidence. |
| `panels/combat/monsterLibraryWorkflow.ts` and `monsterLibrary.ts` | **Resolved at scenario-copy boundary:** legacy library bytes may be decoded as input evidence, but copied `MonsterRecord` values omit them. | Raw library evidence may remain in the library annex; normalize it earlier only if library persistence needs a shared contract. |
| `projectCommands/mapCommands.ts` and target/rules record constructors | Map-record, scenario-item, treasure, shop, message, option-label, battle, monster, monster-description, spell, race, and caste dependencies are **resolved**. | Keep fresh constructors semantic-only as later DTO families migrate. |
| `browser/realmzParser.ts`, `browser/project.ts`, and `browser/semantic.ts` | Parse imported files, build evidence, and sometimes backfill semantic fields from raw buffers. | Retain in the legacy import/evidence pipeline; fresh semantic graphs should build from canonical data. |
| `browser/binaryWriters.ts` and Rust `realmz/*` writers | Family-specific migration remains. Monster/description and the completed authoritative families start from deterministic semantic buffers; some other codecs still overlay compatibility storage. | Continue moving preservation to the optional annex family by family. |
| Browser preview/source caches | Retain raw files for imported previews and browser package export. | Keep only for imported projects; managed authored assets provide fresh previews/resources. |

### The TypeScript/Rust duplication can be consolidated incrementally

The two top-level project models nearly match, but manual duplication already caused a concrete
drift: TypeScript had canonical `itemTexts` and a browser writer while Rust omitted the field from
its DTO, serializer, importer, and exporter. The investigation branch closes that gap and extends
the authoritative proof across TypeScript compilation, Rust save/open, both native compilers, and
legacy reimport.

The branch now also defines the persisted contract in language-neutral JSON Schema. Its generator
supplies the schema-version constant to both runtimes, emits one ordered top-level field inventory,
and owns the complete source/origin/source-file, scenario identity/startup, map identity/layout,
random-level/rectangle, map-record/marker/rectangle, scenario-item, treasure, shop, message,
option-label, battle, monster, monster-description, spell, race, and caste DTO families plus their shared
provenance/confidence primitives. A
conformance gate compares the inventory to both project models and the Rust serializer, rejects
handwritten duplicates, fixes the compatibility-only startup/layout/random-level payload
inventories, and checks the evidence/render vocabularies. This removes silent top-level,
source-boundary, startup-metadata, provenance, core-map, item-record, treasure-record, shop-record,
message-record, option-label-record, battle-record, monster-record, monster-description-record, and
rule-override drift while leaving other record and asset DTO families as bounded, incremental work.

This is evidence for a canonical contract, not for a new repository. Introduce a versioned
language-neutral project schema and generate DTOs for both languages, with handwritten domain
helpers and codecs around generated types. Migration can be family-by-family; the UI need not wait
for every type to move at once.

A pragmatic sequence is:

1. **Implemented:** define the persisted top-level project/origin contract and add model/serializer
   conformance checks.
2. **Implemented for source, scenario startup, and shared provenance metadata:** generate nested
   TypeScript and Rust DTO groups from that contract.
3. **Implemented for map identity/layout and map records:** generate the stable map/render/layout
   DTO group and complete semantic map-record family.
4. **Implemented for random levels:** generate semantic level/rectangle DTOs and keep imported raw
   storage optional and compatibility-only.
5. **Implemented for scenario items:** generate the complete 100-byte semantic record and keep the
   imported zero-ID alias as optional compatibility-only storage.
6. **Implemented for treasures:** generate the complete 48-byte semantic record, require twenty
   canonical item slots, and treat legacy raw storage only as migration input.
7. **Implemented for shops:** generate the complete 3,002-byte semantic row, require both thousand-
   slot inventories, and keep classified foreign suffix/tail bytes in the annex.
8. **Implemented for messages:** generate the semantic Str255 DTO, compile deterministic complete
   rows without raw identity, and preserve unchanged legacy rows/tails only from the annex.
9. **Implemented for option labels:** generate the semantic Str24 DTO, add Scenario JSON authoring,
   compile deterministic complete rows without raw identity, and keep noncanonical legacy capacity
   annex-only.
10. **Implemented for battles:** generate the 169-slot semantic battle DTO, compile all 346 row
    bytes with deterministic alignment padding, and keep unchanged imported rows annex-only.
11. **Implemented for monsters and rule overrides:** generate complete monster, description,
    spell, race, and caste DTOs, require exact fixed dimensions, and keep compatibility bytes
    optional and import-only.
12. Keep parser, compiler, validator, and UI behavior in handwritten modules.

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
| `<ScenarioName>` marker/main file | Generated semantic core + legacy singleton/tail annex | Generate exactly 316 bytes from canonical shell data | Both writers compile all five startup integers, both fixed code segments, and deterministic Str255 creator padding without consulting embedded compatibility storage. Untouched imported identity and an optional 316-320 tail are restored only from the annex. |
| `Scenario` 600-byte data fork | Deterministic neutral baseline + bounded editor fields + legacy annex | Generate exactly 600 bytes without imported identity | Both writers zero-initialize the file and compile only offset 23 and offsets 38-39. Untouched imported identity remains annex-owned; edited imports recover other editor/view-state bytes only from the annex. The modern runtime proof accepts the neutral default. |
| `Scenario.rsrc` / native `Scenario` resource fork | Canonical 46-byte minimum container plus generated overlays and legacy annex | Always construct an openable target resource fork without invented built-in metadata | Both compilers emit the exact zero-entry Resource Manager container and can build/merge map names, icons, pictures, sounds, text, and styles. Source and corpus evidence show that third-party scenarios do not require synthetic `RLMZ` entries. Stock Classic-Mac transport remains an acceptance gate. |
| `Data CS` | Generated semantic core + legacy singleton/tail annex | Generate canonical fresh security backup; annex imported identity only | The same 316-byte semantic codec is used. Fresh output duplicates the shell unless an explicit canonical backup exists; imported identity/tails remain annex-owned. Exact Divinity publish/refusal behavior is still not fixture-proven. |
| `Data CI` | Generated + legacy singleton/tail annex | Generate from contact metadata | Both writers compile all eighteen Str255 slots and deterministic padding without consulting `rawBytes`. An untouched imported singleton and malformed tail are restored only from the annex. |
| `Data RI` | Generated, optional + legacy singleton/tail annex | Generate when restrictions exist | Both writers compile all 320 bytes and normalize ban flags from canonical semantics without consulting `rawBytes`. An untouched imported singleton and malformed tail are restored only from the annex. |
| `Global` | Generated semantic hooks + bounded legacy annex | Generate 60 bytes with zero defaults for reserved slots | Both writers compile the five runtime-backed slots from canonical data without embedded bytes. Untouched imported identity is annex-owned; edited imports restore only reserved slots 3 and 6-29 plus a malformed tail. |
| `Data Solids` | Fully generated semantic table + legacy annex tail | Generate exactly 1,024 bytes from canonical special-tile profiles | Both compilers write every runtime-owned byte from `solidType`, use zero for unspecified rows, ignore embedded `rawByte` provenance, and reject ambiguous/out-of-domain profiles. Imported bytes beyond offset 1,023 remain annex-owned compatibility data. |

### Maps, Action Points, and scripts

| Native file/family | Current ownership | Fresh authoritative target | Evidence/remaining issue |
| --- | --- | --- | --- |
| `Data LD` | Generated | Generate all 16,200-byte land levels | Complete field writer and fixture coverage. |
| `Data DL` | Generated + compatibility | Generate authored dungeon bitfields; zero runtime/preserved bits | High/sign bit and revealed/runtime-state bits are preserved on legacy import. They are not needed as imported identity for fresh authoring. |
| `Data DD` | Generated | Generate one table per land level | Complete trigger-table writer. |
| `Data DDD` | Generated | Emit the file even with zero dungeon levels | The authored compiler baseline retains the empty startup file; the semantic writer overlays populated dungeon tables. |
| `Data RD` | Generated + bounded compatibility | Generate one random-level record per land level | Fresh records compile from canonical settings and rectangle data with no `rawValues`; imported 322-word storage remains an optional compatibility base for the final unmodeled byte and noncanonical legacy encodings. |
| `Data RDD` | Generated + bounded compatibility | Emit the file even with zero dungeon levels | The authored compiler baseline retains the empty startup file; populated dungeon levels use the same semantic writer and optional imported compatibility base. |
| `Data ED3` | Fully generated semantic rows + annex-shaped neutral capacity/tail | Generate every 40-byte Extra Action Point row | Both compilers write the complete `struct door` shape from canonical fields. Imported length may retain zero-filled row capacity; only a final partial row remains annex-owned identity. |
| `Data EDCD` | Fully generated semantic rows + annex-shaped neutral capacity/tail | Generate every five-word settings row | Both compilers write all five signed shorts from canonical values. Imported length may retain zero-filled row capacity; only a final partial row remains annex-owned identity. |
| `Layout` | Fully generated semantic grid + legacy annex tail, optional | Generate exactly 256 bytes from all 128 canonical cells | Both compilers require the 8 x 16 shape and ignore embedded `trailingBytes`. Imported optional bytes 256-511 remain preserve-only annex data, including exact 512-byte files. |

### Core records and encounters

| Native file/family | Current ownership | Fresh authoritative target | Evidence/remaining issue |
| --- | --- | --- | --- |
| `Data SD2` | Generated + legacy row/tail annex | Generate complete deterministic message records | Fresh/authored rows compile the Str255 length, payload, and zero fill without `rawBytes`. Unchanged imported rows and malformed tails are preserved only from the compatibility annex because post-length bytes are common in the legacy corpus. |
| `Data OD` | Generated + legacy row/tail annex | Generate complete deterministic option labels | Fresh/authored rows compile the Str24 length, payload, and zero fill without `rawBytes`. Unchanged imported padding, noncanonical capacity rows, and malformed tails are preserved only from the compatibility annex. |
| `Data BD` | Generated + legacy row/tail annex | Generate complete deterministic battle records | Fresh/authored rows compile all 346 bytes from canonical data, including zero alignment padding, without `rawBytes`. Unchanged imported rows and malformed tails are preserved only from the compatibility annex. |
| `Data MD`, `Data MD1`, `Data MD-1` | Generated + legacy row/tail annex | Generate complete deterministic monster records/sets | Fresh/authored rows compile all 210 bytes from canonical scalars, fixed arrays, Boolean state, and fixed display name without `rawBytes`. Unchanged imported rows and malformed tails are restored only from the compatibility annex. |
| `Data DES` | Generated + legacy row/tail annex | Generate complete deterministic monster descriptions | Fresh/authored rows compile the complete Str255 record with deterministic zero fill and no `rawBytes`. Unchanged imported rows and malformed tails are restored only from the compatibility annex. |
| `Data MD2` | Generated + bounded compatibility | Generate structured map records | Fresh records compile all 338 modeled bytes from canonical data and omit `rawBytes`. Imported records may retain the unknown bytes 74-75, equivalent noncanonical true words, unchanged Pascal-note tails, and malformed file tails. Marker UI uses semantic slots only. |
| `Data NI` | Generated + bounded compatibility encoding | Always generate exactly 200 x 100 bytes | All 100 bytes are canonical semantic fields, including `spare2[7]`; fresh records omit `rawBytes`. Imported bytes may retain only an unchanged zero stored item-ID alias until its semantic ID changes. |
| `Data TD` | Generated + malformed-tail annex | Generate all 48 record bytes from canonical semantics | Twenty item IDs and four reward words cover the full record. Fresh records omit `rawBytes`; imported rows recompile from decoded values. Only malformed file tails remain annex data. |
| `Data SD` | Generated + legacy suffix/tail annex | Generate every ordinary 3,002-byte shop row from canonical semantics | One thousand item IDs, one thousand quantities, and inflation cover the complete row. Fresh records omit `rawBytes`; imported rows recompile from decoded values. Classified foreign suffix records and malformed tails are appended from the annex. |
| `Data ED` | Generated + legacy row/tail annex | Generate complete deterministic simple encounters | Fresh/authored rows compile all 426 bytes from canonical actions, results, controls, prompt, and text, including zero alignment padding, without `rawBytes`. Unchanged imported rows and historical tails are restored only from the compatibility annex. |
| `Data ED2` | Generated + legacy row/tail annex | Generate complete deterministic complex encounters | Fresh/authored rows compile all 520 bytes from canonical actions, physical/word/group/spell/item routes, controls, prompt, and text, including zero alignment padding, without `rawBytes`. Unchanged imported rows and malformed tails are restored only from the compatibility annex. |
| `Data TD2` | Generated + legacy row/tail annex | Generate complete deterministic rogue/thief encounters | Fresh/authored rows compile all 118 bytes from canonical action, result, message, sound, trap, lock, and prompt fields without `rawBytes`. Unchanged imported rows and malformed tails are restored only from the compatibility annex. |
| `Data TD3` | Generated semantic prefix + bounded legacy annex | Generate timed encounters and zero reserved `stuff[1..9]` | Fresh rows compile offsets 0..21 from canonical schedule, macro, gate, and location fields and deterministically zero offsets 22..39 without `rawBytes`. Unchanged imported rows are annex-restored; edited imported rows compile semantics while recovering only the nine unnamed words from the annex. Their meanings remain unknown. |

### Rules and resource-bearing optional families

| Native file/family | Current ownership | Fresh authoritative target | Evidence/remaining issue |
| --- | --- | --- | --- |
| `Data Spell` | Fully generated + legacy tail annex | Emit exactly 105 x 30 bytes for fresh custom spells | Both compilers emit the runtime's fixed 3,150-byte table without an annex. Authored rows compile all 30 bytes from semantics; unchanged imported rows, short-file shapes, and trailing bytes remain annex-only compatibility data. |
| `Data Spell.rsrc` / `.rsf` / AppleDouble form | Generated + compatibility | Build custom spell `STR# 5000..5006` resources from canonical names | Both compilers create missing name families and preserve imported entry metadata and unrelated resources. Byte parity and semantic reimport are proof-gated. |
| `Data Race` | Fully generated + legacy row/tail annex | Emit exactly 30 x 408 bytes | Both compilers use the shared hash-gated baseline for unoverridden slots, then replace each authored row with all canonical `struct race` fields including `spare[8]` and `spacer[31]`. Embedded raw bytes cannot influence authored output; unchanged imported rows and malformed tails are annex-only. |
| `Data Caste` | Fully generated + legacy row/tail annex | Emit exactly 30 x 576 bytes | Both compilers use the same baseline policy and replace each authored row with all canonical `struct caste` fields including `spare1[2]`, `spare2[2]`, and `spacer[63]`. Fresh rows contain no compatibility bytes; imported preservation is annex-only. |
| Race/caste display names | Project-only | Keep project labels or define an explicit external-support workflow | Realmz reads global `Data Files/Custom Names.rsrc`; Divinity does not package it as scenario data. This is not a native scenario-folder requirement. |
| `Data ID.rsrc` item strings | Generated + compatibility | Generate deterministic `STR#` families from canonical item texts | Both compilers create fresh forks without an annex and preserve existing entry metadata/unrelated resources for imported scenarios. Byte parity and semantic reimport are proof-gated. |
| `Data Custom 1/2/3 BD` | Fully generated semantic core + bounded legacy annex; pass-through when untouched | Generate exact 8,104-byte metadata and zero preserve-only words for fresh custom landlooks | Both compilers generate 201 mapstats rows, base metadata, and ten ranges without embedded byte identity. Edited imports recover only spare/reserved words and a post-8,104 tail from the annex. Browser and desktop import produce the same canonical DTO. Custom 1 metadata plus its atlas is runtime-proven. |
| Main-fork `PICT`, `cicn`, `snd `, `TEXT`, `styl`, map-name `STR#` | Generated/merged | Generate deterministically from managed assets and map records | Existing resource-fork writer is reusable. The ownership proof owns five representative resources (`PICT 306`, `cicn -100`, `snd  321`, and paired `TEXT`/`styl -200`), proves Rust/browser byte parity on both targets, and recovers image/audio previews plus TEXT/styl semantics on reimport. Modern Realmz loads and renders the custom PICT. Unsupported imported resources stay in the annex. |
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
- **corrected in the fortieth slice:** the exact 600-byte `Scenario` data fork is reported as mixed
  Divinity editor support data, while actual `.rsrc`, `.rsf`, and AppleDouble forms remain resource
  forks;
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
   - **implemented:** exact 600-byte `Scenario` support file with a neutral fresh baseline and
     compatibility-annex preservation for unowned imported editor state;
   - **implemented:** exact 46-byte zero-entry main resource fork even with no authored resources;
   - fixed `Data NI` capacity when that family is emitted;
   - **implemented:** fixed 30-record `Data Race`/`Data Caste` output from one compiler baseline,
     including all structurally reserved words;
   - **implemented:** fixed 105-record `Data Spell` output and fresh custom-spell name resources;
   - required zero-length startup files;
   - **implemented:** deterministic semantic `Data CS` from the canonical shell or explicit backup;
   - **implemented:** exact 1,024-byte semantic `Data Solids` compilation with zero defaults and
     imported extra bytes isolated in the compatibility annex.
5. **Implemented at the export boundary:** move preservation helpers behind an optional,
   path-bounded compatibility-annex interface. Fresh compilation has poison-annex tests that fail
   if it enumerates or reads supplied legacy material. Completed authoritative families ignore
   embedded imported record bytes; remaining compatibility fields can migrate incrementally.
6. **Implemented for authored projects:** build validation and the Export panel's source plan from
   the compiler's expected native manifest. Imported projects remain intentionally source-driven
   at the compatibility boundary.
7. **Implemented at the semantic-source boundary:** authored indices consume canonical project
   fields and managed scenario resources with no raw buffers; imported indices retain raw-buffer
   enrichment. The scenario marker and `Data CS`, scenario items, treasures, thief/timed encounters, messages, shops, and
   simple/complex encounters, option labels, and monster descriptions now receive direct canonical
   summaries in both runtimes. Battles, primary monsters, both native alternate monster sets, and
   spell/race/caste overrides now follow the semantic writer-decoder path. Rule summaries decode
   the exact fixed-capacity fresh compiler buffers and hide baseline-only slots.
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
2. **Optional resource families:** the source-backed 46-byte minimum main fork, representative
   `PICT`/`cicn`/`snd `/`TEXT`/`styl` resources, item strings, and custom-spell strings are generated
   in both compilers. Arbitrary PICT editing, custom music, and some extracted sidecar families
   remain incomplete. Built-in `RLMZ` index metadata is intentionally not synthesized for fresh
   third-party scenarios.
3. **Remaining nested generated DTOs:** the language-neutral schema now owns and checks the
   persisted top-level inventory, complete source-origin/source-file, scenario startup, map
   identity/layout, random-level/rectangle, map-record, scenario-item, treasure, shop, message,
   option-label, battle, monster, monster-description, monster-set, item-text, Action Point/EDCD,
   spell, race, and caste DTO families, shared provenance/confidence primitives, and the
   schema-version constant. Managed/resource asset DTOs are still maintained manually and should
   migrate as the final bounded family.
4. **Preserved bytes inside records:** export-time file access is now annex-bounded, but several
   imported project records still embed unowned bytes. Scenario shell/support, monster, monster-description, spell, race,
   caste, contact, restriction, and global-hook export no longer consults those fields; marker and
   `Data CS` identity/tails and support-file editor state are annex-owned, and `Global`
   reserved slots are recovered only as bounded annex ranges. Remaining families must follow the
   same pattern rather than treating compatibility bytes as normal canonical fields.
5. **Canonical semantic coverage:** all currently modeled supporting, fixed-text, combat, rule
   override, scenario-shell/security-backup, contact, party-restriction, and global-hook families now map directly from canonical
   compiler bytes in both runtimes. Remaining semantic work concerns optional resource/media
   families and deeper field/link enrichment, not a fixed native-family ownership gap.
6. **Ownership-reporting distinction:** generated coverage now classifies complete Race/Caste rows
   as decoded-writable and keeps only the imported `Data Spell` tail mixed/preserved, but future
   reports should retain an explicit fresh-authoring dimension alongside conservative import proof.
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
   - exact canonical 46-byte zero-entry main resource-fork baseline, extended deterministically by
     project-owned managed resources;
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
  runtime constants, model/serializer conformance tests, and generated source, scenario-startup,
  provenance, map identity/layout, random-level/rectangle, map-record, scenario-item, treasure,
  shop, message, option-label, and battle DTOs; continue with later record families.

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

- **Implemented:** add the minimal map, Action Point, and message proof fixture.
- **Implemented:** add double-compile byte determinism and reimport tests.
- **Implemented:** run the existing Oracle gameplay path for start, movement, AP, save, and reload.

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
- **Implemented:** validate deterministic custom-landlook metadata and normalized `PICT 306..308`
  resource packaging across both compilers; prove Custom 1 lookup and rendering in modern Realmz.
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
