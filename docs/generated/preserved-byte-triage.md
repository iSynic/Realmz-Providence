# Preserved Byte Triage

This report classifies noisy or unknown scenario bytes using Divinity fixtures, Providence evidence reports, source/decompiler-backed layouts, and existing generated tooling. It intentionally separates authored game data from Divinity editor UI state and preserve-only compatibility bytes.

## Summary

Entries: 21
Targets: 7

### Classifications

| Classification | Entries |
| --- | ---: |
| authored game data | 9 |
| Divinity editor UI state | 3 |
| preserved compatibility bytes | 3 |
| release/security/editability metadata | 2 |
| runtime/cache/generated data | 2 |
| still unknown | 2 |

### Evidence Labels

| Evidence label | Entries |
| --- | ---: |
| correlated | 5 |
| fixture-proven | 5 |
| source/decompiler-supported | 9 |
| unknown | 2 |

## Promotion Rules

- Do not promote Scenario support-file offsets to authored game data when the same diff also contains editor view, selector, map, or tool state.
- A Divinity fixture proves only the isolated field it changes; nearby recurring Scenario bytes remain editor state unless a separate content fixture owns them.
- Source-backed runtime layouts can justify parsers and preservation policy, but Divinity label/write ownership still needs a fixture or a named editor/decompiler path.
- Generated runtime caches are relationship evidence, not export sources, unless a future workflow explicitly owns runtime-state editing.

## Source Status

| Source | Status | Summary |
| --- | --- | --- |
| providence.scenarioByteOwnership | available | containerCount=57; statusCounts={"decoded-writable":22,"mixed-writable-preserved":13,"preserved-known":5,"understood-resource-container":12,"runtime-cache":1,"custom-media-payload":3,"ignored-non-scenario":1}; sources={"fileInventory":"docs/generated/scenario-file-inventory.json","unknownBacklog":"docs/generated/unknown-data-backlog.json","runtimeCaches":"docs/generated/runtime-cache-classification.json","resourceCoverage":"docs/generated/resource-byte-ownership.json","customLandlookCoverage":"docs/generated/custom-landlook-coverage.json","rulesCoverage":"docs/generated/rules-resource-coverage.json","dungeonCoverage":"docs/generated/dungeon-byte-ownership.json","dungeonHighBitAudit":"docs/generated/dungeon-high-bit-audit.json","fixedRecordWriterGates":"docs/generated/fixed-record-writer-gates.json","scenarioStartupShellGate":"docs/generated/scenario-startup-shell-gate.json","mapsStorageWriterGates":"docs/generated/maps-storage-writer-gates.json","encounterShopWriterGates":"docs/generated/encounter-shop-writer-gates.json","coreRecordWriterGates":"docs/generated/core-record-writer-gates.json","completenessTruth":"docs/generated/scenario-completeness-truth.json","ed3Reachability":"docs/generated/extra-ap-reachability-source-map.json","edcdCrosswalk":"docs/generated/opcode-edcd-crosswalk.json"} |
| providence.scenarioStartupShellGate | available | writerReadiness=fixture-proven-startup-shell-core-preserve-tail; observedByteSizes=316, 320; ownedFields=0:reclevel, 4:maxlevel, 8:landlevel, 12:lookx, 16:looky, 20:codeseg1, 40:codeseg2, 60:creatorUser |
| providence.opcodeEdcdCrosswalk | available | totalOpcodes=130; edcdBacked=70; directExtraActionPoint=1; missingProvidenceShape=[]; fieldComparisonGaps=[] |
| providence.timedEncounterReservedFields | available | recordCount=16; findingCount=16; reservedUsagePresent=true; commonPatterns={"pattern":"11005,9994,11308,10800,12079,11568,11046,9980,10001","recordCount":14}, {"pattern":"15927,13874,14391,13365,14905,13364,12850,13357,10279","recordCount":2} |
| providence.dungeonByteOwnership | available | cells=1579500; bitStatuses={"preserved-known":1,"decoded-writable":13,"runtime-state":2}; writerStatuses={"preserve-only":1,"writer-safe-primitive":11,"read-only-preserve":2,"route-through-action-point-workflow":1,"route-through-note-workflow":1} |
| divinity.noOpControls | available | id=fixture-editor-no-op-control-set; confidence=fixture-backed; followUpStatus=preserve-only; byteOffsets=Scenario:35+1, Scenario:429+1, Scenario:433+1, Scenario:445+1, Scenario:449+1 |
| divinity.stringEdit | available | id=fixture-string-data-sd2-first-edit; confidence=fixture-backed; followUpStatus=parser-writer; byteOffsets=Data SD2:1024+6, Data SD2:1031+7, Data SD2:1039+6, Data SD2:1046+3 |
| divinity.extraApCodeRow | available | id=fixture-extra-action-point-code-row-first-edit; confidence=fixture-backed; followUpStatus=parser-only; byteOffsets=Data ED3:9+1, Scenario:429+1 |
| divinity.apIdRow | missing | - |
| divinity.landOneTile | available | id=fixture-land-one-tile-first-edit; confidence=fixture-backed; followUpStatus=parser-writer; byteOffsets=Data LD:1443+1, Scenario:429+1, Scenario:433+1, Scenario:455+1 |
| divinity.landSecondCell | available | id=fixture-land-second-basic-cell-first-edit; confidence=fixture-backed; followUpStatus=parser-writer; byteOffsets=Data LD:1623+1, Scenario:30+2, Scenario:34+2, Scenario:429+1, Scenario:433+1, Scenario:455+1 |
| divinity.specialLandReference | available | id=fixture-special-land-tile-reference-first-edit; confidence=fixture-backed; followUpStatus=parser-writer; byteOffsets=Data LD:1442+2, Scenario:30+2, Scenario:34+2, Scenario:429+1, Scenario:433+1 |
| divinity.dungeonWallClick | available | id=fixture-dungeon-wall-click-apply-first-edit; confidence=fixture-backed; followUpStatus=parser-only; byteOffsets=Data DL:1+1, Scenario:429+1, Scenario:445+1 |
| divinity.dungeonWallBit | available | id=fixture-dungeon-wall-bit-first-edit; confidence=fixture-backed; followUpStatus=parser-writer; byteOffsets=Data DL:1+1, Scenario:429+1, Scenario:433+1, Scenario:445+1, Scenario:449+1 |
| divinity.dungeonHorizontalDoor | available | id=fixture-dungeon-horizontal-door-bit-first-edit; confidence=fixture-backed; followUpStatus=parser-writer; byteOffsets=Data DL:1+1, Scenario:429+1, Scenario:433+1, Scenario:445+1, Scenario:455+1 |
| divinity.capstoneIndex | available | stringCount=null; hasTimedEncounterAnchor=true; hasSecurityAnchor=true |
| divinity.binaryFileWriteMap | available | F:\Divinity - Codex\divinity-port\docs\binary-editor-file-write-map.md |

## Triage Entries

| Target | Container / bytes | Classification | Evidence | Conclusion |
| --- | --- | --- | --- | --- |
| Scenario support-file editor-state bytes | Scenario support file: offsets 429, 433 | Divinity editor UI state | fixture-proven | Recurring Divinity no-op and content fixtures change these bytes as view/map context, not scenario-authored content. |
| Scenario support-file editor-state bytes | Scenario support file: offsets 437, 441 | Divinity editor UI state | correlated | String-editor controls identify these as visible Go H/V field state; no current clean payload model needs them. |
| Scenario support-file nearby string/map state | Scenario support file: offsets 23, 30, 34, 35, 445, 449, 455 | Divinity editor UI state | correlated | Nearby bytes recur as string selector, land/special selection, dungeon tool, and editor context state. |
| Scenario support-file nearby string/map state | Data SD2: String 4 payload bytes in the controlled fixture | authored game data | fixture-proven | The isolated String 4 edit mutated Data SD2 after editor selector and map state were normalized. |
| Scenario publish/security/editability gate | Scenario Startup Shell: core 0..316 plus optional tail 316..320 | release/security/editability metadata | source/decompiler-supported | Providence owns startup fields and preserves raw security/contact segments; the optional tail is preserved compatibility data. |
| Scenario publish/security/editability gate | Data CS: 316-byte security backup container | release/security/editability metadata | source/decompiler-supported | Data CS is security/editability metadata and remains preserve-only in Providence. |
| Scenario publish/security/editability gate | Format: zero-byte marker file | preserved compatibility bytes | correlated | Format is a compatibility marker observed in scenario inventory, not an authored payload. |
| Scenario publish/security/editability gate | Scenario/Data CS/Format candidate area: exact publish/refusal byte deltas not isolated | still unknown | unknown | Divinity has binary text for published/security/edit refusal, but this pass did not find a clean fixture showing exactly what bytes change when publishing or refusing edit. |
| Data ED3/Data EDCD Extra AP rows | Data ED3: 40-byte rows: 0..4 ID, 4..8 level/x/y/chance, 8..24 code[8], 24..40 id[8] | authored game data | source/decompiler-supported | ED3 is the Extra AP authored script row store; Divinity fixture evidence separately proves at least the visible code-row mutation path. |
| Data ED3/Data EDCD Extra AP rows | Data EDCD: 10-byte rows: extracode[0..4] as five signed big-endian shorts | authored game data | source/decompiler-supported | EDCD rows are authored action-parameter rows loaded by EDCD-backed opcodes. |
| Data ED3/Data EDCD Extra AP rows | Data EDCD: row allocation/reuse policy | authored game data | correlated | Providence can reuse missing EDCD row IDs for new authoring, while existing imported unused rows are preserved; Divinity row allocation evidence remains noisy. |
| Data ED3/Data EDCD Extra AP rows | Data EDCD and direct opcode IDs: opcode parameters | authored game data | source/decompiler-supported | Common mappings are covered by the opcode crosswalk: opcode 39 direct Extra AP, opcode 7 copy-source row, opcode 54 timed mutation, opcode 92 two EDCD rows, and opcode 122 fumble fields. |
| Data LD/Data DL one-field fixtures | Data LD: one-byte basic land tile changes at fixture-selected cells | authored game data | fixture-proven | One-field Divinity land fixtures prove specific Data LD cell payload mutations. |
| Data LD/Data DL one-field fixtures | Data LD: two-byte special land tile references at fixture-selected cells | authored game data | fixture-proven | Special land placement fixtures prove authored Data LD special-reference storage at selected cells. |
| Data LD/Data DL one-field fixtures | Data DL: 90x90 dungeon cell bitfields, two bytes per cell | authored game data | fixture-proven | Dungeon one-cell fixtures prove Data DL as the authored dungeon cell store; source-backed bit taxonomy supplies broader passability/path/door/combat names. |
| Data LD/Data DL one-field fixtures | Data DL: visibleArch/revealedSecret runtime-state bits | runtime/cache/generated data | source/decompiler-supported | Runtime visibility/reveal state is read-only preserve state, not an authoring target for the map editor. |
| Data LD/Data DL one-field fixtures | Data DL: 0x8000 high/sign compatibility bit | preserved compatibility bytes | source/decompiler-supported | The dungeon high/sign bit is preserved-known compatibility data and is not part of the primitive map authoring surface. |
| Data TD3 stuff[1..9] | Data TD3: 40-byte timed encounter rows; day..recquest plus stuff[0] | authored game data | source/decompiler-supported | Timed encounter schedule, gate fields, door/Extra AP target, and stuff[0] location kind are source-backed authored fields. |
| Data TD3 stuff[1..9] | Data TD3: stuff[1]..stuff[9], offsets 22..40 within each 40-byte row | preserved compatibility bytes | correlated | The corpus shows repeatable nonzero values in active records, but source/runtime evidence only reads stuff[0] meaningfully; Providence should preserve and display these as compatibility data. |
| Data TD3 stuff[1..9] | CTD3: runtime copy of Data TD3 | runtime/cache/generated data | source/decompiler-supported | CTD3 is generated from Data TD3 at runtime/new game/load and mutated by gameplay actions. |
| Still unknown preserved bytes | Scenario support file: unlisted offsets outside current fixture/source ownership | still unknown | unknown | Unclaimed Scenario support-file bytes remain unknown or preserve-only; no promotion occurred in this pass. |

## Details

### scenario-429-433-editor-state

- target: Scenario support-file editor-state bytes
- container: Scenario support file
- byte range: offsets 429, 433
- classification: Divinity editor UI state
- evidence label: fixture-proven
- conclusion: Recurring Divinity no-op and content fixtures change these bytes as view/map context, not scenario-authored content.
- promotion policy: Preserve byte-for-byte; exclude from authored game data even when they appear beside Data SD2, ED3, LD, or DL payload changes.
- evidence:
  - Divinity evidence card: fixture-editor-no-op-control-set
  - Divinity evidence card: fixture-string-data-sd2-first-edit
  - Divinity local fixture diffs summarized in preserved-byte triage

### scenario-437-441-string-go-fields

- target: Scenario support-file editor-state bytes
- container: Scenario support file
- byte range: offsets 437, 441
- classification: Divinity editor UI state
- evidence label: correlated
- conclusion: String-editor controls identify these as visible Go H/V field state; no current clean payload model needs them.
- promotion policy: Do not promote 437 or 441 to authored string/map data from a diff that also contains Scenario editor context.
- notes:
  - The committed string payload card proves Data SD2 content after normalizing selector/map state.
  - Treat these offsets as editor state until a separate fixture proves authored semantics.
- evidence:
  - Divinity evidence card note: fixture-string-data-sd2-first-edit
  - String editor selector/control matrix

### scenario-nearby-editor-state

- target: Scenario support-file nearby string/map state
- container: Scenario support file
- byte range: offsets 23, 30, 34, 35, 445, 449, 455
- classification: Divinity editor UI state
- evidence label: correlated
- conclusion: Nearby bytes recur as string selector, land/special selection, dungeon tool, and editor context state.
- promotion policy: Use these bytes only as preserve-only editor-state evidence unless future controls isolate a content meaning.
- notes:
  - Offsets 35, 445, and 449 are directly represented in no-op controls.
  - Offsets 23, 30, 34, and 455 appear as sidecar state in focused string, land, and dungeon fixture campaigns.
- evidence:
  - Divinity evidence card: fixture-editor-no-op-control-set
  - Divinity land/special/dungeon fixture cards
  - Local sanitized fixture-diff inventory

### scenario-data-sd2-authored-string

- target: Scenario support-file nearby string/map state
- container: Data SD2
- byte range: String 4 payload bytes in the controlled fixture
- classification: authored game data
- evidence label: fixture-proven
- conclusion: The isolated String 4 edit mutated Data SD2 after editor selector and map state were normalized.
- promotion policy: Promote only the Data SD2 payload ranges, not the Scenario editor-state bytes observed during setup or navigation.
- evidence:
  - Divinity evidence card: fixture-string-data-sd2-first-edit

### scenario-startup-security-core

- target: Scenario publish/security/editability gate
- container: Scenario Startup Shell
- byte range: core 0..316 plus optional tail 316..320
- classification: release/security/editability metadata
- evidence label: source/decompiler-supported
- conclusion: Providence owns startup fields and preserves raw security/contact segments; the optional tail is preserved compatibility data.
- promotion policy: Mutate only the decoded startup core through the existing writer; preserve security segments and optional tail unless a gate-specific fixture owns them.
- notes:
  - Observed writer readiness: fixture-proven-startup-shell-core-preserve-tail
- evidence:
  - docs/generated/scenario-startup-shell-gate.json
  - docs/format-evidence-cards/scenario-shell-startup-release.md
  - src-tauri/src/realmz/scenario.rs startup shell tests

### data-cs-security-backup

- target: Scenario publish/security/editability gate
- container: Data CS
- byte range: 316-byte security backup container
- classification: release/security/editability metadata
- evidence label: source/decompiler-supported
- conclusion: Data CS is security/editability metadata and remains preserve-only in Providence.
- promotion policy: Do not expose as authored game data; preserve until a Divinity security editor fixture proves write semantics.
- evidence:
  - docs/generated/scenario-byte-ownership.json
  - Divinity Capstone index security/Data CS strings
  - Realmz source/security-shell evidence

### format-marker

- target: Scenario publish/security/editability gate
- container: Format
- byte range: zero-byte marker file
- classification: preserved compatibility bytes
- evidence label: correlated
- conclusion: Format is a compatibility marker observed in scenario inventory, not an authored payload.
- promotion policy: Keep as preserve/emit compatibility metadata only.
- evidence:
  - docs/generated/scenario-byte-ownership.json
  - Divinity Capstone string anchor near Realmz-format text

### divinity-published-refusal-exact-delta

- target: Scenario publish/security/editability gate
- container: Scenario/Data CS/Format candidate area
- byte range: exact publish/refusal byte deltas not isolated
- classification: still unknown
- evidence label: unknown
- conclusion: Divinity has binary text for published/security/edit refusal, but this pass did not find a clean fixture showing exactly what bytes change when publishing or refusing edit.
- promotion policy: Keep candidate bytes unknown or preserve-only until a publish/refusal fixture isolates the changed files and offsets.
- notes:
  - The gate category is release/security/editability metadata.
  - The exact byte-level delta remains blocked on a targeted fixture.
- evidence:
  - Divinity Capstone strings: Data CS, security permanent, not allowed to edit/view scenario
  - No accepted publish/refusal mutation fixture found in current evidence cards

### ed3-row-layout

- target: Data ED3/Data EDCD Extra AP rows
- container: Data ED3
- byte range: 40-byte rows: 0..4 ID, 4..8 level/x/y/chance, 8..24 code[8], 24..40 id[8]
- classification: authored game data
- evidence label: source/decompiler-supported
- conclusion: ED3 is the Extra AP authored script row store; Divinity fixture evidence separately proves at least the visible code-row mutation path.
- promotion policy: Treat ED3 as authored game data, but keep Divinity fixture claims scoped to the edited code byte.
- notes:
  - The Divinity fixture proves Data ED3 offset 9 for one code-row edit only; row stride and full layout come from source/decompiler evidence.
- evidence:
  - docs/format-evidence-cards/action-point-extra-ap-storage-reachability.md
  - docs/generated/extra-ap-reachability-source-map.json
  - Divinity evidence card: fixture-extra-action-point-code-row-first-edit

### edcd-row-layout

- target: Data ED3/Data EDCD Extra AP rows
- container: Data EDCD
- byte range: 10-byte rows: extracode[0..4] as five signed big-endian shorts
- classification: authored game data
- evidence label: source/decompiler-supported
- conclusion: EDCD rows are authored action-parameter rows loaded by EDCD-backed opcodes.
- promotion policy: Editable by opcode shape; unused imported rows remain preserved unless an explicit authoring operation owns replacement.
- notes:
  - Crosswalk EDCD-backed opcode count: 70
  - Crosswalk field comparison gaps: 0
- evidence:
  - docs/format-evidence-cards/edcd-opcode-source-map.md
  - docs/generated/opcode-edcd-crosswalk.json
  - src/editor/realmzEdcd.ts

### edcd-allocation-reuse

- target: Data ED3/Data EDCD Extra AP rows
- container: Data EDCD
- byte range: row allocation/reuse policy
- classification: authored game data
- evidence label: correlated
- conclusion: Providence can reuse missing EDCD row IDs for new authoring, while existing imported unused rows are preserved; Divinity row allocation evidence remains noisy.
- promotion policy: Do not compact or overwrite imported EDCD rows solely because they are currently unreferenced.
- notes:
  - The noisy Divinity ID-row path appended a zero EDCD row but also changed Scenario state and had ambiguous UI outcome.
  - This is a policy conclusion for Providence preservation, not a clean Divinity allocation proof.
- evidence:
  - src/editor/edcdRows.ts nextUnusedEdcdRowId
  - Divinity action-point ID-row fixture notes
  - docs/generated/opcode-edcd-crosswalk.json

### edcd-common-action-mappings

- target: Data ED3/Data EDCD Extra AP rows
- container: Data EDCD and direct opcode IDs
- byte range: opcode parameters
- classification: authored game data
- evidence label: source/decompiler-supported
- conclusion: Common mappings are covered by the opcode crosswalk: opcode 39 direct Extra AP, opcode 7 copy-source row, opcode 54 timed mutation, opcode 92 two EDCD rows, and opcode 122 fumble fields.
- promotion policy: Use shape-specific labels from the crosswalk; do not infer a generic EDCD field meaning across unrelated opcodes.
- evidence:
  - docs/generated/opcode-edcd-crosswalk.json
  - docs/format-evidence-cards/edcd-opcode-source-map.md
  - src/editor/generated/divinityOpcodeHelp.json

### data-ld-basic-tile

- target: Data LD/Data DL one-field fixtures
- container: Data LD
- byte range: one-byte basic land tile changes at fixture-selected cells
- classification: authored game data
- evidence label: fixture-proven
- conclusion: One-field Divinity land fixtures prove specific Data LD cell payload mutations.
- promotion policy: Promote only the Data LD byte changed by the isolated land fixture.
- notes:
  - Associated Scenario offsets 30, 34, 429, 433, and 455 are editor state, not land payload.
- evidence:
  - Divinity evidence cards: fixture-land-one-tile-first-edit, fixture-land-second-basic-cell-first-edit
  - docs/data-ld-dl-expansion-plan.md

### data-ld-special-reference

- target: Data LD/Data DL one-field fixtures
- container: Data LD
- byte range: two-byte special land tile references at fixture-selected cells
- classification: authored game data
- evidence label: fixture-proven
- conclusion: Special land placement fixtures prove authored Data LD special-reference storage at selected cells.
- promotion policy: Keep Scenario selection bytes preserve-only; only the Data LD reference bytes are authored payload.
- evidence:
  - Divinity evidence card: fixture-special-land-tile-reference-first-edit
  - Divinity evidence card: fixture-special-land-tile-reference-second-edit

### data-dl-cell-fixtures

- target: Data LD/Data DL one-field fixtures
- container: Data DL
- byte range: 90x90 dungeon cell bitfields, two bytes per cell
- classification: authored game data
- evidence label: fixture-proven
- conclusion: Dungeon one-cell fixtures prove Data DL as the authored dungeon cell store; source-backed bit taxonomy supplies broader passability/path/door/combat names.
- promotion policy: Promote bit meanings by source taxonomy and isolated fixture, not by noisy cell-click diffs that also update Scenario tool state.
- notes:
  - Fixture coverage proves selected cell writes, not every bit polarity.
  - NoWallInBattle/combat expansion and movement/path bits are source-backed; visible/revealed runtime bits remain read-only preserve.
- evidence:
  - Divinity dungeon wall/horizontal-door fixture cards
  - docs/generated/dungeon-byte-ownership.json
  - docs/generated/dungeon-cell-bit-taxonomy.json

### data-dl-runtime-bits

- target: Data LD/Data DL one-field fixtures
- container: Data DL
- byte range: visibleArch/revealedSecret runtime-state bits
- classification: runtime/cache/generated data
- evidence label: source/decompiler-supported
- conclusion: Runtime visibility/reveal state is read-only preserve state, not an authoring target for the map editor.
- promotion policy: Do not author runtime reveal bits from the map editor workflow.
- evidence:
  - docs/generated/dungeon-byte-ownership.json
  - docs/generated/dungeon-cell-bit-taxonomy.json

### data-dl-high-sign-bit

- target: Data LD/Data DL one-field fixtures
- container: Data DL
- byte range: 0x8000 high/sign compatibility bit
- classification: preserved compatibility bytes
- evidence label: source/decompiler-supported
- conclusion: The dungeon high/sign bit is preserved-known compatibility data and is not part of the primitive map authoring surface.
- promotion policy: Preserve imported high/sign bit values unless a future fixture/source path assigns an authoring meaning.
- evidence:
  - docs/generated/dungeon-byte-ownership.json
  - docs/generated/dungeon-high-bit-audit.json

### td3-authored-core

- target: Data TD3 stuff[1..9]
- container: Data TD3
- byte range: 40-byte timed encounter rows; day..recquest plus stuff[0]
- classification: authored game data
- evidence label: source/decompiler-supported
- conclusion: Timed encounter schedule, gate fields, door/Extra AP target, and stuff[0] location kind are source-backed authored fields.
- promotion policy: Author named TD3 core fields and preserve imported field values outside normal validation ranges unless the user edits them.
- evidence:
  - docs/generated/thief-timed-encounter-evidence.json
  - docs/format-evidence-cards/thief-timed-encounter-runtime-anchors.md
  - F:\Realmz\src\realmz_orig\textbox-time.c

### td3-stuff-1-9

- target: Data TD3 stuff[1..9]
- container: Data TD3
- byte range: stuff[1]..stuff[9], offsets 22..40 within each 40-byte row
- classification: preserved compatibility bytes
- evidence label: correlated
- conclusion: The corpus shows repeatable nonzero values in active records, but source/runtime evidence only reads stuff[0] meaningfully; Providence should preserve and display these as compatibility data.
- promotion policy: Do not label these slots as known authored fields until a source, decompiler, Divinity fixture, or runtime behavior names a slot.
- notes:
  - Reserved-field findings: 16 record(s) with nonzero values.
  - No Divinity label/write fixture for individual stuff[1..9] slots was found in this pass.
- evidence:
  - docs/generated/timed-encounter-reserved-fields.json
  - docs/generated/timed-encounter-reserved-fields.md
  - src/editor/panels/ScriptsPanel.tsx compatibility display

### ctd3-runtime-cache

- target: Data TD3 stuff[1..9]
- container: CTD3
- byte range: runtime copy of Data TD3
- classification: runtime/cache/generated data
- evidence label: source/decompiler-supported
- conclusion: CTD3 is generated from Data TD3 at runtime/new game/load and mutated by gameplay actions.
- promotion policy: Use CTD3 only for relationship tracing and runtime archaeology; do not export it as authored source.
- evidence:
  - docs/generated/thief-timed-encounter-evidence.json
  - F:\Realmz\src\realmz_orig\setupnewgame.c
  - F:\Realmz\src\realmz_orig\newland.c

### remaining-scenario-support-bytes

- target: Still unknown preserved bytes
- container: Scenario support file
- byte range: unlisted offsets outside current fixture/source ownership
- classification: still unknown
- evidence label: unknown
- conclusion: Unclaimed Scenario support-file bytes remain unknown or preserve-only; no promotion occurred in this pass.
- promotion policy: Keep unclaimed offsets in the preserved/unknown bucket until isolated fixtures or source/decompiler anchors classify them.
- evidence:
  - docs/generated/scenario-byte-ownership.json
  - Divinity fixture-diff inventory

