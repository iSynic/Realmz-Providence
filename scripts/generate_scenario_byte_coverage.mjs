import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const roundtripLedgerPath = path.join(repoRoot, "docs/generated/scenario-byte-roundtrip-ledger.json");
const unknownBacklogPath = path.join(repoRoot, "docs/generated/unknown-data-backlog.json");
const runtimeCachePath = path.join(repoRoot, "docs/generated/runtime-cache-classification.json");
const resourceByteOwnershipPath = path.join(repoRoot, "docs/generated/resource-byte-ownership.json");
const dungeonByteOwnershipPath = path.join(repoRoot, "docs/generated/dungeon-byte-ownership.json");
const customLandlookCoveragePath = path.join(repoRoot, "docs/generated/custom-landlook-coverage.json");
const rulesCoveragePath = path.join(repoRoot, "docs/generated/rules-resource-coverage.json");
const targetCompatibilityPath = path.join(repoRoot, "docs/generated/scenario-target-compatibility.json");
const actionPointWriterGatePath = path.join(repoRoot, "docs/generated/action-point-writer-gate.json");
const fixedRecordWriterGatesPath = path.join(repoRoot, "docs/generated/fixed-record-writer-gates.json");
const scenarioStartupShellGatePath = path.join(repoRoot, "docs/generated/scenario-startup-shell-gate.json");
const mapsStorageWriterGatesPath = path.join(repoRoot, "docs/generated/maps-storage-writer-gates.json");
const encounterShopWriterGatesPath = path.join(repoRoot, "docs/generated/encounter-shop-writer-gates.json");
const coreRecordWriterGatesPath = path.join(repoRoot, "docs/generated/core-record-writer-gates.json");
const realmzAssemblyRsPath = path.join(repoRoot, "src-tauri/src/realmz/assembly.rs");

const fileInventoryPath = path.join(repoRoot, "docs/generated/scenario-file-inventory.json");
const byteOwnershipPath = path.join(repoRoot, "docs/generated/scenario-byte-ownership.json");
const unknownReportPath = path.join(repoRoot, "docs/generated/scenario-unknown-byte-report.json");
const completenessTruthPath = path.join(repoRoot, "docs/generated/scenario-completeness-truth.json");
const functionalAuthoringReadinessPath = path.join(repoRoot, "docs/generated/functional-authoring-readiness.json");
const uiManifestPath = path.join(repoRoot, "src/editor/generated/scenarioCoverageManifest.json");

const NON_SCENARIO_IGNORES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);
const SCENARIO_STARTUP_SHELL_CONTAINER = "Scenario Startup Shell";
const SCENARIO_STARTUP_SHELL_CORE_BYTES = 316;
const SCENARIO_STARTUP_SHELL_MAX_BYTES = 320;

const RECORD_LAYOUTS = {
  Scenario: { recordBytes: 600, label: "Divinity editor support data", status: "mixed-writable-preserved" },
  "Data LD": { recordBytes: 16200, label: "Outdoor land tile fields", status: "decoded-writable" },
  "Data DL": { recordBytes: 16200, label: "Dungeon tile fields", status: "decoded-writable" },
  "Data DD": { recordBytes: 4000, label: "Land Action Point records", status: "decoded-writable" },
  "Data DDD": { recordBytes: 4000, label: "Dungeon Action Point records", status: "decoded-writable" },
  "Data RD": { recordBytes: 644, label: "Land random encounter settings", status: "decoded-writable" },
  "Data RDD": { recordBytes: 644, label: "Dungeon random encounter settings", status: "decoded-writable" },
  "Data ED": { recordBytes: 426, label: "Simple encounter records", status: "decoded-writable" },
  "Data ED2": { recordBytes: 520, label: "Complex encounter records", status: "decoded-writable" },
  "Data ED3": { recordBytes: 40, label: "Extra Action Point records", status: "decoded-writable" },
  "Data EDCD": { recordBytes: 10, label: "Action parameter rows", status: "decoded-writable" },
  "Data MD": { recordBytes: 210, label: "Monster records", status: "decoded-writable" },
  "Data MD1": { recordBytes: 210, label: "Monster set records", status: "decoded-writable" },
  "Data MD-1": { recordBytes: 210, label: "Monster set records", status: "decoded-writable" },
  "Data DES": { recordBytes: 256, label: "Monster description records", status: "decoded-writable" },
  "Data BD": { recordBytes: 346, label: "Battle records", status: "decoded-writable" },
  "Data SD": { recordBytes: 3002, label: "Shop records", status: "decoded-writable" },
  "Data SD2": { recordBytes: 256, label: "Strings/messages", status: "decoded-writable" },
  "Data OD": { recordBytes: 25, label: "Option labels", status: "decoded-writable" },
  "Data MD2": { recordBytes: 340, label: "Map records", status: "decoded-writable" },
  "Data TD": { recordBytes: 48, label: "Treasure records", status: "decoded-writable" },
  "Data TD2": { recordBytes: 118, label: "Thief encounter records", status: "decoded-writable" },
  "Data TD3": { recordBytes: 40, label: "Timed encounter records", status: "decoded-writable" },
  "Data CI": { recordBytes: 4608, label: "Contact information", status: "decoded-writable" },
  "Data RI": { recordBytes: 320, label: "Party restrictions", status: "decoded-writable" },
  "Data CS": { recordBytes: 316, label: "Scenario security backup", status: "decoded-writable" },
  Global: { recordBytes: 60, label: "Global macro hooks", status: "decoded-writable" },
  "Data MENU": { recordBytes: 502, label: "Generated monster menu cache", status: "runtime-cache" },
  "Data Solids": { recordBytes: 1024, label: "Special tile solidity table", status: "decoded-writable" },
  "Data NI": { recordBytes: 100, label: "Scenario item records", status: "decoded-writable" },
  "Data Spell": { recordBytes: 30, label: "Custom spell override records", status: "decoded-writable" },
  "Data Race": { recordBytes: 408, label: "Race override records", status: "decoded-writable" },
  "Data Caste": { recordBytes: 576, label: "Caste override records", status: "decoded-writable" },
  Layout: { recordBytes: 256, label: "Land layout grid", status: "decoded-writable" }
};

const PASS_THROUGH_POLICIES = {
  "Data Custom 1 BD": { status: "preserved-known", label: "Custom landlook mapstats" },
  "Data Custom 2 BD": { status: "preserved-known", label: "Custom landlook mapstats" },
  "Data Custom 3 BD": { status: "preserved-known", label: "Custom landlook mapstats" },
  "Custom 1": { status: "preserved-known", label: "Custom compatibility/media companion; not a landlook runtime metadata file" },
  "Custom 2": { status: "preserved-known", label: "Custom compatibility/media companion; not a landlook runtime metadata file" },
  "Custom 3": { status: "preserved-known", label: "Custom compatibility/media companion; not a landlook runtime metadata file" },
  "Custom 4": { status: "preserved-known", label: "Custom compatibility/media companion; not a landlook runtime metadata file" },
  "Custom 5": { status: "preserved-known", label: "Custom compatibility/media companion; not a landlook runtime metadata file" },
  "Custom 6": { status: "preserved-known", label: "Custom compatibility/media companion; not a landlook runtime metadata file" },
  "Custom 7": { status: "preserved-known", label: "Custom compatibility/media companion; not a landlook runtime metadata file" },
  "Custom 8": { status: "preserved-known", label: "Custom compatibility/media companion; not a landlook runtime metadata file" },
  "Custom 9": { status: "preserved-known", label: "Custom compatibility/media companion; not a landlook runtime metadata file" },
  "Custom 1 Music": { status: "custom-media-payload", label: "Custom music" },
  "Custom 2 Music": { status: "custom-media-payload", label: "Custom music" },
  "Custom 3 Music": { status: "custom-media-payload", label: "Custom music" },
  "Custom 4 Music": { status: "custom-media-payload", label: "Custom music" },
  "Custom 5 Music": { status: "custom-media-payload", label: "Custom music" },
  "Custom 6 Music": { status: "custom-media-payload", label: "Custom music" },
  "Custom 7 Music": { status: "custom-media-payload", label: "Custom music" },
  "Custom 8 Music": { status: "custom-media-payload", label: "Custom music" },
  "Custom 9 Music": { status: "custom-media-payload", label: "Custom music" },
  Format: { status: "preserved-known", label: "Scenario compatibility marker" },
  "Icon_": { status: "preserved-known", label: "Classic Mac resource companion" },
  "Read Me (nice to know)": { status: "ignored-non-scenario", label: "Distribution documentation" }
};

const RESOURCE_TYPE_POLICIES = {
  PICT: { status: "preserved-known", role: "picture resource" },
  cicn: { status: "preserved-known", role: "icon resource" },
  "snd ": { status: "preserved-known", role: "sound resource" },
  "STR#": { status: "preserved-known", role: "string-list resource" },
  TEXT: { status: "preserved-known", role: "text resource" },
  styl: { status: "preserved-known", role: "text style resource" },
  RLMZ: { status: "preserved-known", role: "Realmz metadata resource" },
  vers: { status: "preserved-known", role: "version resource" }
};

const STATUS_LABELS = {
  "decoded-writable": "Editable",
  "decoded-readonly": "Read-only",
  "mixed-writable-preserved": "Partially Editable",
  "preserved-known": "Preserved",
  "preserved-unknown": "Preserved",
  "runtime-cache": "Runtime state",
  "ignored-non-scenario": "Ignored",
  "unknown-active-risk": "Needs format work",
  "understood-resource-container": "Understood resource container",
  "decoded-resource-payload": "Decoded resource payload",
  "preserved-standard-media-payload": "Preserved standard media payload",
  "custom-media-payload": "Custom media payload",
  "needs-codec-work": "Needs codec work",
  "understood-runtime-writer-gated": "Needs writer proof",
  "resource-packaging-needed": "Needs packaging work",
  "divinity-labels-needed": "Needs editor labels"
};

const FIXTURE_GATES = {
  Scenario: {
    gate: "scenario-support-file-bounded-writer",
    fixturePaths: [],
    evidence: [
      "src-tauri/src/realmz/scenario.rs:scenario_support_file_compiles_bounded_editor_state_without_raw_identity",
      "src-tauri/src/exporter.rs:scenario_metadata_legacy_identity_comes_only_from_annex",
      "src/editor/browser/binaryWriters.test.ts:compiles a neutral 600-byte support file plus bounded Divinity editor state",
      "scripts/check_browser_scenario_package.mjs",
      "scripts/run_authoritative_scenario_proof.mjs"
    ],
    partialOnly: true
  },
  "Scenario.rsrc": {
    gate: "minimum-scenario-resource-container",
    fixturePaths: [],
    evidence: [
      "docs/format-evidence-cards/scenario-resource-fork-minimum.md",
      "src-tauri/src/resource_fork.rs:minimum_scenario_resource_fork_is_canonical_empty_container",
      "src/editor/browser/resourceFork.test.ts:builds the canonical empty scenario resource container",
      "scripts/check_generated_scenario_baseline.mjs",
      "scripts/run_authoritative_scenario_proof.mjs"
    ]
  },
  "Data ED3": {
    gate: "extra-action-point-fixed-row-storage",
    fixturePaths: [
      "F:/Realmz/base/Realmz/Scenarios/Tutorial",
      "F:/Realmz/out_win_clang/Scenarios/Araman's Ring"
    ],
    evidence: [
      "docs/generated/action-point-writer-gate.json",
      "src-tauri/src/realmz/action_points.rs:extra_action_point_writer_mutates_only_owned_slot_words"
    ]
  },
  "Data EDCD": {
    gate: "action-parameter-fixed-row-storage",
    fixturePaths: [
      "F:/Realmz/base/Realmz/Scenarios/Tutorial",
      "F:/Realmz/out_win_clang/Scenarios/Araman's Ring"
    ],
    evidence: [
      "docs/generated/action-point-writer-gate.json",
      "src-tauri/src/realmz/action_points.rs:extracode_writer_mutates_only_owned_signed_short",
      "src-tauri/src/realmz/action_points.rs:opcode_92_secondary_extracode_row_is_independently_owned"
    ]
  },
  "Data Custom 1 BD": {
    gate: "custom-landlook-metadata-and-atlas",
    fixturePaths: [
      "F:/Realmz/out_win_clang/Scenarios/Kalypso's Island"
    ],
    evidence: [
      "src-tauri/tests/fixture_roundtrip.rs:custom_landlook_metadata_writer_mutates_only_owned_fields",
      "src-tauri/tests/fixture_roundtrip.rs:custom_landlook_atlas_replacement_changes_only_target_pict_resource"
    ]
  },
  "Data Custom 2 BD": {
    gate: "custom-landlook-metadata",
    fixturePaths: [
      "F:/Realmz/out_win_clang/Scenarios/Kalypso's Island"
    ],
    evidence: [
      "src-tauri/tests/fixture_roundtrip.rs:custom_landlook_metadata_writer_mutates_only_owned_fields"
    ]
  },
  "Data Custom 3 BD": {
    gate: "custom-landlook-metadata",
    fixturePaths: [
      "F:/Realmz/out_win_clang/Scenarios/Kalypso's Island"
    ],
    evidence: [
      "src-tauri/tests/fixture_roundtrip.rs:custom_landlook_metadata_writer_mutates_only_owned_fields"
    ]
  },
  "Data Solids": {
    gate: "special-negative-solidity-table",
    fixturePaths: [
      "F:/Realmz/base/Realmz/Scenarios/Tutorial",
      "F:/Realmz/out_win_clang/Scenarios/Araman's Ring"
    ],
    evidence: [
      "src-tauri/src/realmz/landlooks/tile_solids.rs:data_solids_round_trip_from_tile_attributes",
      "src-tauri/src/realmz/landlooks/tile_solids.rs:data_solids_mutates_only_selected_special_tile_solidity",
      "src-tauri/src/realmz/landlooks/tile_solids.rs:write_tile_solids",
      "src-tauri/src/realmz/landlooks/tile_solids.rs:parse_tile_attributes",
      "docs/format-evidence-cards/map-tile-runtime-anchors.md",
      "docs/format-evidence-cards/map-tile-intelligence.md"
    ]
  },
  "Data Spell": {
    gate: "custom-spell-records-and-names",
    fixturePaths: [
      "F:/Realmz/out_win_clang/Scenarios/Begining of the End",
      "F:/Realmz/base/Realmz/Scenarios/Tutorial"
    ],
    evidence: [
      "src-tauri/tests/fixture_roundtrip.rs:rules_spell_export_mutates_only_owned_record_byte_and_preserves_tail",
      "src-tauri/tests/fixture_roundtrip.rs:rules_custom_spell_name_export_updates_only_spell_str_resource",
      "src-tauri/src/realmz/rules.rs:rules_overrides_round_trip_source_backed_fields",
      "src-tauri/src/exporter.rs:imported_spell_export_bounds_legacy_rows_and_tail_to_annex",
      "scripts/run_authoritative_scenario_proof.mjs"
    ]
  },
  "Data Race": {
    gate: "race-override-records",
    fixturePaths: [
      "F:/Realmz/out_win_clang/Scenarios/Araman's Ring"
    ],
    evidence: [
      "src-tauri/tests/fixture_roundtrip.rs:rules_race_export_mutates_only_owned_record_fields",
      "src-tauri/src/realmz/rules.rs:rules_overrides_round_trip_source_backed_fields",
      "src-tauri/src/exporter.rs:imported_rule_exports_preserve_aligned_rows_and_malformed_tails",
      "scripts/run_authoritative_scenario_proof.mjs"
    ]
  },
  "Data Caste": {
    gate: "caste-override-records",
    fixturePaths: [
      "F:/Realmz/out_win_clang/Scenarios/Araman's Ring"
    ],
    evidence: [
      "src-tauri/tests/fixture_roundtrip.rs:rules_caste_export_mutates_only_owned_record_fields",
      "src-tauri/src/realmz/rules.rs:rules_overrides_round_trip_source_backed_fields",
      "src-tauri/src/exporter.rs:imported_rule_exports_preserve_aligned_rows_and_malformed_tails",
      "scripts/run_authoritative_scenario_proof.mjs"
    ]
  },
  "Data DL": {
    gate: "dungeon-primitive-bitfields",
    fixturePaths: [],
    evidence: [
      "docs/generated/dungeon-primitive-writer-gate.json",
      "src-tauri/src/dungeon.rs"
    ],
    partialOnly: true
  }
};

const CORE_FIXED_RECORD_GATE_CONTAINERS = [
  "Data SD2",
  "Data OD",
  "Data DES",
  "Data TD",
  "Data BD",
  "Data TD3",
  "Data CI",
  "Data RI",
  "Global"
];

const CORE_FIXED_RECORD_GATE_CONTAINER_SET = new Set(CORE_FIXED_RECORD_GATE_CONTAINERS);

const MAPS_STORAGE_GATE_CONTAINERS = [
  "Data LD",
  "Layout",
  "Data DD",
  "Data DDD",
  "Data RD",
  "Data RDD"
];

const MAPS_STORAGE_GATE_CONTAINER_SET = new Set(MAPS_STORAGE_GATE_CONTAINERS);

const MAPS_STORAGE_FIXTURE_PATHS = [
  "F:/Realmz/base/Realmz/Scenarios/Tutorial",
  "F:/Realmz/out_win_clang/Scenarios/Araman's Ring"
];

const ENCOUNTER_SHOP_GATE_CONTAINERS = [
  "Data ED",
  "Data ED2",
  "Data SD",
  "Data TD2"
];

const ENCOUNTER_SHOP_GATE_CONTAINER_SET = new Set(ENCOUNTER_SHOP_GATE_CONTAINERS);

const ENCOUNTER_SHOP_FIXTURE_PATHS = [
  "F:/Realmz/base/Realmz/Scenarios/Tutorial",
  "F:/Realmz/out_win_clang/Scenarios/Araman's Ring"
];

const CORE_RECORD_GATE_CONTAINERS = [
  "Data MD",
  "Data MD1",
  "Data MD-1",
  "Data MD2",
  "Data NI"
];

const CORE_RECORD_GATE_CONTAINER_SET = new Set(CORE_RECORD_GATE_CONTAINERS);

const CORE_RECORD_FIXTURE_PATHS = [
  "F:/Realmz/base/Realmz/Scenarios/Tutorial",
  "F:/Realmz/out_win_clang/Scenarios/Araman's Ring"
];

const CORE_FIXED_RECORD_GATE_EXCLUDED_FAMILIES = [
  "Scenario",
  SCENARIO_STARTUP_SHELL_CONTAINER,
  "Data CS",
  "Data LD",
  "Data DL",
  "Layout",
  "Data MD2",
  "Data RD",
  "Data RDD",
  "Data ED",
  "Data ED2",
  "Data TD2",
  "Data MD",
  "Data MD1",
  "Data MD-1",
  "Data SD",
  "Data MENU"
];

const CORE_FIXED_RECORD_FIXTURE_PATHS = [
  "F:/Realmz/base/Realmz/Scenarios/City of Bywater",
  "F:/Realmz/base/Realmz/Scenarios/Prelude to Pestilence",
  "F:/Realmz/base/Realmz/Scenarios/War in the Sword Lands",
  "F:/Realmz/base/Realmz/Scenarios/Mithril Vault",
  "F:/Realmz/base/Realmz/Scenarios/Wrath of the Mind Lords",
  "F:/Realmz/base/Realmz/Scenarios/Tutorial"
];

const FIXED_RECORD_COMMON_EVIDENCE = [
  "src-tauri/tests/fixture_roundtrip.rs:imports_core_fixture_scenarios",
  "src-tauri/tests/fixture_roundtrip.rs:exports_hardened_fixtures_byte_identically_without_edits"
];

const TARGET_RECORD_WRITER_EVIDENCE = [
  "src-tauri/src/realmz.rs:target_records_round_trip_full_records",
  "src-tauri/src/realmz.rs:authored_target_records_write_realmz_offsets"
];

const MESSAGE_FIXED_RECORD_WRITER_EVIDENCE = [
  "src-tauri/src/realmz/messages.rs:fresh_message_compiles_complete_semantic_row",
  "src-tauri/src/realmz/messages.rs:imported_message_compiles_without_record_byte_identity",
  "src-tauri/src/exporter.rs:imported_message_export_reads_legacy_bytes_only_from_annex",
  "src-tauri/src/realmz/messages.rs:write_messages",
  "src-tauri/src/realmz/messages.rs:parse_messages",
  "src-tauri/src/realmz.rs:authored_target_records_write_realmz_offsets"
];

const OPTION_LABEL_FIXED_RECORD_WRITER_EVIDENCE = [
  "src-tauri/src/realmz/option_labels.rs:fresh_option_label_compiles_complete_semantic_row",
  "src-tauri/src/realmz/option_labels.rs:imported_option_label_compiles_without_record_byte_identity",
  "src-tauri/src/exporter.rs:imported_option_label_export_reads_legacy_bytes_only_from_annex",
  "src-tauri/src/realmz/option_labels.rs:write_option_labels",
  "src-tauri/src/realmz/option_labels.rs:parse_option_labels",
  "src-tauri/src/realmz.rs:authored_target_records_write_realmz_offsets"
];

const BATTLE_FIXED_RECORD_WRITER_EVIDENCE = [
  "src-tauri/src/realmz/battles.rs:fresh_battle_compiles_complete_semantic_row",
  "src-tauri/src/realmz/battles.rs:imported_battle_compiles_without_record_byte_identity",
  "src-tauri/src/exporter.rs:imported_battle_export_reads_legacy_bytes_only_from_annex",
  "src-tauri/src/realmz/battles.rs:write_battles",
  "src-tauri/src/realmz/battles.rs:parse_battles",
  "src-tauri/src/realmz.rs:authored_target_records_write_realmz_offsets"
];

const MAPS_STORAGE_WRITER_GATE_SPECS = [
  {
    container: "Data LD",
    gate: "land-field-grid-writer",
    rowKind: "90x90 outdoor land tile map",
    semanticExposure: "map-canvas-land-tiles",
    ownedFields: [
      { field: "Land tile cells", internal: "tiles[90][90]", offset: 0, bytes: 16200, type: "i16be[8100]" }
    ],
    evidence: [
      "src-tauri/src/realmz/maps.rs:map_storage_land_tiles_mutate_only_owned_cell",
      "src-tauri/src/realmz/maps.rs:write_fields",
      "src-tauri/src/realmz/maps.rs:parse_fields",
      "docs/generated/map-field-value-evidence.json",
      "docs/format-evidence-cards/map-tile-runtime-anchors.md"
    ],
    preservationPolicy: "Outdoor map storage is a dense 90x90 signed-short tile grid. Writers may mutate individual tile cells and must preserve unrelated cells."
  },
  {
    container: "Layout",
    gate: "land-layout-grid-writer",
    rowKind: "8x16 outdoor adjacency grid plus optional annex-owned tail",
    semanticExposure: "land-layout-workbench",
    partialOnly: true,
    ownedFields: [
      { field: "Land adjacency cells", internal: "layout[8][16]", offset: 0, bytes: 256, type: "i16be[128]" }
    ],
    preservedRanges: [
      { field: "Optional compatibility tail", internal: "compatibility annex", offset: 256, bytes: 256, type: "annex-preserved-when-present" }
    ],
    evidence: [
      "src-tauri/src/realmz/maps/land_layout.rs:compiles_exact_semantic_grid_without_embedded_compatibility_bytes",
      "src-tauri/src/realmz/maps/land_layout.rs:write_land_layout",
      "src-tauri/src/realmz/maps/land_layout.rs:parse_land_layout",
      "src-tauri/src/exporter.rs:land_layout_compatibility_tail_comes_only_from_annex",
      "scripts/check_browser_desktop_scenario_parity.mjs",
      "docs/generated/map-field-value-evidence.json",
      "docs/format-evidence-cards/map-tile-runtime-anchors.md"
    ],
    preservationPolicy: "Both writers compile the first 256 bytes as the complete Realmz 8x16 layout grid without consulting embedded trailingBytes. Imported bytes after offset 255 remain preserve-only and are restored exclusively from the compatibility annex."
  },
  {
    container: "Data DD",
    gate: "land-trigger-table-writer",
    rowKind: "100 land Action Point trigger rows per level",
    semanticExposure: "land-action-point-triggers",
    ownedFields: [
      { field: "Trigger coordinate/metadata", internal: "doorid/landid/x/y/percent", offset: 0, bytes: 8, type: "mixed" },
      { field: "Action codes", internal: "code[8]", offset: 8, bytes: 16, type: "i16be[8]" },
      { field: "Action IDs", internal: "id[8]", offset: 24, bytes: 16, type: "i16be[8]" }
    ],
    evidence: [
      "src-tauri/src/realmz/action_points.rs:map_storage_trigger_tables_mutate_only_owned_action_slot",
      "src-tauri/src/realmz/action_points.rs:write_door_file",
      "src-tauri/src/realmz/action_points.rs:parse_door_file",
      "docs/generated/extra-ap-reachability-source-map.json",
      "docs/format-evidence-cards/action-point-extra-ap-storage-reachability.md"
    ],
    preservationPolicy: "Land trigger rows use the same 40-byte action-row writer as Action Points; fixture proof mutates one action slot and preserves unrelated row bytes."
  },
  {
    container: "Data DDD",
    gate: "dungeon-trigger-table-writer",
    rowKind: "100 dungeon Action Point trigger rows per level",
    semanticExposure: "dungeon-action-point-triggers",
    ownedFields: [
      { field: "Trigger coordinate/metadata", internal: "doorid/landid/x/y/percent", offset: 0, bytes: 8, type: "mixed" },
      { field: "Action codes", internal: "code[8]", offset: 8, bytes: 16, type: "i16be[8]" },
      { field: "Action IDs", internal: "id[8]", offset: 24, bytes: 16, type: "i16be[8]" }
    ],
    evidence: [
      "src-tauri/src/realmz/action_points.rs:map_storage_trigger_tables_mutate_only_owned_action_slot",
      "src-tauri/src/realmz/action_points.rs:write_door_file",
      "src-tauri/src/realmz/action_points.rs:parse_door_file",
      "docs/generated/extra-ap-reachability-source-map.json",
      "docs/format-evidence-cards/action-point-extra-ap-storage-reachability.md"
    ],
    preservationPolicy: "Dungeon trigger rows use the same 40-byte action-row writer as land triggers; fixture proof mutates one action slot and preserves unrelated row bytes."
  },
  {
    container: "Data RD",
    gate: "land-random-level-semantic-writer",
    rowKind: "644-byte land random encounter level",
    semanticExposure: "land-random-encounter-storage",
    ownedFields: [
      { field: "Random encounter settings and rectangles", internal: "RandomLevel + RandomRect[20]", offset: 0, bytes: 643, type: "structured" }
    ],
    preservedRanges: [
      { field: "Final compatibility byte", internal: "compatibility annex", offset: 643, bytes: 1, type: "annex-preserved-when-present" }
    ],
    evidence: [
      "src-tauri/src/exporter.rs:random_level_annex_preserves_unchanged_compatibility_and_honors_deletion",
      "src-tauri/src/realmz/random_levels.rs:write_random_levels",
      "src-tauri/src/realmz/random_levels.rs:parse_random_levels",
      "docs/generated/corpus-field-usage.json",
      "docs/format-evidence-cards/encounter-record-runtime-anchors.md"
    ],
    preservationPolicy: "Fresh random levels compile bytes 0..642 from semantic settings and rectangles with deterministic zero at byte 643. Imported output restores byte 643, equivalent noncanonical Boolean encodings, hidden storage in still-inactive rectangle slots, and malformed tails only from the compatibility annex. Deleting an active imported rectangle compiles its complete slot to zero."
  },
  {
    container: "Data RDD",
    gate: "dungeon-random-level-semantic-writer",
    rowKind: "644-byte dungeon random encounter level",
    semanticExposure: "dungeon-random-encounter-storage",
    ownedFields: [
      { field: "Random encounter settings and rectangles", internal: "RandomLevel + RandomRect[20]", offset: 0, bytes: 643, type: "structured" }
    ],
    preservedRanges: [
      { field: "Final compatibility byte", internal: "compatibility annex", offset: 643, bytes: 1, type: "annex-preserved-when-present" }
    ],
    evidence: [
      "src-tauri/src/exporter.rs:random_level_annex_preserves_unchanged_compatibility_and_honors_deletion",
      "src-tauri/src/realmz/random_levels.rs:write_random_levels",
      "src-tauri/src/realmz/random_levels.rs:parse_random_levels",
      "docs/generated/corpus-field-usage.json",
      "docs/format-evidence-cards/encounter-record-runtime-anchors.md"
    ],
    preservationPolicy: "Fresh dungeon random levels compile bytes 0..642 from semantic settings and rectangles with deterministic zero at byte 643. Imported output restores byte 643, equivalent noncanonical Boolean encodings, hidden storage in still-inactive rectangle slots, and malformed tails only from the compatibility annex. Deleting an active imported rectangle compiles its complete slot to zero."
  }
];

const ENCOUNTER_SHOP_WRITER_GATE_SPECS = [
  {
    container: "Data ED",
    gate: "simple-encounter-record-writer",
    rowKind: "426-byte simple encounter record",
    semanticExposure: "simple-encounter-storage",
    ownedFields: [
      { field: "Encounter action codes", internal: "code[32]", offset: 0, bytes: 32, type: "i8[32]" },
      { field: "Encounter action IDs", internal: "id[32]", offset: 32, bytes: 64, type: "i16be[32]" },
      { field: "Choice results", internal: "choiceResults[4]", offset: 96, bytes: 4, type: "u8[4]" },
      { field: "Back-out and result flags", internal: "canBackOut/maxTimes/casteSuccess", offset: 100, bytes: 3, type: "u8/i8" },
      { field: "Alignment padding", internal: "padding", offset: 103, bytes: 1, type: "deterministic zero" },
      { field: "Prompt string", internal: "prompt", offset: 104, bytes: 2, type: "i16be" },
      { field: "Inline encounter text", internal: "texts[4]", offset: 106, bytes: 320, type: "Pascal[4]" }
    ],
    preservedRanges: [],
    evidence: [
      "src-tauri/src/realmz/encounters.rs:fresh_simple_encounter_compiles_complete_semantic_row",
      "src-tauri/src/realmz/encounters.rs:imported_simple_encounter_compiles_without_record_byte_identity",
      "src-tauri/src/exporter.rs:imported_simple_encounter_export_reads_legacy_bytes_only_from_annex",
      "src-tauri/src/realmz/encounters.rs:write_simple_encounters",
      "src-tauri/src/realmz/encounters.rs:parse_simple_encounter_records",
      "scripts/run_authoritative_scenario_proof.mjs:assertOwnershipSimpleEncounter",
      "docs/generated/encounter-record-evidence.json",
      "docs/format-evidence-cards/encounter-record-runtime-anchors.md"
    ],
    preservationPolicy: "Fresh and authored simple encounters compile all 426 bytes from canonical semantics, including deterministic zero alignment padding, without rawBytes. Unchanged imported rows and malformed file tails are preserved only from the compatibility annex at export."
  },
  {
    container: "Data ED2",
    gate: "complex-encounter-record-writer",
    rowKind: "520-byte complex encounter record",
    semanticExposure: "complex-encounter-storage",
    ownedFields: [
      { field: "Encounter action codes", internal: "code[32]", offset: 0, bytes: 32, type: "i8[32]" },
      { field: "Encounter action IDs", internal: "id[32]", offset: 32, bytes: 64, type: "i16be[32]" },
      { field: "Action result", internal: "actionResult", offset: 96, bytes: 1, type: "i8" },
      { field: "Word result", internal: "wordResult", offset: 97, bytes: 1, type: "i8" },
      { field: "Required-action flags", internal: "groups[8]", offset: 98, bytes: 8, type: "i8[8]" },
      { field: "Spell IDs", internal: "spellIds[10]", offset: 106, bytes: 20, type: "i16be[10]" },
      { field: "Spell results", internal: "spellResults[10]", offset: 126, bytes: 10, type: "i8[10]" },
      { field: "Item IDs", internal: "itemIds[5]", offset: 136, bytes: 10, type: "i16be[5]" },
      { field: "Item results", internal: "itemResults[5]", offset: 146, bytes: 5, type: "i8[5]" },
      { field: "Back-out, thief, and outcome fields", internal: "canBackOut/thief/maxTimes/casteSuccess/thiefSuccess/thiefFail", offset: 151, bytes: 6, type: "u8/i8" },
      { field: "Alignment padding", internal: "padding", offset: 157, bytes: 1, type: "deterministic zero" },
      { field: "Prompt string", internal: "prompt", offset: 158, bytes: 2, type: "i16be" },
      { field: "Inline encounter text", internal: "texts[9]", offset: 160, bytes: 360, type: "Pascal[9]" }
    ],
    preservedRanges: [],
    evidence: [
      "src-tauri/src/realmz/encounters.rs:fresh_complex_encounter_compiles_complete_semantic_row",
      "src-tauri/src/realmz/encounters.rs:imported_complex_encounter_compiles_without_record_byte_identity",
      "src-tauri/src/exporter.rs:imported_complex_encounter_export_reads_legacy_bytes_only_from_annex",
      "src-tauri/src/realmz/encounters.rs:write_complex_encounters",
      "src-tauri/src/realmz/encounters.rs:parse_complex_encounter_records",
      "scripts/run_authoritative_scenario_proof.mjs:assertOwnershipComplexEncounter",
      "docs/generated/encounter-record-evidence.json",
      "docs/format-evidence-cards/encounter-record-runtime-anchors.md"
    ],
    preservationPolicy: "Fresh and authored complex encounters compile all 520 bytes from canonical semantics, including deterministic zero alignment padding, without rawBytes. Unchanged imported rows and malformed file tails are preserved only from the compatibility annex at export."
  },
  {
    container: "Data SD",
    gate: "shop-record-writer",
    rowKind: "3002-byte shop record",
    semanticExposure: "shop-storage",
    ownedFields: [
      { field: "Shop item IDs", internal: "itemIds[1000]", offset: 0, bytes: 2000, type: "i16be[1000]" },
      { field: "Shop quantities", internal: "quantities[1000]", offset: 2000, bytes: 1000, type: "u8[1000]" },
      { field: "Inflation", internal: "inflation", offset: 3000, bytes: 2, type: "i16be" }
    ],
    evidence: [
      "src-tauri/src/realmz/shops.rs:fresh_shop_compiles_all_semantic_fields",
      "src-tauri/src/realmz/shops.rs:imported_shop_recompiles_without_record_byte_identity",
      "src-tauri/src/realmz/shops.rs:shop_storage_mutates_only_owned_fields",
      "src-tauri/src/project.rs:shop_normalization_backfills_legacy_inventory_slots",
      "src-tauri/src/exporter.rs:inserts_added_shop_before_preserved_source_suffix",
      "src-tauri/src/realmz/shops.rs:write_shops",
      "src-tauri/src/realmz/shops.rs:parse_shops",
      "docs/format-evidence-cards/item-treasure-shop-runtime-anchors.md"
    ],
    preservationPolicy: "Fresh shop records compile all 3,002 bytes from one thousand item IDs, one thousand quantity bytes, and inflation without rawBytes. Imported rows recompile from decoded semantics; dense foreign suffix records and malformed file tails are appended only from the compatibility annex."
  },
  {
    container: "Data TD2",
    gate: "thief-encounter-record-writer",
    rowKind: "118-byte thief encounter record",
    semanticExposure: "thief-encounter-storage",
    ownedFields: [
      { field: "Thief encounter flags and modifiers", internal: "typeFlags/modifiers/resultCodes", offset: 0, bytes: 34, type: "u8/i8" },
      { field: "Success and failure text links", internal: "successText/failureText", offset: 34, bytes: 32, type: "i16be[16]" },
      { field: "Success and failure sound links", internal: "successSounds/failureSounds", offset: 66, bytes: 32, type: "i16be[16]" },
      { field: "Spell, damage, and tumblers", internal: "spell/lowDamage/highDamage/tumblers", offset: 98, bytes: 8, type: "i16be[4]" },
      { field: "Prompt strings and sounds", internal: "prompts/promptSounds", offset: 106, bytes: 12, type: "i16be[6]" }
    ],
    evidence: [
      "src-tauri/src/realmz/encounters.rs:fresh_thief_encounter_compiles_complete_semantic_row",
      "src-tauri/src/realmz/encounters.rs:imported_thief_encounter_compiles_without_record_byte_identity",
      "src-tauri/src/exporter.rs:imported_thief_encounter_export_reads_legacy_bytes_only_from_annex",
      "src-tauri/src/realmz/encounters.rs:write_thief_encounters",
      "src-tauri/src/realmz/encounters.rs:parse_thief_encounters",
      "scripts/run_authoritative_scenario_proof.mjs",
      "docs/format-evidence-cards/thief-timed-encounter-runtime-anchors.md"
    ],
    preservationPolicy: "Fresh thief encounter records compile all 118 bytes from canonical flags, modifiers, result codes, message and sound links, trap fields, lock fields, and prompt support fields without rawBytes. Unchanged imported rows and malformed file tails are restored only from the compatibility annex."
  }
];

const CORE_RECORD_WRITER_GATE_SPECS = [
  {
    container: "Data MD",
    gate: "monster-template-record-writer",
    rowKind: "210-byte monster template record",
    semanticExposure: "monster-template-storage",
    ownedFields: [
      { field: "Monster template fields", internal: "struct monster", offset: 0, bytes: 210, type: "mixed fixed record" }
    ],
    evidence: [
      "src-tauri/src/realmz/combat.rs:monster_writer_compiles_every_semantic_field_without_raw_identity",
      "src-tauri/src/exporter.rs:imported_monster_export_bounds_legacy_rows_and_tails_to_annex",
      "src-tauri/src/realmz/combat.rs:write_monsters",
      "src-tauri/src/realmz/combat.rs:parse_monsters",
      "src/editor/browser/binaryWriters.test.ts:browser monster writers",
      "scripts/run_authoritative_scenario_proof.mjs",
      "docs/generated/monster-record-evidence.json",
      "docs/format-evidence-cards/monster-record-runtime-anchors.md"
    ],
    preservationPolicy: "Fresh and authored main monster templates compile all 210 bytes from canonical semantic fields without rawBytes. Unchanged imported rows and malformed file tails are restored only from the compatibility annex."
  },
  {
    container: "Data MD1",
    gate: "alternate-monster-template-record-writer",
    rowKind: "210-byte alternate monster template record",
    semanticExposure: "alternate-monster-template-storage",
    ownedFields: [
      { field: "Alternate monster template fields", internal: "struct monster", offset: 0, bytes: 210, type: "mixed fixed record" }
    ],
    evidence: [
      "src-tauri/src/realmz/combat.rs:alternate_monster_sets_keep_source_provenance_and_compile_semantics",
      "src-tauri/src/exporter.rs:imported_monster_export_bounds_legacy_rows_and_tails_to_annex",
      "src-tauri/src/realmz/combat.rs:write_monster_set",
      "src-tauri/src/realmz/combat.rs:parse_monster_set",
      "src/editor/browser/binaryWriters.test.ts:browser monster writers",
      "docs/generated/monster-record-evidence.json",
      "docs/format-evidence-cards/monster-record-runtime-anchors.md"
    ],
    preservationPolicy: "Native alternate monster templates reuse the complete semantic 210-byte writer while preserving source filename and set identity. Unchanged imported rows and malformed file tails are restored only from the compatibility annex."
  },
  {
    container: "Data MD-1",
    gate: "alternate-monster-template-record-writer",
    rowKind: "210-byte alternate monster template record",
    semanticExposure: "alternate-monster-template-storage",
    ownedFields: [
      { field: "Alternate monster template fields", internal: "struct monster", offset: 0, bytes: 210, type: "mixed fixed record" }
    ],
    evidence: [
      "src-tauri/src/realmz/combat.rs:alternate_monster_sets_keep_source_provenance_and_compile_semantics",
      "src-tauri/src/exporter.rs:imported_monster_export_bounds_legacy_rows_and_tails_to_annex",
      "src-tauri/src/realmz/combat.rs:write_monster_set",
      "src-tauri/src/realmz/combat.rs:parse_monster_set",
      "src/editor/browser/binaryWriters.test.ts:browser monster writers",
      "docs/generated/monster-record-evidence.json",
      "docs/format-evidence-cards/monster-record-runtime-anchors.md"
    ],
    preservationPolicy: "Native alternate monster templates reuse the complete semantic 210-byte writer while preserving source filename and set identity. Unchanged imported rows and malformed file tails are restored only from the compatibility annex."
  },
  {
    container: "Data MD2",
    gate: "map-record-writer",
    rowKind: "340-byte map record",
    semanticExposure: "map-record-storage",
    partialOnly: true,
    ownedFields: [
      { field: "Map marker triples", internal: "icon[10][3]", offset: 0, bytes: 60, type: "i16be[30]" },
      { field: "Map start and display fields", internal: "startX/startY/level/pictId/iconSize/show/isDungeon", offset: 60, bytes: 14, type: "i16be[7]" },
      { field: "Map clip rectangle", internal: "rect", offset: 76, bytes: 8, type: "i16be[4]" },
      { field: "Map note text", internal: "note", offset: 84, bytes: 256, type: "Pascal" }
    ],
    preservedRanges: [
      { field: "Compatibility bytes", internal: "raw[74..76]", offset: 74, bytes: 2, type: "raw-preserved" }
    ],
    evidence: [
      "src-tauri/src/realmz/maps.rs:fresh_map_record_compiles_from_semantic_fields",
      "src-tauri/src/realmz/maps.rs:imported_map_record_preserves_compatible_encodings_until_semantics_change",
      "src-tauri/src/realmz/maps.rs:map_record_storage_mutates_only_modeled_fields_and_preserves_prefix",
      "src-tauri/src/realmz/maps.rs:map_record_marker_storage_mutates_only_selected_marker_words",
      "src-tauri/src/project.rs:map_record_normalization_backfills_legacy_raw_markers",
      "src-tauri/src/realmz/maps.rs:write_map_records",
      "src-tauri/src/realmz/maps.rs:parse_map_records",
      "docs/generated/map-record-evidence.json",
      "docs/format-evidence-cards/map-record-runtime-anchors.md"
    ],
    preservationPolicy: "Fresh map records compile all modeled marker, display/start/rectangle, and note fields from semantic data without rawBytes. Imported rawBytes may retain bytes 74..76, a compatible noncanonical true word, and unchanged Pascal-note tail bytes; semantic edits take precedence."
  },
  {
    container: "Data NI",
    gate: "scenario-item-record-writer",
    rowKind: "100-byte scenario item record",
    semanticExposure: "scenario-item-storage",
    ownedFields: [
      { field: "Scenario item core fields", internal: "stats/itemId/icon/type/restrictions/categories", offset: 0, bytes: 56, type: "i16be/i32be" },
      { field: "Scenario item spare words", internal: "spare2[7]", offset: 56, bytes: 14, type: "i16be[7]" },
      { field: "Scenario item effects and specials", internal: "damage/elements/specials/weightPerCharge/dropOnEmpty", offset: 70, bytes: 30, type: "i16be[15]" }
    ],
    preservedRanges: [],
    evidence: [
      "src-tauri/src/realmz/scenario_items.rs:fresh_scenario_item_compiles_all_semantic_fields",
      "src-tauri/src/realmz/scenario_items.rs:imported_scenario_item_preserves_zero_id_alias_until_semantics_change",
      "src-tauri/src/realmz/scenario_items.rs:scenario_item_storage_mutates_only_semantic_fields",
      "src-tauri/src/project.rs:scenario_item_normalization_backfills_legacy_spare_words",
      "src-tauri/src/realmz/scenario_items.rs:write_scenario_items",
      "src-tauri/src/realmz/scenario_items.rs:parse_scenario_items",
      "docs/generated/core-rules-record-evidence.json",
      "docs/format-evidence-cards/core-rules-record-runtime-anchors.md"
    ],
    preservationPolicy: "Fresh scenario items compile all 100 bytes from semantic fields, including itemattr.spare2[7], without rawBytes. Imported rawBytes can preserve only an unchanged zero stored item ID that semantically aliases row ID 800+id; semantic edits take precedence."
  }
];

const FIXED_RECORD_WRITER_GATE_SPECS = [
  {
    container: "Data SD2",
    gate: "message-fixed-record-writer",
    rowKind: "Str255 message record",
    semanticExposure: "strings-workbench",
    ownedFields: [
      { field: "Message row", internal: "text", offset: 0, bytes: 256, type: "Str255 + deterministic zero fill" }
    ],
    evidence: [
      ...MESSAGE_FIXED_RECORD_WRITER_EVIDENCE,
      ...FIXED_RECORD_COMMON_EVIDENCE,
      "docs/format-evidence-cards/text-message-runtime-anchors.md",
      "docs/format-evidence-cards/strings-data-od-string-sound.md"
    ],
    preservationPolicy: "Fresh and authored messages compile the complete 256-byte row from canonical text without rawBytes. Unchanged imported rows and malformed file tails are preserved only from the compatibility annex at export."
  },
  {
    container: "Data OD",
    gate: "option-label-fixed-record-writer",
    rowKind: "25-byte Pascal option label record",
    semanticExposure: "strings-workbench-option-labels",
    ownedFields: [
      { field: "Option-label row", internal: "text", offset: 0, bytes: 25, type: "Str24 + deterministic zero fill" }
    ],
    evidence: [
      ...OPTION_LABEL_FIXED_RECORD_WRITER_EVIDENCE,
      ...FIXED_RECORD_COMMON_EVIDENCE,
      "docs/generated/string-sound-audit.json",
      "docs/format-evidence-cards/strings-data-od-string-sound.md"
    ],
    preservationPolicy: "Fresh and authored option labels compile the complete 25-byte row from canonical text without rawBytes. Unchanged imported rows and malformed file tails are preserved only from the compatibility annex at export. The blocked Strings Sound affordance is not part of this writer gate."
  },
  {
    container: "Data DES",
    gate: "monster-description-fixed-record-writer",
    rowKind: "Str255 monster description record",
    semanticExposure: "description-text-records",
    ownedFields: [
      { field: "Monster description text", internal: "text", offset: 0, bytes: 256, type: "Str255 + deterministic zero fill" }
    ],
    evidence: [
      "src-tauri/src/realmz/combat.rs:monster_description_writer_compiles_pascal_text_without_raw_identity",
      "src-tauri/src/exporter.rs:imported_monster_description_export_bounds_legacy_rows_and_tails_to_annex",
      "src/editor/browser/binaryWriters.test.ts:browser monster writers",
      "scripts/run_authoritative_scenario_proof.mjs",
      ...TARGET_RECORD_WRITER_EVIDENCE,
      ...FIXED_RECORD_COMMON_EVIDENCE,
      "docs/format-evidence-cards/monster-descriptions-and-sets-runtime-anchors.md"
    ],
    preservationPolicy: "Fresh and authored Data DES rows compile complete Str255 records with deterministic zero fill and no rawBytes. Unchanged imported rows and malformed file tails are restored only from the compatibility annex."
  },
  {
    container: "Data TD",
    gate: "treasure-fixed-record-writer",
    rowKind: "48-byte treasure reward record",
    semanticExposure: "treasure-records",
    ownedFields: [
      { field: "Reward item references", internal: "itemid[20]", offset: 0, bytes: 40, type: "i16be[20]" },
      { field: "Experience reward", internal: "exp", offset: 40, bytes: 2, type: "i16be" },
      { field: "Gold reward", internal: "gold", offset: 42, bytes: 2, type: "i16be" },
      { field: "Gem reward", internal: "gems", offset: 44, bytes: 2, type: "i16be" },
      { field: "Jewelry reward", internal: "jewelry", offset: 46, bytes: 2, type: "i16be" }
    ],
    evidence: [
      "src-tauri/src/realmz/economy.rs:fresh_treasure_compiles_all_semantic_fields",
      "src-tauri/src/realmz/economy.rs:imported_treasure_recompiles_without_record_byte_identity",
      "src-tauri/src/realmz/economy.rs:treasure_storage_mutates_only_owned_fields",
      "src-tauri/src/project.rs:treasure_normalization_backfills_legacy_item_slots",
      ...TARGET_RECORD_WRITER_EVIDENCE,
      ...FIXED_RECORD_COMMON_EVIDENCE,
      "docs/generated/item-treasure-shop-evidence.json",
      "docs/format-evidence-cards/item-treasure-shop-runtime-anchors.md"
    ],
    preservationPolicy: "Fresh treasure records compile all 48 bytes from twenty item IDs and four reward words without rawBytes. Imported records recompile from decoded semantics; only malformed file tails remain compatibility-annex data."
  },
  {
    container: "Data BD",
    gate: "battle-fixed-record-writer",
    rowKind: "346-byte battle setup record",
    semanticExposure: "battle-records",
    ownedFields: [
      { field: "Monster placement grid", internal: "battle[13][13]", offset: 0, bytes: 338, type: "i16be[169]" },
      { field: "Initial distance", internal: "dist", offset: 338, bytes: 1, type: "i8" },
      { field: "Alignment padding", internal: "padding", offset: 339, bytes: 1, type: "deterministic zero" },
      { field: "Before-combat message", internal: "messagebefore", offset: 340, bytes: 2, type: "i16be" },
      { field: "After-combat message", internal: "messageafter", offset: 342, bytes: 2, type: "i16be" },
      { field: "Battle macro", internal: "battlemacro", offset: 344, bytes: 2, type: "i16be" }
    ],
    evidence: [
      ...BATTLE_FIXED_RECORD_WRITER_EVIDENCE,
      ...FIXED_RECORD_COMMON_EVIDENCE,
      "docs/generated/battle-record-evidence.json",
      "docs/format-evidence-cards/battle-record-runtime-anchors.md"
    ],
    preservationPolicy: "Fresh and authored battle records compile all 346 bytes from canonical semantics, including deterministic zero alignment padding, without rawBytes. Unchanged imported rows and malformed file tails are preserved only from the compatibility annex. Monster template writers and encounter routing stay outside this batch."
  },
  {
    container: "Data TD3",
    gate: "timed-encounter-fixed-record-writer",
    rowKind: "40-byte timed encounter schedule record",
    semanticExposure: "timed-encounter-records",
    ownedFields: [
      { field: "Day", internal: "day", offset: 0, bytes: 2, type: "i16be" },
      { field: "Increment", internal: "increment", offset: 2, bytes: 2, type: "i16be" },
      { field: "Chance percent", internal: "percent", offset: 4, bytes: 2, type: "i16be" },
      { field: "Macro target", internal: "door", offset: 6, bytes: 2, type: "i16be" },
      { field: "Required level", internal: "required_level", offset: 8, bytes: 2, type: "i16be" },
      { field: "Required random rectangle", internal: "required_random_rect", offset: 10, bytes: 2, type: "i16be" },
      { field: "Required X", internal: "required_x", offset: 12, bytes: 2, type: "i16be" },
      { field: "Required Y", internal: "required_y", offset: 14, bytes: 2, type: "i16be" },
      { field: "Required item", internal: "required_item", offset: 16, bytes: 2, type: "i16be" },
      { field: "Required quest", internal: "required_quest", offset: 18, bytes: 2, type: "i16be" },
      { field: "Location kind", internal: "location_kind", offset: 20, bytes: 2, type: "i16be enum" }
    ],
    preservedRanges: [
      { field: "Unnamed timed compatibility words", internal: "stuff[1..9]", offset: 22, bytes: 18, type: "annex-preserved for imported rows; deterministic zero for fresh rows" }
    ],
    evidence: [
      "src-tauri/src/realmz/encounters.rs:fresh_timed_encounter_compiles_semantic_fields_and_zero_reserved_words",
      "src-tauri/src/realmz/encounters.rs:imported_timed_encounter_compiles_without_record_byte_identity",
      "src-tauri/src/exporter.rs:imported_timed_encounter_export_bounds_reserved_words_to_the_annex",
      "scripts/run_authoritative_scenario_proof.mjs:assertOwnershipTimedEncounter",
      ...TARGET_RECORD_WRITER_EVIDENCE,
      ...FIXED_RECORD_COMMON_EVIDENCE,
      "docs/format-evidence-cards/thief-timed-encounter-runtime-anchors.md"
    ],
    preservationPolicy: "Fresh timed encounters compile schedule, macro, item, quest, and location fields from canonical semantics and emit deterministic zero for the nine unnamed words. Unchanged imported rows remain byte-exact; edited imported rows recompile semantic fields while recovering only offsets 22..39 from the compatibility annex."
  },
  {
    container: "Data CI",
    gate: "contact-info-fixed-record-writer",
    rowKind: "eighteen Str255 contact/release fields",
    semanticExposure: "scenario-contact-info",
    ownedFields: [
      { field: "Scenario/contact/release strings", internal: "contactdata Str255 fields", offset: 0, bytes: 4608, type: "Str255[18]" }
    ],
    evidence: [
      "src-tauri/src/realmz/scenario.rs:fixed_record_scenario_shell_writers_mutate_only_owned_fields",
      "src-tauri/src/realmz/scenario.rs:scenario_shell_contact_and_restrictions_round_trip",
      "src-tauri/src/exporter.rs:scenario_metadata_legacy_identity_comes_only_from_annex",
      "src/editor/browser/binaryWriters.test.ts:browser scenario metadata writers",
      "scripts/run_authoritative_scenario_proof.mjs:assertOwnershipScenarioMetadata",
      "src-tauri/src/realmz/scenario.rs:write_scenario_contact_info",
      ...FIXED_RECORD_COMMON_EVIDENCE,
      "docs/generated/scenario-shell-evidence.json",
      "docs/format-evidence-cards/scenario-startup-runtime-anchors.md",
      "docs/format-evidence-cards/scenario-shell-startup-release.md"
    ],
    preservationPolicy: "Both native writers compile all eighteen Str255 slots from canonical semantics and deterministic zero padding without consulting embedded raw bytes. An untouched imported singleton and any malformed tail are recovered only from the compatibility annex; marker/main startup shell files stay outside this batch."
  },
  {
    container: "Data RI",
    gate: "party-restrictions-fixed-record-writer",
    rowKind: "320-byte party restriction record",
    semanticExposure: "scenario-party-restrictions",
    ownedFields: [
      { field: "Restriction description", internal: "description", offset: 0, bytes: 256, type: "Str255" },
      { field: "Maximum party characters", internal: "maxpc", offset: 256, bytes: 2, type: "i16be" },
      { field: "Maximum party level", internal: "maxlevel", offset: 258, bytes: 2, type: "i16be" },
      { field: "Banned race flags", internal: "canrace[30]", offset: 260, bytes: 30, type: "u8[30]" },
      { field: "Banned caste flags", internal: "cancaste[30]", offset: 290, bytes: 30, type: "u8[30]" }
    ],
    evidence: [
      "src-tauri/src/realmz/scenario.rs:fixed_record_scenario_shell_writers_mutate_only_owned_fields",
      "src-tauri/src/realmz/scenario.rs:scenario_shell_contact_and_restrictions_round_trip",
      "src-tauri/src/exporter.rs:scenario_metadata_legacy_identity_comes_only_from_annex",
      "src/editor/browser/binaryWriters.test.ts:browser scenario metadata writers",
      "scripts/check_browser_scenario_package.mjs",
      "src-tauri/src/realmz/scenario.rs:write_scenario_restrictions",
      ...FIXED_RECORD_COMMON_EVIDENCE,
      "docs/generated/scenario-party-restrictions-evidence.json",
      "docs/format-evidence-cards/scenario-party-restrictions-runtime-anchors.md"
    ],
    preservationPolicy: "Both native writers compile the complete optional restriction record from canonical semantics and deterministic Boolean flags without consulting embedded raw bytes. An untouched imported singleton and any malformed tail are recovered only from the compatibility annex; marker/main party-level fields stay outside this batch."
  },
  {
    container: "Global",
    gate: "global-macro-fixed-record-writer",
    rowKind: "30 signed-short global macro hook slots",
    semanticExposure: "scenario-global-macro-hooks",
    partialOnly: true,
    ownedFields: [
      { field: "Start-up macro", internal: "globalmacro[0]", offset: 0, bytes: 2, type: "i16be" },
      { field: "New game macro", internal: "globalmacro[1]", offset: 2, bytes: 2, type: "i16be" },
      { field: "Resume game macro", internal: "globalmacro[2]", offset: 4, bytes: 2, type: "i16be" },
      { field: "Day-start macro", internal: "globalmacro[4]", offset: 8, bytes: 2, type: "i16be" },
      { field: "Day-end macro", internal: "globalmacro[5]", offset: 10, bytes: 2, type: "i16be" }
    ],
    preservedRanges: [
      { field: "Reserved global hook slot", internal: "globalmacro[3]", offset: 6, bytes: 2, type: "raw-preserved" },
      { field: "Reserved global hook slots", internal: "globalmacro[6..29]", offset: 12, bytes: 48, type: "raw-preserved" }
    ],
    evidence: [
      "src-tauri/src/realmz/scenario.rs:global_macro_hooks_compile_only_source_backed_slots",
      "src-tauri/src/realmz/scenario.rs:write_global_macro_hooks",
      "src-tauri/src/realmz/scenario.rs:parse_global_macro_hooks",
      ...FIXED_RECORD_COMMON_EVIDENCE,
      "docs/generated/global-macro-evidence.json",
      "docs/format-evidence-cards/global-macro-runtime-anchors.md"
    ],
    preservationPolicy: "Both native writers zero-initialize Global and compile only the five source-backed hooks from canonical semantics without consulting embedded raw bytes. An untouched imported singleton is recovered from the compatibility annex; after an imported record is edited, only reserved slot 3, slots 6..29, and any malformed tail are restored from that annex."
  }
];

const MAX_RESOURCE_TYPES = 512;
const MAX_RESOURCES_PER_TYPE = 20000;
const MAX_RESOURCE_FORK_BYTES_TO_SCAN = 50 * 1024 * 1024;
const APPLE_SINGLE_MAGIC = 0x00051600;
const APPLE_DOUBLE_MAGIC = 0x00051607;
const RESOURCE_FORK_ENTRY_ID = 2;

const roundtripLedger = readJson(roundtripLedgerPath);
const unknownBacklog = readJson(unknownBacklogPath);
const runtimeCaches = readJson(runtimeCachePath);
const resourceByteOwnership = readOptionalJson(resourceByteOwnershipPath);
const dungeonByteOwnership = readOptionalJson(dungeonByteOwnershipPath);
const customLandlookCoverage = readOptionalJson(customLandlookCoveragePath);
const rulesCoverage = readOptionalJson(rulesCoveragePath);
const targetCompatibility = readOptionalJson(targetCompatibilityPath);
const actionPointWriterGate = readOptionalJson(actionPointWriterGatePath);
const rustRegistry = parseRustRegistry(fs.readFileSync(realmzAssemblyRsPath, "utf8"));
const parsedResourceForkNames = new Set(
  (resourceByteOwnership?.forks ?? [])
    .filter((fork) => fork.parseStatus === "parsed")
    .map((fork) => fork.fileName)
);

const scanned = scanScenarioRoots(roundtripLedger.scenarios ?? []);
const aggregate = aggregateFiles(roundtripLedger.scenarios ?? [], scanned);
const fixedRecordWriterGates = buildFixedRecordWriterGates(aggregate);
const scenarioStartupShellGate = buildScenarioStartupShellGate(aggregate);
const mapsStorageWriterGates = buildMapsStorageWriterGates(aggregate);
const encounterShopWriterGates = buildEncounterShopWriterGates(aggregate);
const coreRecordWriterGates = buildCoreRecordWriterGates(aggregate);
const inventory = buildInventory(scanned, aggregate);
const ownership = buildOwnership(aggregate);
const unknownReport = buildUnknownReport(inventory, ownership, unknownBacklog);
const completenessTruth = buildCompletenessTruth(inventory, ownership, unknownReport);
const functionalAuthoringReadiness = buildFunctionalAuthoringReadiness(ownership, completenessTruth);
const uiManifest = buildUiManifest(inventory, ownership, unknownReport, completenessTruth, functionalAuthoringReadiness);
validateInventoryAndOwnership(inventory, ownership, completenessTruth);

const updatedRuntimeCaches = {
  ...runtimeCaches,
  generatedAt: new Date().toISOString(),
  updatedBy: "scripts/generate_scenario_byte_coverage.mjs",
  ignoredNonScenarioFiles: [...NON_SCENARIO_IGNORES].sort(),
  byteCoveragePolicy:
    "Runtime caches are classified separately from authored source. They may be inspected, but normal authoring writes the source files named by each entry."
};

writeJson(fileInventoryPath, inventory);
writeJson(byteOwnershipPath, ownership);
writeJson(unknownReportPath, unknownReport);
writeJson(completenessTruthPath, completenessTruth);
writeJson(fixedRecordWriterGatesPath, fixedRecordWriterGates);
writeJson(scenarioStartupShellGatePath, scenarioStartupShellGate);
writeJson(mapsStorageWriterGatesPath, mapsStorageWriterGates);
writeJson(encounterShopWriterGatesPath, encounterShopWriterGates);
writeJson(coreRecordWriterGatesPath, coreRecordWriterGates);
writeJson(functionalAuthoringReadinessPath, functionalAuthoringReadiness);
writeJson(runtimeCachePath, updatedRuntimeCaches);
writeJson(uiManifestPath, uiManifest);

console.log(`Wrote ${path.relative(repoRoot, fileInventoryPath)}`);
console.log(`Wrote ${path.relative(repoRoot, byteOwnershipPath)}`);
console.log(`Wrote ${path.relative(repoRoot, unknownReportPath)}`);
console.log(`Wrote ${path.relative(repoRoot, completenessTruthPath)}`);
console.log(`Wrote ${path.relative(repoRoot, fixedRecordWriterGatesPath)}`);
console.log(`Wrote ${path.relative(repoRoot, scenarioStartupShellGatePath)}`);
console.log(`Wrote ${path.relative(repoRoot, mapsStorageWriterGatesPath)}`);
console.log(`Wrote ${path.relative(repoRoot, encounterShopWriterGatesPath)}`);
console.log(`Wrote ${path.relative(repoRoot, coreRecordWriterGatesPath)}`);
console.log(`Wrote ${path.relative(repoRoot, functionalAuthoringReadinessPath)}`);
console.log(`Wrote ${path.relative(repoRoot, runtimeCachePath)}`);
console.log(`Wrote ${path.relative(repoRoot, uiManifestPath)}`);
console.log(JSON.stringify(uiManifest.summary, null, 2));

function buildFixedRecordWriterGates(aggregate) {
  validateFixedRecordWriterGateSpecs();
  const aggregateByName = new Map((aggregate.files ?? []).map((file) => [file.name, file]));
  const fixtureChecks = CORE_FIXED_RECORD_FIXTURE_PATHS.map((fixturePath) => ({
    path: fixturePath,
    available: fs.existsSync(fixturePath)
  }));
  const fixturePathsAvailable = fixtureChecks.every((fixture) => fixture.available);
  const gates = FIXED_RECORD_WRITER_GATE_SPECS.map((spec) => {
    const layout = RECORD_LAYOUTS[spec.container];
    const file = aggregateByName.get(spec.container);
    const evidence = [...new Set(spec.evidence ?? [])];
    const evidenceChecks = evidence.map(evidenceStatusFor);
    const missingEvidence = evidenceChecks
      .filter((check) => !check.present)
      .map((check) => check.reference);
    const evidencePresent = missingEvidence.length === 0;
    const observedScenarioCount = file?.scenarioCount ?? 0;
    const available = evidencePresent && fixturePathsAvailable && observedScenarioCount > 0;
    return {
      container: spec.container,
      authorFacingName: layout.label,
      gate: spec.gate,
      recordBytes: layout.recordBytes,
      rowKind: spec.rowKind,
      semanticExposure: spec.semanticExposure,
      writerStatus: available ? "fixture-proven-fixed-record" : "evidence-pending-fixed-record",
      available,
      evidencePresent,
      fixturePathsAvailable,
      observedScenarioCount,
      observedByteSizes: file?.observedByteSizes ?? [],
      fixturePaths: CORE_FIXED_RECORD_FIXTURE_PATHS,
      missingEvidence,
      evidence,
      evidenceChecks,
      ownedFields: spec.ownedFields,
      preservedRanges: spec.preservedRanges ?? [],
      partialOnly: Boolean(spec.partialOnly || (spec.preservedRanges ?? []).length > 0),
      preservationPolicy: spec.preservationPolicy
    };
  });
  const fixtureProvenContainers = gates.filter((gate) => gate.available).length;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/generate_scenario_byte_coverage.mjs",
    target: "core-fixed-record-writer-gate-batch",
    sources: {
      byteCoverage: "docs/generated/scenario-byte-ownership.json",
      fixtureRoundtrip: "src-tauri/tests/fixture_roundtrip.rs",
      fixedRecordWriters: [
        "src-tauri/src/realmz/messages.rs",
        "src-tauri/src/realmz/option_labels.rs",
        "src-tauri/src/realmz/battles.rs",
        "src-tauri/src/realmz/combat.rs",
        "src-tauri/src/realmz/economy.rs",
        "src-tauri/src/realmz/encounters.rs",
        "src-tauri/src/realmz/rules.rs",
        "src-tauri/src/realmz/scenario.rs"
      ]
    },
    policy: {
      note: "This registry gates only the Core Fixed-Record Writer-Gate Batch. Startup shell files and map, encounter, monster-template, and shop families are intentionally excluded.",
      fixtureProvenRequires: [
        "observed container coverage",
        "all hardened fixture paths available",
        "all local evidence references present"
      ],
      excludedFamilies: CORE_FIXED_RECORD_GATE_EXCLUDED_FAMILIES
    },
    summary: {
      containers: gates.length,
      fixtureProvenContainers,
      evidencePendingContainers: gates.length - fixtureProvenContainers,
      writerReadiness:
        fixtureProvenContainers === gates.length
          ? "fixture-proven-fixed-record-storage"
          : "evidence-pending-fixed-record-storage",
      fixturePathsAvailable,
      missingFixturePaths: fixtureChecks.filter((fixture) => !fixture.available).map((fixture) => fixture.path),
      missingEvidenceReferences: gates.reduce((total, gate) => total + gate.missingEvidence.length, 0)
    },
    gates
  };
}

function buildScenarioStartupShellGate(aggregate) {
  const aggregateByName = new Map((aggregate.files ?? []).map((file) => [file.name, file]));
  const file = aggregateByName.get(SCENARIO_STARTUP_SHELL_CONTAINER);
  const evidence = [
    "src-tauri/src/realmz/scenario.rs:scenario_startup_shell_writer_compiles_only_the_semantic_core",
    "src-tauri/src/realmz/scenario.rs:scenario_shell_contact_and_restrictions_round_trip",
    "docs/generated/scenario-shell-evidence.json",
    "docs/format-evidence-cards/scenario-startup-runtime-anchors.md",
    "docs/format-evidence-cards/scenario-shell-startup-release.md"
  ];
  const evidenceChecks = evidence.map(evidenceStatusFor);
  const missingEvidence = evidenceChecks
    .filter((check) => !check.present)
    .map((check) => check.reference);
  const evidencePresent = missingEvidence.length === 0;
  const observedScenarioCount = file?.scenarioCount ?? 0;
  const available = evidencePresent && observedScenarioCount > 0;
  const writerStatus = available
    ? "fixture-proven-authoritative-startup-shell-core"
    : "evidence-pending-authoritative-startup-shell-core";
  const sourceFileNames = file?.sourceFileNames ?? [];
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/generate_scenario_byte_coverage.mjs",
    target: "scenario-startup-shell-normalization",
    sources: {
      byteCoverage: "docs/generated/scenario-byte-ownership.json",
      scenarioShellEvidence: "docs/generated/scenario-shell-evidence.json",
      shellCodec: "src-tauri/src/realmz/scenario.rs"
    },
    policy: {
      note: "Scenario-named 316/320 byte supported-binary files are reported as one logical startup shell container. The marker and Data CS share the deterministic 316-byte semantic codec; imported identity and optional tails remain annex-only.",
      fixtureProvenRequires: [
        "observed normalized startup shell coverage",
        "local semantic-core writer test anchor present",
        "local shell roundtrip test anchor present"
      ],
      coreRange: `0..${SCENARIO_STARTUP_SHELL_CORE_BYTES}`,
      preservedTailRange: `${SCENARIO_STARTUP_SHELL_CORE_BYTES}..${SCENARIO_STARTUP_SHELL_MAX_BYTES}`,
      dataCsSeparated: true
    },
    summary: {
      container: SCENARIO_STARTUP_SHELL_CONTAINER,
      observedScenarioCount,
      observedByteSizes: file?.observedByteSizes ?? [],
      sourceFileNameCount: sourceFileNames.length,
      writerReadiness: writerStatus,
      evidencePresent,
      missingEvidenceReferences: missingEvidence.length
    },
    gate: {
      container: SCENARIO_STARTUP_SHELL_CONTAINER,
      authorFacingName: SCENARIO_STARTUP_SHELL_CONTAINER,
      gate: "scenario-startup-shell-authoritative-core",
      recordBytes: SCENARIO_STARTUP_SHELL_MAX_BYTES,
      rowKind: "316-byte semantic startup shell core plus optional compatibility-annex tail",
      semanticExposure: "scenario-startup-shell",
      writerStatus,
      available,
      evidencePresent,
      fixturePathsAvailable: true,
      observedScenarioCount,
      observedByteSizes: file?.observedByteSizes ?? [],
      sourceFileNames,
      fixturePaths: [],
      missingEvidence,
      evidence,
      evidenceChecks,
      ownedFields: [
        { field: "Party level target", internal: "reclevel", offset: 0, bytes: 4, type: "i32be" },
        { field: "Maximum party level", internal: "maxlevel", offset: 4, bytes: 4, type: "i32be" },
        { field: "Startup land level", internal: "landlevel", offset: 8, bytes: 4, type: "i32be" },
        { field: "Startup X/view coordinate", internal: "lookx", offset: 12, bytes: 4, type: "i32be" },
        { field: "Startup Y/view coordinate", internal: "looky", offset: 16, bytes: 4, type: "i32be" },
        { field: "Security code segment 1", internal: "codeseg1", offset: 20, bytes: 20, type: "canonical fixed bytes" },
        { field: "Security code segment 2", internal: "codeseg2", offset: 40, bytes: 20, type: "canonical fixed bytes" },
        { field: "Creator/user string", internal: "creatorUser", offset: 60, bytes: 256, type: "canonical Str255 with zero padding" }
      ],
      preservedRanges: [
        { field: "Optional imported tail", internal: "trailingBytes", offset: 316, bytes: 4, type: "compatibility-annex-only" }
      ],
      partialOnly: false,
      preservationPolicy: "Both writers compile exactly 316 bytes from canonical startup, code-segment, and creator semantics without consulting rawBytes or trailingBytes. Untouched imported identity and any optional tail are restored only from the compatibility annex."
    }
  };
}

function buildMapsStorageWriterGates(aggregate) {
  validateMapsStorageWriterGateSpecs();
  const aggregateByName = new Map((aggregate.files ?? []).map((file) => [file.name, file]));
  const fixtureChecks = MAPS_STORAGE_FIXTURE_PATHS.map((fixturePath) => ({
    path: fixturePath,
    available: fs.existsSync(fixturePath)
  }));
  const fixturePathsAvailable = fixtureChecks.every((fixture) => fixture.available);
  const gates = MAPS_STORAGE_WRITER_GATE_SPECS.map((spec) => {
    const layout = RECORD_LAYOUTS[spec.container];
    const file = aggregateByName.get(spec.container);
    const evidence = [...new Set(spec.evidence ?? [])];
    const evidenceChecks = evidence.map(evidenceStatusFor);
    const missingEvidence = evidenceChecks
      .filter((check) => !check.present)
      .map((check) => check.reference);
    const evidencePresent = missingEvidence.length === 0;
    const observedScenarioCount = file?.scenarioCount ?? 0;
    const available = evidencePresent && fixturePathsAvailable && observedScenarioCount > 0;
    const hasObservedTail =
      spec.container === "Layout" &&
      (file?.observedByteSizes ?? []).some((size) => size > (layout?.recordBytes ?? 0));
    return {
      container: spec.container,
      authorFacingName: layout.label,
      gate: spec.gate,
      recordBytes: layout.recordBytes,
      rowKind: spec.rowKind,
      semanticExposure: spec.semanticExposure,
      writerStatus: available ? "fixture-proven-map-storage" : "evidence-pending-map-storage",
      available,
      evidencePresent,
      fixturePathsAvailable,
      observedScenarioCount,
      observedByteSizes: file?.observedByteSizes ?? [],
      fixturePaths: MAPS_STORAGE_FIXTURE_PATHS,
      missingEvidence,
      evidence,
      evidenceChecks,
      ownedFields: spec.ownedFields,
      preservedRanges: spec.preservedRanges ?? [],
      partialOnly: Boolean(spec.partialOnly || hasObservedTail || (spec.preservedRanges ?? []).length > 0),
      preservationPolicy: spec.preservationPolicy
    };
  });
  const fixtureProvenContainers = gates.filter((gate) => gate.available).length;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/generate_scenario_byte_coverage.mjs",
    target: "maps-storage-writer-gates",
    sources: {
      byteCoverage: "docs/generated/scenario-byte-ownership.json",
      mapEvidence: "docs/generated/map-field-value-evidence.json",
      actionPointEvidence: "docs/generated/extra-ap-reachability-source-map.json",
      corpusUsage: "docs/generated/corpus-field-usage.json",
      mapStorageWriters: [
        "src-tauri/src/realmz/maps.rs",
        "src-tauri/src/realmz/maps/land_layout.rs",
        "src-tauri/src/realmz/random_levels.rs",
        "src-tauri/src/realmz/action_points.rs"
      ]
    },
    policy: {
      note: "This registry gates map storage containers only. Data DL dungeon tile bitfields remain governed by dungeon-byte-ownership and dungeon-primitive-writer-gate.",
      fixtureProvenRequires: [
        "observed container coverage",
        "all map fixture paths available",
        "all local evidence references present"
      ],
      excludedFamilies: ["Data DL"]
    },
    summary: {
      containers: gates.length,
      fixtureProvenContainers,
      evidencePendingContainers: gates.length - fixtureProvenContainers,
      writerReadiness:
        fixtureProvenContainers === gates.length
          ? "fixture-proven-map-storage"
          : "evidence-pending-map-storage",
      fixturePathsAvailable,
      missingFixturePaths: fixtureChecks.filter((fixture) => !fixture.available).map((fixture) => fixture.path),
      missingEvidenceReferences: gates.reduce((total, gate) => total + gate.missingEvidence.length, 0)
    },
    gates
  };
}

function buildEncounterShopWriterGates(aggregate) {
  validateEncounterShopWriterGateSpecs();
  const aggregateByName = new Map((aggregate.files ?? []).map((file) => [file.name, file]));
  const fixtureChecks = ENCOUNTER_SHOP_FIXTURE_PATHS.map((fixturePath) => ({
    path: fixturePath,
    available: fs.existsSync(fixturePath)
  }));
  const fixturePathsAvailable = fixtureChecks.every((fixture) => fixture.available);
  const gates = ENCOUNTER_SHOP_WRITER_GATE_SPECS.map((spec) => {
    const layout = RECORD_LAYOUTS[spec.container];
    const file = aggregateByName.get(spec.container);
    const evidence = [...new Set(spec.evidence ?? [])];
    const evidenceChecks = evidence.map(evidenceStatusFor);
    const missingEvidence = evidenceChecks
      .filter((check) => !check.present)
      .map((check) => check.reference);
    const evidencePresent = missingEvidence.length === 0;
    const observedScenarioCount = file?.scenarioCount ?? 0;
    const available = evidencePresent && fixturePathsAvailable && observedScenarioCount > 0;
    return {
      container: spec.container,
      authorFacingName: layout.label,
      gate: spec.gate,
      recordBytes: layout.recordBytes,
      rowKind: spec.rowKind,
      semanticExposure: spec.semanticExposure,
      writerStatus: available ? "fixture-proven-encounter-shop-storage" : "evidence-pending-encounter-shop-storage",
      available,
      evidencePresent,
      fixturePathsAvailable,
      observedScenarioCount,
      observedByteSizes: file?.observedByteSizes ?? [],
      fixturePaths: ENCOUNTER_SHOP_FIXTURE_PATHS,
      missingEvidence,
      evidence,
      evidenceChecks,
      ownedFields: spec.ownedFields,
      preservedRanges: spec.preservedRanges ?? [],
      partialOnly: Boolean(spec.partialOnly || (spec.preservedRanges ?? []).length > 0),
      preservationPolicy: spec.preservationPolicy
    };
  });
  const fixtureProvenContainers = gates.filter((gate) => gate.available).length;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/generate_scenario_byte_coverage.mjs",
    target: "encounter-shop-writer-gates",
    sources: {
      byteCoverage: "docs/generated/scenario-byte-ownership.json",
      encounterEvidence: "docs/generated/encounter-record-evidence.json",
      itemShopEvidence: "docs/format-evidence-cards/item-treasure-shop-runtime-anchors.md",
      thiefEvidence: "docs/format-evidence-cards/thief-timed-encounter-runtime-anchors.md",
      encounterShopWriters: [
        "src-tauri/src/realmz/encounters.rs",
        "src-tauri/src/realmz/shops.rs"
      ]
    },
    policy: {
      note: "This registry gates simple/complex encounter, shop, and thief encounter storage only. Timed encounters remain governed by fixed-record-writer-gates.",
      fixtureProvenRequires: [
        "observed container coverage",
        "all encounter/shop fixture paths available",
        "all local evidence references present"
      ],
      excludedFamilies: ["Data TD3"]
    },
    summary: {
      containers: gates.length,
      fixtureProvenContainers,
      evidencePendingContainers: gates.length - fixtureProvenContainers,
      writerReadiness:
        fixtureProvenContainers === gates.length
          ? "fixture-proven-encounter-shop-storage"
          : "evidence-pending-encounter-shop-storage",
      fixturePathsAvailable,
      missingFixturePaths: fixtureChecks.filter((fixture) => !fixture.available).map((fixture) => fixture.path),
      missingEvidenceReferences: gates.reduce((total, gate) => total + gate.missingEvidence.length, 0)
    },
    gates
  };
}

function buildCoreRecordWriterGates(aggregate) {
  validateCoreRecordWriterGateSpecs();
  const aggregateByName = new Map((aggregate.files ?? []).map((file) => [file.name, file]));
  const fixtureChecks = CORE_RECORD_FIXTURE_PATHS.map((fixturePath) => ({
    path: fixturePath,
    available: fs.existsSync(fixturePath)
  }));
  const fixturePathsAvailable = fixtureChecks.every((fixture) => fixture.available);
  const gates = CORE_RECORD_WRITER_GATE_SPECS.map((spec) => {
    const layout = RECORD_LAYOUTS[spec.container];
    const file = aggregateByName.get(spec.container);
    const evidence = [...new Set(spec.evidence ?? [])];
    const evidenceChecks = evidence.map(evidenceStatusFor);
    const missingEvidence = evidenceChecks
      .filter((check) => !check.present)
      .map((check) => check.reference);
    const evidencePresent = missingEvidence.length === 0;
    const observedScenarioCount = file?.scenarioCount ?? 0;
    const available = evidencePresent && fixturePathsAvailable && observedScenarioCount > 0;
    return {
      container: spec.container,
      authorFacingName: layout.label,
      gate: spec.gate,
      recordBytes: layout.recordBytes,
      rowKind: spec.rowKind,
      semanticExposure: spec.semanticExposure,
      writerStatus: available ? "fixture-proven-core-record-storage" : "evidence-pending-core-record-storage",
      available,
      evidencePresent,
      fixturePathsAvailable,
      observedScenarioCount,
      observedByteSizes: file?.observedByteSizes ?? [],
      fixturePaths: CORE_RECORD_FIXTURE_PATHS,
      missingEvidence,
      evidence,
      evidenceChecks,
      ownedFields: spec.ownedFields,
      preservedRanges: spec.preservedRanges ?? [],
      partialOnly: Boolean(spec.partialOnly || (spec.preservedRanges ?? []).length > 0),
      preservationPolicy: spec.preservationPolicy
    };
  });
  const fixtureProvenContainers = gates.filter((gate) => gate.available).length;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/generate_scenario_byte_coverage.mjs",
    target: "core-record-writer-gates",
    sources: {
      byteCoverage: "docs/generated/scenario-byte-ownership.json",
      monsterEvidence: "docs/generated/monster-record-evidence.json",
      mapRecordEvidence: "docs/generated/map-record-evidence.json",
      itemEvidence: "docs/generated/core-rules-record-evidence.json",
      coreRecordWriters: [
        "src-tauri/src/realmz/combat.rs",
        "src-tauri/src/realmz/maps.rs",
        "src-tauri/src/realmz/economy.rs",
        "src-tauri/src/realmz/scenario_items.rs"
      ]
    },
    policy: {
      note: "This registry gates the final core gameplay record storage families. It proves fixed-record storage writability only and does not expose new normal editor controls.",
      fixtureProvenRequires: [
        "observed container coverage",
        "all core record fixture paths available",
        "all local evidence references present"
      ],
      semanticCaution: [
        "alternate monster-set editing remains UI-gated",
        "map record prefix bytes remain preserve-only",
        "imported scenario items may preserve an unchanged zero stored item-ID alias"
      ]
    },
    summary: {
      containers: gates.length,
      fixtureProvenContainers,
      evidencePendingContainers: gates.length - fixtureProvenContainers,
      writerReadiness:
        fixtureProvenContainers === gates.length
          ? "fixture-proven-core-record-storage"
          : "evidence-pending-core-record-storage",
      fixturePathsAvailable,
      missingFixturePaths: fixtureChecks.filter((fixture) => !fixture.available).map((fixture) => fixture.path),
      missingEvidenceReferences: gates.reduce((total, gate) => total + gate.missingEvidence.length, 0)
    },
    gates
  };
}

function validateFixedRecordWriterGateSpecs() {
  const containers = FIXED_RECORD_WRITER_GATE_SPECS.map((spec) => spec.container);
  const uniqueContainers = new Set(containers);
  if (uniqueContainers.size !== containers.length) {
    const duplicates = containers.filter((container, index) => containers.indexOf(container) !== index);
    throw new Error(`Duplicate fixed-record writer gates: ${[...new Set(duplicates)].join(", ")}`);
  }
  const missing = CORE_FIXED_RECORD_GATE_CONTAINERS.filter((container) => !uniqueContainers.has(container));
  if (missing.length > 0) {
    throw new Error(`Missing fixed-record writer gates: ${missing.join(", ")}`);
  }
  const unexpected = containers.filter((container) => !CORE_FIXED_RECORD_GATE_CONTAINER_SET.has(container));
  if (unexpected.length > 0) {
    throw new Error(`Unexpected fixed-record writer gates: ${unexpected.join(", ")}`);
  }
  const excluded = containers.filter((container) => CORE_FIXED_RECORD_GATE_EXCLUDED_FAMILIES.includes(container));
  if (excluded.length > 0) {
    throw new Error(`Excluded families leaked into fixed-record writer gates: ${excluded.join(", ")}`);
  }
  for (const container of containers) {
    if (!RECORD_LAYOUTS[container]?.recordBytes) {
      throw new Error(`${container} has no fixed RECORD_LAYOUTS entry`);
    }
  }
}

function validateMapsStorageWriterGateSpecs() {
  const containers = MAPS_STORAGE_WRITER_GATE_SPECS.map((spec) => spec.container);
  const uniqueContainers = new Set(containers);
  if (uniqueContainers.size !== containers.length) {
    const duplicates = containers.filter((container, index) => containers.indexOf(container) !== index);
    throw new Error(`Duplicate maps storage writer gates: ${[...new Set(duplicates)].join(", ")}`);
  }
  const missing = MAPS_STORAGE_GATE_CONTAINERS.filter((container) => !uniqueContainers.has(container));
  if (missing.length > 0) {
    throw new Error(`Missing maps storage writer gates: ${missing.join(", ")}`);
  }
  const unexpected = containers.filter((container) => !MAPS_STORAGE_GATE_CONTAINER_SET.has(container));
  if (unexpected.length > 0) {
    throw new Error(`Unexpected maps storage writer gates: ${unexpected.join(", ")}`);
  }
  for (const container of containers) {
    if (!RECORD_LAYOUTS[container]?.recordBytes) {
      throw new Error(`${container} has no maps storage RECORD_LAYOUTS entry`);
    }
  }
}

function validateEncounterShopWriterGateSpecs() {
  const containers = ENCOUNTER_SHOP_WRITER_GATE_SPECS.map((spec) => spec.container);
  const uniqueContainers = new Set(containers);
  if (uniqueContainers.size !== containers.length) {
    const duplicates = containers.filter((container, index) => containers.indexOf(container) !== index);
    throw new Error(`Duplicate encounter/shop writer gates: ${[...new Set(duplicates)].join(", ")}`);
  }
  const missing = ENCOUNTER_SHOP_GATE_CONTAINERS.filter((container) => !uniqueContainers.has(container));
  if (missing.length > 0) {
    throw new Error(`Missing encounter/shop writer gates: ${missing.join(", ")}`);
  }
  const unexpected = containers.filter((container) => !ENCOUNTER_SHOP_GATE_CONTAINER_SET.has(container));
  if (unexpected.length > 0) {
    throw new Error(`Unexpected encounter/shop writer gates: ${unexpected.join(", ")}`);
  }
  for (const container of containers) {
    if (!RECORD_LAYOUTS[container]?.recordBytes) {
      throw new Error(`${container} has no encounter/shop RECORD_LAYOUTS entry`);
    }
  }
}

function validateCoreRecordWriterGateSpecs() {
  const containers = CORE_RECORD_WRITER_GATE_SPECS.map((spec) => spec.container);
  const uniqueContainers = new Set(containers);
  if (uniqueContainers.size !== containers.length) {
    const duplicates = containers.filter((container, index) => containers.indexOf(container) !== index);
    throw new Error(`Duplicate core-record writer gates: ${[...new Set(duplicates)].join(", ")}`);
  }
  const missing = CORE_RECORD_GATE_CONTAINERS.filter((container) => !uniqueContainers.has(container));
  if (missing.length > 0) {
    throw new Error(`Missing core-record writer gates: ${missing.join(", ")}`);
  }
  const unexpected = containers.filter((container) => !CORE_RECORD_GATE_CONTAINER_SET.has(container));
  if (unexpected.length > 0) {
    throw new Error(`Unexpected core-record writer gates: ${unexpected.join(", ")}`);
  }
  for (const container of containers) {
    if (!RECORD_LAYOUTS[container]?.recordBytes) {
      throw new Error(`${container} has no core-record RECORD_LAYOUTS entry`);
    }
  }
}

function evidenceStatusFor(reference) {
  const parsed = parseLocalEvidenceReference(reference);
  if (!parsed) {
    return {
      reference,
      present: true,
      check: "external-reference"
    };
  }
  const fullPath = path.join(repoRoot, parsed.filePath);
  const fileExists = fs.existsSync(fullPath);
  const anchorPresent = parsed.anchor
    ? fileExists && fs.readFileSync(fullPath, "utf8").includes(parsed.anchor)
    : null;
  return {
    reference,
    file: parsed.filePath,
    anchor: parsed.anchor,
    fileExists,
    anchorPresent,
    present: fileExists && (parsed.anchor ? anchorPresent : true)
  };
}

function parseLocalEvidenceReference(reference) {
  const normalized = reference.replace(/\\/g, "/");
  if (!/^(docs|scripts|src|src-tauri)\//.test(normalized)) return null;
  const colonIndex = normalized.indexOf(":");
  if (colonIndex === -1) {
    return { filePath: normalized, anchor: null };
  }
  return {
    filePath: normalized.slice(0, colonIndex),
    anchor: normalized.slice(colonIndex + 1)
  };
}

function buildInventory(scanned, aggregate) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: {
      roundtripLedger: "docs/generated/scenario-byte-roundtrip-ledger.json",
      rustRegistry: "src-tauri/src/realmz/assembly.rs",
        runtimeCaches: "docs/generated/runtime-cache-classification.json",
        resourceCoverage: "docs/generated/resource-byte-ownership.json",
        customLandlookCoverage: "docs/generated/custom-landlook-coverage.json",
        rulesCoverage: "docs/generated/rules-resource-coverage.json",
        dungeonCoverage: "docs/generated/dungeon-byte-ownership.json",
        dungeonHighBitAudit: "docs/generated/dungeon-high-bit-audit.json",
        fixedRecordWriterGates: "docs/generated/fixed-record-writer-gates.json",
        scenarioStartupShellGate: "docs/generated/scenario-startup-shell-gate.json",
        mapsStorageWriterGates: "docs/generated/maps-storage-writer-gates.json",
        encounterShopWriterGates: "docs/generated/encounter-shop-writer-gates.json",
        coreRecordWriterGates: "docs/generated/core-record-writer-gates.json",
        completenessTruth: "docs/generated/scenario-completeness-truth.json"
    },
    policy: {
      ignoredNonScenarioFiles: [...NON_SCENARIO_IGNORES].sort(),
      note: "Finder/OS metadata is intentionally ignored. Meaningful Mac resource-fork payloads are classified as scenario resources."
    },
    summary: {
      scenarioRoots: scanned.length,
      fileFamilies: aggregate.files.length,
      ignoredNonScenarioFiles: scanned.reduce((sum, scenario) => sum + scenario.ignoredFiles.length, 0),
      resourceForkFiles: aggregate.files.filter((file) => file.roles.includes("resource-fork")).length,
      unknownFileFamilies: aggregate.files.filter((file) => file.coverageStatus === "unknown-active-risk").length
    },
    fileFamilies: aggregate.files,
    scenarios: scanned
  };
}

function buildOwnership(aggregate) {
  const containers = aggregate.files.map((file) => {
    const layout = RECORD_LAYOUTS[file.name];
    const byteRanges = byteRangesForFile(file, layout);
    const recordBytes = file.name === SCENARIO_STARTUP_SHELL_CONTAINER
      ? SCENARIO_STARTUP_SHELL_MAX_BYTES
      : layout?.recordBytes ?? null;
    const dungeonDetails = file.name === "Data DL" && dungeonByteOwnership
      ? {
          bitOwnership: dungeonByteOwnership.bitOwnership,
          dungeonSummary: dungeonByteOwnership.summary,
          dungeonCoverage: "docs/generated/dungeon-byte-ownership.json"
        }
      : {};
    return {
      container: file.name,
      authorFacingName: layout?.label ?? PASS_THROUGH_POLICIES[file.name]?.label ?? labelForFile(file),
      coverageStatus: file.coverageStatus,
      role: file.roles[0] ?? "unknown",
      observedScenarioCount: file.scenarioCount,
      observedByteSizes: file.observedByteSizes,
      ...(file.sourceFileNames ? { sourceFileNames: file.sourceFileNames } : {}),
      recordBytes,
      byteRanges,
      resourceTypes: file.resourceTypes,
      evidence: evidenceForFile(file.name, file.coverageStatus),
      editorPolicy: editorPolicyFor(file.coverageStatus, file.name),
      ...dungeonDetails
    };
  });
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    classifications: [
      "decoded-writable",
      "decoded-readonly",
      "mixed-writable-preserved",
      "preserved-known",
      "preserved-unknown",
      "runtime-cache",
      "ignored-non-scenario",
      "unknown-active-risk",
      "understood-resource-container",
      "decoded-resource-payload",
      "preserved-standard-media-payload",
      "custom-media-payload",
      "needs-codec-work",
      "understood-runtime-writer-gated"
    ],
    sources: {
      fileInventory: "docs/generated/scenario-file-inventory.json",
      unknownBacklog: "docs/generated/unknown-data-backlog.json",
        runtimeCaches: "docs/generated/runtime-cache-classification.json",
        resourceCoverage: "docs/generated/resource-byte-ownership.json",
        customLandlookCoverage: "docs/generated/custom-landlook-coverage.json",
        rulesCoverage: "docs/generated/rules-resource-coverage.json",
        dungeonCoverage: "docs/generated/dungeon-byte-ownership.json",
        dungeonHighBitAudit: "docs/generated/dungeon-high-bit-audit.json",
        fixedRecordWriterGates: "docs/generated/fixed-record-writer-gates.json",
        scenarioStartupShellGate: "docs/generated/scenario-startup-shell-gate.json",
        mapsStorageWriterGates: "docs/generated/maps-storage-writer-gates.json",
        encounterShopWriterGates: "docs/generated/encounter-shop-writer-gates.json",
        coreRecordWriterGates: "docs/generated/core-record-writer-gates.json",
        completenessTruth: "docs/generated/scenario-completeness-truth.json",
        ed3Reachability: "docs/generated/extra-ap-reachability-source-map.json",
        edcdCrosswalk: "docs/generated/opcode-edcd-crosswalk.json"
    },
    summary: summarizeOwnership(containers),
    containers
  };
}

function buildUnknownReport(inventory, ownership, backlog) {
  const activeRisks = ownership.containers.filter((container) => container.coverageStatus === "unknown-active-risk");
  const preserved = ownership.containers.filter((container) => container.coverageStatus === "preserved-known" || container.coverageStatus === "preserved-unknown");
  const backlogRisks = (backlog.targets ?? [])
    .filter((target) => target.classification === "unknown-active-risk" || target.classification === "understood-runtime-writer-gated" || target.classification === "resource-packaging-needed")
    .sort((a, b) => Number(a.priority ?? 999) - Number(b.priority ?? 999))
    .slice(0, 12)
    .map((target) => ({
      id: target.id,
      family: target.family,
      priority: target.priority,
      classification: target.classification,
      summary: target.why,
      followUp: target.followUp ?? [],
      evidenceCard: target.evidenceCard ?? null
    }));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      unknownActiveRiskContainers: activeRisks.length,
      preservedContainers: preserved.length,
      backlogRisks: backlogRisks.length,
      ignoredNonScenarioFiles: inventory.summary.ignoredNonScenarioFiles,
      note: "This report separates active unknown containers from stricter writer/package risks. See docs/generated/scenario-completeness-truth.json for the strict score."
    },
    activeRisks: activeRisks.map((container) => ({
      container: container.container,
      status: container.coverageStatus,
      observedScenarioCount: container.observedScenarioCount,
      observedByteSizes: container.observedByteSizes,
      evidence: container.evidence
    })),
    preserved,
    backlogRisks
  };
}

function buildFunctionalAuthoringReadiness(ownership, truth) {
  const containerByName = new Map((ownership.containers ?? []).map((container) => [container.container, container]));
  const truthByName = new Map((truth.containers ?? []).map((container) => [container.container, container]));
  const systems = [
    functionalSystem({
      id: "map-records",
      label: "Map Records",
      containers: ["Data MD2"],
      authoringStatus: "ready-with-preserved-compatibility",
      rationale: "Map marker triples, start/display fields, clip rectangle, and note text are writer-proven; bytes 74..76 remain preserved compatibility storage.",
      evidence: [
        "docs/generated/map-record-evidence.json",
        "docs/generated/core-record-writer-gates.json",
        "docs/format-evidence-cards/map-record-runtime-anchors.md"
      ],
      containerByName,
      truthByName
    }),
    functionalSystem({
      id: "scenario-items",
      label: "Scenario Items",
      containers: ["Data NI"],
      authoringStatus: "ready",
      rationale: "All 100 Data NI bytes are writer-proven semantic storage, including source-backed itemattr.spare2[7]. Fresh records omit rawBytes; imported zero item-ID aliases remain a bounded no-edit compatibility encoding.",
      evidence: [
        "docs/generated/core-rules-record-evidence.json",
        "docs/generated/core-record-writer-gates.json",
        "docs/format-evidence-cards/core-rules-record-runtime-anchors.md"
      ],
      containerByName,
      truthByName
    }),
    functionalSystem({
      id: "custom-landlook-metadata",
      label: "Custom Land Tiles",
      containers: ["Data Custom 1 BD", "Data Custom 2 BD", "Data Custom 3 BD"],
      authoringStatus: "ready-with-preserved-compatibility",
      rationale: "Custom mapstats metadata, base tile/scale, combat builds, and range-slot first/last values are writer-proven. Each range slot reserved word remains preserved.",
      evidence: [
        "docs/generated/custom-landlook-coverage.json",
        "docs/format-evidence-cards/custom-landlook-writers.md"
      ],
      containerByName,
      truthByName
    }),
    functionalSystem({
      id: "special-tile-solidity",
      label: "Special Tile Solidity",
      containers: ["Data Solids"],
      authoringStatus: "ready",
      rationale: "Realmz source checks Data Solids only for special negative tile values; Providence parses and regenerates the 1024-byte solidity table from decoded special-tile profiles.",
      evidence: [
        "docs/format-evidence-cards/map-tile-runtime-anchors.md",
        "docs/format-evidence-cards/map-tile-intelligence.md"
      ],
      containerByName,
      truthByName
    }),
    functionalSystem({
      id: "custom-spells",
      label: "Custom Spells",
      containers: ["Data Spell"],
      authoringStatus: "ready-with-preserved-packaging",
      rationale: "Custom spell records and name STR# resources are the supported authoring surface. The Data Spell tail is preserved packaging; current runtime evidence reads the 105 custom records and resource fork data, not the tail as functional spell behavior.",
      evidence: [
        "docs/generated/rules-resource-coverage.json",
        "docs/generated/rules-name-resource-packaging.json",
        "docs/format-evidence-cards/rules-spell-race-caste-runtime-anchors.md"
      ],
      containerByName,
      truthByName
    })
  ];
  const blockerSystems = systems.filter((system) => system.functionalBlocker);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/generate_scenario_byte_coverage.mjs",
    policy: {
      note: "Functional authoring readiness asks whether a user can create valid gameplay data from scratch. It is separate from byte ownership and media codec internals.",
      preservedCompatibilityBytesAreNotBlockers: true,
      rawFileNamesStayAdvancedOnly: true
    },
    summary: {
      status: blockerSystems.length === 0 ? "ready" : "has-functional-blockers",
      readySystems: systems.length - blockerSystems.length,
      totalSystems: systems.length,
      functionalBlockers: blockerSystems.length,
      blockerIds: blockerSystems.map((system) => system.id)
    },
    systems
  };
}

function functionalSystem({ id, label, containers, authoringStatus, rationale, evidence, containerByName, truthByName }) {
  const containerStatuses = containers.map((containerName) => {
    const container = containerByName.get(containerName) ?? null;
    const truth = truthByName.get(containerName)?.truth ?? null;
    const statuses = container ? [...effectiveStatusesForContainer(container)].sort() : [];
    return {
      container: containerName,
      observed: Boolean(container && container.observedScenarioCount > 0),
      coverageStatus: container?.coverageStatus ?? "missing",
      effectiveStatuses: statuses,
      writerReadiness: truth?.writerReadiness ?? "missing",
      semanticOwnership: truth?.semanticOwnership ?? "missing"
    };
  });
  const hasMissing = containerStatuses.some((status) => status.coverageStatus === "missing");
  const hasWriterGated = containerStatuses.some((status) => status.writerReadiness === "writer-gated");
  const hasFormatRisk = containerStatuses.some((status) => status.semanticOwnership === "needs-format-work" || status.effectiveStatuses.includes("unknown-active-risk"));
  return {
    id,
    label,
    status: hasMissing || hasWriterGated || hasFormatRisk ? "needs-work" : authoringStatus,
    functionalBlocker: hasMissing || hasWriterGated || hasFormatRisk,
    rationale,
    containers: containerStatuses,
    evidence
  };
}

function buildUiManifest(inventory, ownership, unknownReport, truth, functionalReadiness) {
  const topContainers = ownership.containers
    .filter((container) => container.observedScenarioCount > 0)
    .sort((a, b) => statusSort(a.coverageStatus) - statusSort(b.coverageStatus) || b.observedScenarioCount - a.observedScenarioCount || a.container.localeCompare(b.container))
    .slice(0, 30)
    .map((container) => ({
      container: container.container,
      label: container.authorFacingName,
      status: STATUS_LABELS[container.coverageStatus] ?? container.coverageStatus,
      coverageStatus: container.coverageStatus,
      truth: truth.containers.find((entry) => entry.container === container.container)?.truth ?? null,
      count: container.observedScenarioCount,
      sizes: container.observedByteSizes,
      policy: container.editorPolicy
    }));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      scenarioRoots: inventory.summary.scenarioRoots,
      fileFamilies: inventory.summary.fileFamilies,
      ignoredNonScenarioFiles: inventory.summary.ignoredNonScenarioFiles,
      editableContainers: ownership.summary.statusCounts["decoded-writable"] ?? 0,
      preservedContainers:
        (ownership.summary.statusCounts["preserved-known"] ?? 0) +
        (ownership.summary.statusCounts["preserved-unknown"] ?? 0) +
        (ownership.summary.statusCounts["preserved-standard-media-payload"] ?? 0) +
        (ownership.summary.statusCounts["custom-media-payload"] ?? 0),
      understoodResourceContainers: ownership.summary.statusCounts["understood-resource-container"] ?? 0,
      resourceCoverage: resourceByteOwnership
        ? {
            resourceForkFiles: resourceByteOwnership.summary?.resourceForkFiles ?? 0,
            parsedResourceForks: resourceByteOwnership.summary?.parsedResourceForks ?? 0,
            resourceEntries: resourceByteOwnership.summary?.resourceEntries ?? 0,
            payloadBytesByStatus: resourceByteOwnership.summary?.statusObservedBytes ?? {}
          }
        : null,
      targetCompatibility: targetCompatibility
        ? {
            macClassicScenarios: targetCompatibility.summary?.targets?.["mac-classic-folder"]?.scenarios ?? 0,
            windowsRealmzScenarios: targetCompatibility.summary?.targets?.["windows-realmz-folder"]?.scenarios ?? 0,
            targetCompatibilityIssues: targetCompatibility.summary?.targetCompatibilityIssues ?? 0,
            warnings: targetCompatibility.summary?.warnings ?? 0,
            errors: targetCompatibility.summary?.errors ?? 0
          }
        : null,
      functionalAuthoringReadiness: functionalReadiness?.summary ?? null,
      strictCompleteness: truth.summary,
      completeness: targetCompatibility?.summary?.completeness ?? splitCompletenessSummary(ownership),
      dungeon: dungeonSummary(),
      runtimeStateContainers: ownership.summary.statusCounts["runtime-cache"] ?? 0,
      needsFormatWork: ownership.summary.statusCounts["unknown-active-risk"] ?? 0,
      ed3: ed3Summary(),
      edcd: edcdSummary()
    },
    statusLabels: STATUS_LABELS,
    topRisks: unknownReport.backlogRisks.slice(0, 8).map((risk) => ({
      id: risk.id,
      family: risk.family,
      priority: risk.priority,
      status: STATUS_LABELS[risk.classification] ?? risk.classification,
      summary: risk.summary,
      evidenceCard: risk.evidenceCard
    })),
    containers: topContainers
  };
}

function buildCompletenessTruth(inventory, ownership, unknownReport) {
  const containers = ownership.containers.map((container) => {
    const effectiveStatuses = effectiveStatusesForContainer(container);
    const fixtureGate = fixtureGateForContainer(container.container);
    const evidence = [...new Set([...(container.evidence ?? []), ...(fixtureGate?.evidence ?? [])])];
    const truth = {
      semanticOwnership: semanticOwnershipFor(container, effectiveStatuses),
      writerReadiness: writerReadinessFor(container, effectiveStatuses, fixtureGate),
      evidenceQuality: evidenceQualityFor(container, evidence, fixtureGate),
      riskFlags: riskFlagsFor(container, effectiveStatuses, evidence, fixtureGate)
    };
    return {
      container: container.container,
      authorFacingName: container.authorFacingName,
      coverageStatus: container.coverageStatus,
      observedScenarioCount: container.observedScenarioCount,
      observedByteSizes: container.observedByteSizes,
      effectiveStatuses: [...effectiveStatuses].sort(),
      evidence,
      fixtureGate: fixtureGate
        ? {
            name: fixtureGate.gate,
            available: fixtureGate.available,
            partialOnly: Boolean(fixtureGate.partialOnly),
            ...(fixtureGate.source && fixtureGate.source !== "static"
              ? {
                  evidencePresent: fixtureGate.evidencePresent ?? null,
                  missingEvidence: fixtureGate.missingEvidence ?? [],
                  source: fixtureGate.source
                }
              : {})
          }
        : null,
      truth
    };
  });
  const summary = summarizeCompletenessTruth(containers, unknownReport);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: {
      byteOwnership: "docs/generated/scenario-byte-ownership.json",
      unknownReport: "docs/generated/scenario-unknown-byte-report.json",
      targetCompatibility: "docs/generated/scenario-target-compatibility.json",
      resourceCoverage: "docs/generated/resource-byte-ownership.json",
      dungeonCoverage: "docs/generated/dungeon-byte-ownership.json",
      customLandlookCoverage: "docs/generated/custom-landlook-coverage.json",
      rulesCoverage: "docs/generated/rules-resource-coverage.json",
      actionPointWriterGate: "docs/generated/action-point-writer-gate.json",
      fixedRecordWriterGates: "docs/generated/fixed-record-writer-gates.json",
      scenarioStartupShellGate: "docs/generated/scenario-startup-shell-gate.json",
      mapsStorageWriterGates: "docs/generated/maps-storage-writer-gates.json",
      encounterShopWriterGates: "docs/generated/encounter-shop-writer-gates.json",
      coreRecordWriterGates: "docs/generated/core-record-writer-gates.json"
    },
    policy: {
      note: "Truth statuses are stricter than legacy coverageStatus. Semantic ownership, writer readiness, evidence quality, and package compatibility are intentionally separate.",
      scenarioSemanticsExcludeOptionalCodecs: true,
      writerReadinessRequiresFixtureOrExplicitGate: true,
      actionPointWriterGateStatus: actionPointWriterGate?.summary?.writerReadiness ?? null,
      fixedRecordWriterGateStatus: fixedRecordWriterGates?.summary?.writerReadiness ?? null,
      mapsStorageWriterGateStatus: mapsStorageWriterGates?.summary?.writerReadiness ?? null,
      encounterShopWriterGateStatus: encounterShopWriterGates?.summary?.writerReadiness ?? null,
      coreRecordWriterGateStatus: coreRecordWriterGates?.summary?.writerReadiness ?? null
    },
    summary,
    containers
  };
}

function validateInventoryAndOwnership(inventory, ownership, truth) {
  const leakedIgnored = inventory.fileFamilies.filter((file) => NON_SCENARIO_IGNORES.has(file.name));
  if (leakedIgnored.length > 0) {
    throw new Error(`Ignored non-scenario files leaked into inventory: ${leakedIgnored.map((file) => file.name).join(", ")}`);
  }
  for (const container of ownership.containers) {
    if (!container.coverageStatus) throw new Error(`${container.container} is missing a coverage status`);
    const finiteRanges = container.byteRanges
      .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.endExclusive))
      .sort((a, b) => a.start - b.start);
    for (let index = 1; index < finiteRanges.length; index += 1) {
      const previous = finiteRanges[index - 1];
      const current = finiteRanges[index];
      if (current.start < previous.endExclusive) {
        throw new Error(`${container.container} has overlapping byte ranges at ${previous.start}-${previous.endExclusive} and ${current.start}-${current.endExclusive}`);
      }
    }
    if (container.recordBytes !== null) {
      const maxObservedBytes = Math.max(container.recordBytes, ...(container.observedByteSizes ?? []));
      for (const range of finiteRanges) {
        if (range.start < 0 || range.endExclusive > maxObservedBytes) {
          throw new Error(`${container.container} byte range ${range.start}-${range.endExclusive} exceeds observed size ${maxObservedBytes}`);
        }
      }
    }
  }
  const truthByContainer = new Map((truth?.containers ?? []).map((container) => [container.container, container]));
  for (const container of ownership.containers) {
    const truthEntry = truthByContainer.get(container.container);
    if (!truthEntry) throw new Error(`${container.container} is missing from scenario completeness truth`);
    const hasDecodedWritable = effectiveStatusesForContainer(container).has("decoded-writable");
    if (container.coverageStatus === "decoded-writable" && !(container.evidence ?? []).length) {
      throw new Error(`${container.container} is decoded-writable but has no evidence source`);
    }
    if (
      hasDecodedWritable &&
      truthEntry.truth.writerReadiness === "fixture-proven" &&
      truthEntry.truth.evidenceQuality === "missing-evidence"
    ) {
      throw new Error(`${container.container} is fixture-proven without evidence`);
    }
    if (
      container.coverageStatus === "preserved-known" &&
      !(container.evidence ?? []).length &&
      container.container !== "Read Me (nice to know)"
    ) {
      throw new Error(`${container.container} is preserved-known but has no evidence source`);
    }
    if (
      effectiveStatusesForContainer(container).has("preserved-unknown") &&
      container.coverageStatus === "decoded-writable"
    ) {
      throw new Error(`${container.container} has preserved-unknown ranges but is still reported decoded-writable`);
    }
  }
  if ((truth.summary.packageCompatibility?.warnings ?? 0) > 0 && truth.summary.strictOutstanding?.targetWarnings === 0) {
    throw new Error("Target compatibility warnings are missing from the strict completion summary");
  }
}

function effectiveStatusesForContainer(container) {
  const statuses = new Set((container.byteRanges ?? []).map((range) => range.status).filter(Boolean));
  if (container.coverageStatus) statuses.add(container.coverageStatus);
  if (container.container === "Data DL") {
    for (const bit of container.bitOwnership ?? []) {
      if (bit.ownershipStatus) statuses.add(bit.ownershipStatus);
    }
  }
  statuses.delete("mixed-writable-preserved");
  if (!statuses.size && container.coverageStatus) statuses.add(container.coverageStatus);
  return statuses;
}

function fixtureGateForContainer(containerName) {
  const gate = FIXTURE_GATES[containerName];
  if (gate) {
    const available = (gate.fixturePaths ?? []).every((fixturePath) => fs.existsSync(fixturePath));
    return { ...gate, available, source: "static" };
  }
  if (containerName === SCENARIO_STARTUP_SHELL_CONTAINER || containerName === "Data CS") {
    const generatedGate = scenarioStartupShellGate.gate;
    return {
      gate: generatedGate.gate,
      fixturePaths: generatedGate.fixturePaths ?? [],
      evidence: [
        "docs/generated/scenario-startup-shell-gate.json",
        ...(generatedGate.evidence ?? [])
      ],
      available: Boolean(generatedGate.available),
      evidencePresent: Boolean(generatedGate.evidencePresent),
      missingEvidence: generatedGate.missingEvidence ?? [],
      partialOnly: Boolean(generatedGate.partialOnly),
      source: "scenario-startup-shell-gate"
    };
  }
  const mapsGate = mapsStorageWriterGates.gates.find((entry) => entry.container === containerName);
  if (mapsGate) {
    return {
      gate: mapsGate.gate,
      fixturePaths: mapsGate.fixturePaths ?? [],
      evidence: [
        "docs/generated/maps-storage-writer-gates.json",
        ...(mapsGate.evidence ?? [])
      ],
      available: Boolean(mapsGate.available),
      evidencePresent: Boolean(mapsGate.evidencePresent),
      missingEvidence: mapsGate.missingEvidence ?? [],
      partialOnly: Boolean(mapsGate.partialOnly),
      source: "maps-storage-writer-gates"
    };
  }
  const encounterShopGate = encounterShopWriterGates.gates.find((entry) => entry.container === containerName);
  if (encounterShopGate) {
    return {
      gate: encounterShopGate.gate,
      fixturePaths: encounterShopGate.fixturePaths ?? [],
      evidence: [
        "docs/generated/encounter-shop-writer-gates.json",
        ...(encounterShopGate.evidence ?? [])
      ],
      available: Boolean(encounterShopGate.available),
      evidencePresent: Boolean(encounterShopGate.evidencePresent),
      missingEvidence: encounterShopGate.missingEvidence ?? [],
      partialOnly: Boolean(encounterShopGate.partialOnly),
      source: "encounter-shop-writer-gates"
    };
  }
  const coreRecordGate = coreRecordWriterGates.gates.find((entry) => entry.container === containerName);
  if (coreRecordGate) {
    return {
      gate: coreRecordGate.gate,
      fixturePaths: coreRecordGate.fixturePaths ?? [],
      evidence: [
        "docs/generated/core-record-writer-gates.json",
        ...(coreRecordGate.evidence ?? [])
      ],
      available: Boolean(coreRecordGate.available),
      evidencePresent: Boolean(coreRecordGate.evidencePresent),
      missingEvidence: coreRecordGate.missingEvidence ?? [],
      partialOnly: Boolean(coreRecordGate.partialOnly),
      source: "core-record-writer-gates"
    };
  }
  const generatedGate = fixedRecordWriterGates.gates.find((entry) => entry.container === containerName);
  if (!generatedGate) return null;
  return {
    gate: generatedGate.gate,
    fixturePaths: generatedGate.fixturePaths ?? [],
    evidence: [
      "docs/generated/fixed-record-writer-gates.json",
      ...(generatedGate.evidence ?? [])
    ],
    available: Boolean(generatedGate.available),
    evidencePresent: Boolean(generatedGate.evidencePresent),
    missingEvidence: generatedGate.missingEvidence ?? [],
    partialOnly: Boolean(generatedGate.partialOnly),
    source: "fixed-record-writer-gates"
  };
}

function semanticOwnershipFor(container, statuses) {
  if (statuses.has("ignored-non-scenario")) return "ignored";
  if (statuses.size === 1 && statuses.has("runtime-cache")) return "runtime-only";
  if (statuses.has("unknown-active-risk") || statuses.has("needs-codec-work")) return "needs-format-work";
  if (statuses.size === 1 && statuses.has("preserved-unknown")) return "needs-format-work";
  if (statuses.size > 1 || statuses.has("preserved-unknown")) return "mixed";
  return "complete";
}

function writerReadinessFor(container, statuses, fixtureGate) {
  if (statuses.has("ignored-non-scenario") || statuses.has("runtime-cache")) return "not-applicable";
  if (container.container === "Scenario.rsrc" && fixtureGate?.available) return "fixture-proven";
  if (statuses.has("understood-resource-container")) return "not-applicable";
  if (statuses.has("decoded-readonly") && statuses.size === 1) return "read-only";
  if (statuses.has("custom-media-payload") || statuses.has("preserved-standard-media-payload")) return "preserve-only";
  if (statuses.has("unknown-active-risk") || statuses.has("needs-codec-work") || statuses.has("preserved-unknown")) {
    return statuses.has("decoded-writable") ? "partially-proven" : "writer-gated";
  }
  if (statuses.has("decoded-writable") && (statuses.has("preserved-known") || statuses.has("understood-runtime-writer-gated") || statuses.has("runtime-state"))) {
    return fixtureGate?.available || fixtureGate?.partialOnly ? "partially-proven" : "writer-gated";
  }
  if (statuses.has("decoded-writable")) {
    if (fixtureGate?.partialOnly) return "partially-proven";
    if (fixtureGate?.available) return "fixture-proven";
    return "writer-gated";
  }
  if (statuses.has("understood-runtime-writer-gated")) return "writer-gated";
  if (statuses.has("preserved-known") || statuses.has("preserved-unknown")) return "preserve-only";
  return "writer-gated";
}

function evidenceQualityFor(container, evidence, fixtureGate) {
  if (container.coverageStatus === "ignored-non-scenario") return "cited";
  if (fixtureGate?.evidencePresent === false) return "missing-evidence";
  if (fixtureGate && fixtureGate.evidencePresent !== false && !fixtureGate.available && (fixtureGate.fixturePaths ?? []).length > 0) return "skipped-fixture";
  if (fixtureGate?.available) return "fixture-backed";
  if ((targetCompatibility?.summary?.warnings ?? 0) > 0 && container.role === "resource-fork") return "target-warning";
  if (!evidence.length) return "missing-evidence";
  return "cited";
}

function riskFlagsFor(container, statuses, evidence, fixtureGate) {
  const flags = [];
  if (!evidence.length && container.coverageStatus !== "ignored-non-scenario") flags.push("missing-evidence");
  if (fixtureGate?.evidencePresent === false) flags.push("missing-fixture-gate-evidence");
  if (fixtureGate && fixtureGate.evidencePresent !== false && !fixtureGate.available && (fixtureGate.fixturePaths ?? []).length > 0) flags.push("skipped-fixture");
  if (statuses.has("preserved-unknown")) flags.push("preserved-unknown");
  if (statuses.has("understood-runtime-writer-gated")) flags.push("writer-gated");
  if (container.coverageStatus === "decoded-writable" && !fixtureGate?.available) flags.push("structural-writer-claim");
  if (container.container === "Data DL" && statuses.has("preserved-unknown")) flags.push("dungeon-high-bit-unresolved");
  if (container.role === "resource-fork" && (targetCompatibility?.summary?.warnings ?? 0) > 0) flags.push("target-package-warning");
  return [...new Set(flags)].sort();
}

function summarizeCompletenessTruth(containers, unknownReport) {
  const semanticOwnershipCounts = countBy(containers, (container) => container.truth.semanticOwnership);
  const writerReadinessCounts = countBy(containers, (container) => container.truth.writerReadiness);
  const evidenceQualityCounts = countBy(containers, (container) => container.truth.evidenceQuality);
  const riskFlagCounts = {};
  for (const container of containers) {
    for (const flag of container.truth.riskFlags) {
      riskFlagCounts[flag] = (riskFlagCounts[flag] ?? 0) + 1;
    }
  }
  const totalContainers = containers.length;
  const semanticComplete = semanticOwnershipCounts.complete ?? 0;
  const writerProven = (writerReadinessCounts["fixture-proven"] ?? 0) + (writerReadinessCounts["partially-proven"] ?? 0);
  const packageWarnings = targetCompatibility?.summary?.warnings ?? 0;
  const packageErrors = targetCompatibility?.summary?.errors ?? 0;
  const targetIssues = targetCompatibility?.summary?.targetCompatibilityIssues ?? 0;
  const codecSummary = targetCompatibility?.summary?.completeness?.mediaCodecInternals ?? splitCompletenessSummary({ summary: { statusObservedBytes: {} } }).mediaCodecInternals;
  const strictOutstanding = {
    writerGatedContainers: writerReadinessCounts["writer-gated"] ?? 0,
    missingEvidenceContainers: evidenceQualityCounts["missing-evidence"] ?? 0,
    skippedFixtureContainers: evidenceQualityCounts["skipped-fixture"] ?? 0,
    preservedUnknownContainers: riskFlagCounts["preserved-unknown"] ?? 0,
    targetWarnings: packageWarnings,
    backlogRisks: unknownReport.summary?.backlogRisks ?? 0
  };
  return {
    containerCount: totalContainers,
    semanticOwnershipCounts,
    writerReadinessCounts,
    evidenceQualityCounts,
    riskFlagCounts,
    scenarioSemantics: {
      label: "Scenario Semantics",
      status: strictOutstanding.preservedUnknownContainers > 0 || (semanticOwnershipCounts["needs-format-work"] ?? 0) > 0 ? "mixed" : "complete",
      completeContainers: semanticComplete,
      mixedContainers: semanticOwnershipCounts.mixed ?? 0,
      needsFormatWorkContainers: semanticOwnershipCounts["needs-format-work"] ?? 0,
      percentContainers: percentage(semanticComplete, totalContainers)
    },
    writerProvenData: {
      label: "Writer-Proven Data",
      status: strictOutstanding.writerGatedContainers > 0 || strictOutstanding.skippedFixtureContainers > 0 ? "incomplete" : "complete",
      fixtureProvenContainers: writerReadinessCounts["fixture-proven"] ?? 0,
      partiallyProvenContainers: writerReadinessCounts["partially-proven"] ?? 0,
      writerGatedContainers: writerReadinessCounts["writer-gated"] ?? 0,
      percentContainers: percentage(writerProven, totalContainers)
    },
    packageCompatibility: {
      label: "Package Compatibility",
      status: packageErrors > 0 ? "has-errors" : packageWarnings > 0 ? "has-warnings" : "clean",
      targetCompatibilityIssues: targetIssues,
      warnings: packageWarnings,
      errors: packageErrors
    },
    codecInternals: {
      label: "Codec Internals",
      status: "stage-two-optional",
      preservedOrCustomPayloadBytes: codecSummary.preservedOrCustomPayloadBytes ?? 0,
      decodedResourcePayloadBytes: codecSummary.decodedResourcePayloadBytes ?? 0
    },
    strictOutstanding
  };
}

function countBy(items, selector) {
  const counts = {};
  for (const item of items) {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function percentage(value, total) {
  if (!total) return 0;
  return Number(((value / total) * 100).toFixed(2));
}

function splitCompletenessSummary(ownership) {
  const statusBytes = ownership.summary?.statusObservedBytes ?? {};
  const totalObservedBytes = Object.values(statusBytes).reduce((total, value) => total + Number(value || 0), 0);
  const activeRiskBytes =
    (statusBytes["unknown-active-risk"] ?? 0) +
    (statusBytes["needs-codec-work"] ?? 0) +
    (statusBytes["preserved-unknown"] ?? 0);
  const payloadBytes = resourceByteOwnership?.summary?.statusObservedBytes ?? {};
  return {
    scenarioSemanticOwnership: {
      status: activeRiskBytes === 0 ? "complete-at-scenario-boundary" : "has-active-risk",
      observedBytes: totalObservedBytes - activeRiskBytes,
      totalObservedBytes,
      activeRiskBytes,
      note: "Preserved standard media payloads count as scenario-owned media boundaries, not missing scenario semantics."
    },
    resourceContainerOwnership: {
      status:
        (resourceByteOwnership?.summary?.unparsedResourceForks ?? 0) === 0
          ? "complete-for-observed-resource-forks"
          : "has-unparsed-resource-forks",
      parsedResourceForks: resourceByteOwnership?.summary?.parsedResourceForks ?? 0,
      resourceForkFiles: resourceByteOwnership?.summary?.resourceForkFiles ?? 0,
      resourceEntries: resourceByteOwnership?.summary?.resourceEntries ?? 0
    },
    mediaCodecInternals: {
      status: "stage-two-optional",
      preservedOrCustomPayloadBytes:
        (payloadBytes["preserved-standard-media-payload"] ?? 0) +
        (statusBytes["custom-media-payload"] ?? 0),
      decodedResourcePayloadBytes: payloadBytes["decoded-resource-payload"] ?? 0,
      note: "Full PICT/cicn/snd/custom-music internals are not required for scenario semantic completion."
    }
  };
}

function scanScenarioRoots(scenarios) {
  return scenarios.map((scenario) => {
    const sourcePath = scenario.sourcePath;
    const files = [];
    const ignoredFiles = [];
    if (sourcePath && fs.existsSync(sourcePath)) {
      for (const name of fs.readdirSync(sourcePath).sort()) {
        const fullPath = path.join(sourcePath, name);
        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) continue;
        if (NON_SCENARIO_IGNORES.has(name)) {
          ignoredFiles.push({ name, reason: "OS/Finder metadata" });
          continue;
        }
        const resourceTypes = resourceForkTypesFor(fullPath);
        files.push({
          name,
          bytes: stat.size,
          role: roleForScannedFile(name, stat.size),
          resourceTypes
        });
      }
    } else {
      for (const file of scenario.files ?? []) {
        files.push({
          name: file.name,
          bytes: file.sourceBytes,
          role: roleForScannedFile(file.name, file.sourceBytes, file.role),
          resourceTypes: []
        });
      }
    }
    return {
      name: scenario.name,
      sourceRoot: scenario.sourceRoot,
      sourcePath,
      status: scenario.status,
      fileCount: files.length,
      ignoredFiles,
      files
    };
  });
}

function aggregateFiles(scenarios, scanned) {
  const byName = new Map();
  for (const scenario of scenarios) {
    for (const file of scenario.files ?? []) {
      if (NON_SCENARIO_IGNORES.has(file.name)) continue;
      addFileAggregate(byName, file.name, {
        bytes: file.sourceBytes,
        role: roleForScannedFile(file.name, file.sourceBytes, file.role),
        classification: file.classification,
        scenario: scenario.name
      });
    }
  }
  for (const scenario of scanned) {
    for (const file of scenario.files) {
      if (NON_SCENARIO_IGNORES.has(file.name)) continue;
      addFileAggregate(byName, file.name, {
        bytes: file.bytes,
        role: file.role,
        classification: "scanned",
        scenario: scenario.name,
        resourceTypes: file.resourceTypes
      });
    }
  }
  const files = [...byName.values()].map((file) => {
    const coverageStatus = coverageStatusForFile(file);
    const sourceFileNames = [...file.sourceFileNames].sort((a, b) => a.localeCompare(b));
    return {
      name: file.name,
      scenarioCount: file.scenarios.size,
      roles: [...file.roles].sort(),
      classifications: [...file.classifications].sort(),
      observedByteSizes: [...file.byteSizes].sort((a, b) => a - b),
      ...(file.logicalContainer ? { sourceFileNames } : {}),
      resourceTypes: [...file.resourceTypes.values()].sort((a, b) => a.type.localeCompare(b.type)),
      coverageStatus,
      editable: coverageStatus === "decoded-writable"
    };
  }).sort((a, b) => b.scenarioCount - a.scenarioCount || a.name.localeCompare(b.name));
  return { files };
}

function addFileAggregate(byName, name, entry) {
  const sourceName = name;
  name = logicalContainerNameForFile(name, entry);
  const role = name === SCENARIO_STARTUP_SHELL_CONTAINER ? "supported-binary" : entry.role;
  if (!byName.has(name)) {
    byName.set(name, {
      name,
      scenarios: new Set(),
      roles: new Set(),
      classifications: new Set(),
      byteSizes: new Set(),
      sourceFileNames: new Set(),
      logicalContainer: false,
      resourceTypes: new Map()
    });
  }
  const aggregate = byName.get(name);
  aggregate.scenarios.add(entry.scenario);
  aggregate.roles.add(role);
  aggregate.classifications.add(entry.classification);
  aggregate.byteSizes.add(Number(entry.bytes ?? 0));
  aggregate.sourceFileNames.add(sourceName);
  if (sourceName !== name) aggregate.logicalContainer = true;
  for (const resource of entry.resourceTypes ?? []) {
    const key = resource.type;
    const existing = aggregate.resourceTypes.get(key) ?? { type: resource.type, count: 0, bytes: 0, status: resource.status, role: resource.role };
    existing.count += resource.count;
    existing.bytes += resource.bytes;
    aggregate.resourceTypes.set(key, existing);
  }
}

function logicalContainerNameForFile(name, entry) {
  return isScenarioStartupShellFile(name, entry) ? SCENARIO_STARTUP_SHELL_CONTAINER : name;
}

function isScenarioStartupShellFile(name, entry) {
  const bytes = Number(entry.bytes ?? 0);
  if (bytes !== SCENARIO_STARTUP_SHELL_CORE_BYTES && bytes !== SCENARIO_STARTUP_SHELL_MAX_BYTES) return false;
  if (name === "Data CS" || RECORD_LAYOUTS[name] || PASS_THROUGH_POLICIES[name]) return false;
  if (!entry.scenario) return false;
  return normalizeScenarioShellName(name) === normalizeScenarioShellName(entry.scenario);
}

function normalizeScenarioShellName(name) {
  return String(name ?? "").trim().toLocaleLowerCase("en-US");
}

function coverageStatusForFile(file) {
  const { name, roles } = file;
  if (NON_SCENARIO_IGNORES.has(name)) return "ignored-non-scenario";
  if (name === SCENARIO_STARTUP_SHELL_CONTAINER) return "mixed-writable-preserved";
  if (name === "Scenario" && file.byteSizes?.size > 0 && [...file.byteSizes].every((size) => size === 600)) return "mixed-writable-preserved";
  if (runtimeCaches.entries?.some((entry) => entry.cache === name)) return "runtime-cache";
  if (name === "Data DL" && dungeonByteOwnership) return "mixed-writable-preserved";
  if (name === "Data MD2") return "mixed-writable-preserved";
  if (name === "Layout" && file.byteSizes?.size > 0 && [...file.byteSizes].some((size) => size > (RECORD_LAYOUTS.Layout?.recordBytes ?? 256))) return "mixed-writable-preserved";
  if (customLandlookCoverage && /^Data Custom [123] BD$/.test(name)) return "mixed-writable-preserved";
  if (rulesCoverage && name === "Data Spell") return "mixed-writable-preserved";
  if (RECORD_LAYOUTS[name]) return RECORD_LAYOUTS[name].status;
  if (PASS_THROUGH_POLICIES[name]) return PASS_THROUGH_POLICIES[name].status;
  if (roles.has("supported-binary") && file.byteSizes.size > 0 && [...file.byteSizes].every((size) => size === 316 || size === 320)) return "decoded-writable";
  if (rustRegistry.supportedWriteFiles.has(name)) return "decoded-writable";
  if (roles.has("resource-fork") || name.endsWith(".rsrc") || name.endsWith(".rsf") || name.startsWith("._")) {
    return parsedResourceForkNames.has(name) ? "understood-resource-container" : "preserved-known";
  }
  if (rustRegistry.trackedFiles.has(name)) return "preserved-known";
  return "unknown-active-risk";
}

function byteRangesForFile(file, layout) {
  if (file.name === "Scenario") {
    return [
      { start: 0, length: 23, endExclusive: 23, status: "preserved-known", field: "Divinity editor state", internal: null },
      { start: 23, length: 1, endExclusive: 24, status: "decoded-writable", field: "String editor slot", internal: "divinityStringEditorSlot" },
      { start: 24, length: 14, endExclusive: 38, status: "preserved-known", field: "Divinity editor state", internal: null },
      { start: 38, length: 2, endExclusive: 40, status: "decoded-writable", field: "String editor sound", internal: "divinityStringSoundId" },
      { start: 40, length: 560, endExclusive: 600, status: "preserved-known", field: "Divinity editor/view state", internal: null }
    ];
  }
  if (file.name === SCENARIO_STARTUP_SHELL_CONTAINER) {
    return [
      {
        start: 0,
        length: SCENARIO_STARTUP_SHELL_CORE_BYTES,
        endExclusive: SCENARIO_STARTUP_SHELL_CORE_BYTES,
        status: "decoded-writable",
        field: "Startup shell core fields",
        internal: "reclevel/maxlevel/landlevel/lookx/looky/codeseg1/codeseg2/creatorUser",
        writerGate: "docs/generated/scenario-startup-shell-gate.json"
      },
      {
        start: SCENARIO_STARTUP_SHELL_CORE_BYTES,
        length: SCENARIO_STARTUP_SHELL_MAX_BYTES - SCENARIO_STARTUP_SHELL_CORE_BYTES,
        endExclusive: SCENARIO_STARTUP_SHELL_MAX_BYTES,
        status: "preserved-known",
        field: "Optional imported compatibility tail",
        internal: "trailingBytes",
        writerGate: "docs/generated/scenario-startup-shell-gate.json"
      }
    ];
  }
  if (file.name === "Data CS") {
    return [{
      start: 0,
      length: SCENARIO_STARTUP_SHELL_CORE_BYTES,
      endExclusive: SCENARIO_STARTUP_SHELL_CORE_BYTES,
      status: "decoded-writable",
      field: "Scenario security backup core",
      internal: "reclevel/maxlevel/landlevel/lookx/looky/codeseg1/codeseg2/creatorUser",
      writerGate: "docs/generated/scenario-startup-shell-gate.json"
    }];
  }
  if (file.name === "Layout") {
    const layoutBytes = RECORD_LAYOUTS.Layout.recordBytes;
    const maxObserved = Math.max(layoutBytes, ...(file.observedByteSizes ?? []));
    const ranges = [
      {
        start: 0,
        length: layoutBytes,
        endExclusive: layoutBytes,
        status: "decoded-writable",
        field: "Land layout grid",
        internal: "layout[8][16]",
        writerGate: "docs/generated/maps-storage-writer-gates.json"
      }
    ];
    if (maxObserved > layoutBytes) {
      ranges.push({
        start: layoutBytes,
        length: maxObserved - layoutBytes,
        endExclusive: maxObserved,
        status: "preserved-known",
        field: "Optional layout compatibility tail",
        internal: "trailingBytes",
        writerGate: "docs/generated/maps-storage-writer-gates.json"
      });
    }
    return ranges;
  }
  if (file.name === "Data Spell" && rulesCoverage?.byteOwnership?.["Data Spell"]) {
    return rulesCoverage.byteOwnership["Data Spell"];
  }
  if (file.name === "Data Race" && rulesCoverage?.byteOwnership?.["Data Race"]) {
    return rulesCoverage.byteOwnership["Data Race"];
  }
  if (file.name === "Data Caste" && rulesCoverage?.byteOwnership?.["Data Caste"]) {
    return rulesCoverage.byteOwnership["Data Caste"];
  }
  if (/^Data Custom [123] BD$/.test(file.name) && customLandlookCoverage?.layout) {
    const layout = customLandlookCoverage.layout;
    return [
      {
        start: 0,
        length: layout.baseTileOffset,
        endExclusive: layout.baseTileOffset,
        status: "decoded-writable",
        field: "Custom land tile records",
        internal: "mapstats[201]"
      },
      {
        start: layout.baseTileOffset,
        length: 2,
        endExclusive: layout.baseTileOffset + 2,
        status: "decoded-writable",
        field: "Base tile",
        internal: "basetile"
      },
      {
        start: layout.baseScaleOffset,
        length: 2,
        endExclusive: layout.baseScaleOffset + 2,
        status: "decoded-writable",
        field: "Base scale",
        internal: "basescale"
      },
      ...customLandlookRangeByteRanges(layout)
    ];
  }
  if (file.name === "Data DL" && dungeonByteOwnership?.recordByteRanges?.length) {
    return [
      {
        start: 0,
        length: dungeonByteOwnership.recordLayout?.bytesPerLevel ?? layout?.recordBytes ?? 16200,
        endExclusive: dungeonByteOwnership.recordLayout?.bytesPerLevel ?? layout?.recordBytes ?? 16200,
        status: "decoded-writable",
        field: "Dungeon cell bitfields",
        internal: "field[90][90]",
        bitOwnership: "docs/generated/dungeon-byte-ownership.json",
        bitTaxonomy: "docs/generated/dungeon-cell-bit-taxonomy.json"
      }
    ];
  }
  if (file.name === "Data ED3") {
    return [
      { start: 0, length: 4, endExclusive: 4, status: "decoded-writable", field: "Extra Action Point ID", internal: "doorid", writerGate: "docs/generated/action-point-writer-gate.json" },
      { start: 4, length: 1, endExclusive: 5, status: "decoded-writable", field: "Level", internal: "landid", writerGate: "docs/generated/action-point-writer-gate.json" },
      { start: 5, length: 1, endExclusive: 6, status: "decoded-writable", field: "X", internal: "landx", writerGate: "docs/generated/action-point-writer-gate.json" },
      { start: 6, length: 1, endExclusive: 7, status: "decoded-writable", field: "Y", internal: "landy", writerGate: "docs/generated/action-point-writer-gate.json" },
      { start: 7, length: 1, endExclusive: 8, status: "decoded-writable", field: "Chance", internal: "percent", writerGate: "docs/generated/action-point-writer-gate.json" },
      { start: 8, length: 16, endExclusive: 24, status: "decoded-writable", field: "Action codes", internal: "code[8]", writerGate: "docs/generated/action-point-writer-gate.json" },
      { start: 24, length: 16, endExclusive: 40, status: "decoded-writable", field: "Action IDs", internal: "id[8]", writerGate: "docs/generated/action-point-writer-gate.json" }
    ];
  }
  if (file.name === "Data EDCD") {
    return [0, 1, 2, 3, 4].map((index) => ({
      start: index * 2,
      length: 2,
      endExclusive: index * 2 + 2,
      status: "decoded-writable",
      field: `Parameter ${index + 1}`,
      internal: `extracode[${index}]`,
      writerGate: "docs/generated/action-point-writer-gate.json"
    }));
  }
  if (file.name === "Data ED") {
    return [
      { start: 0, length: 426, endExclusive: 426, status: "decoded-writable", field: "Complete simple encounter row", internal: "semantic fields plus deterministic alignment padding", writerGate: "docs/generated/encounter-shop-writer-gates.json" }
    ];
  }
  if (file.name === "Data ED2") {
    return [
      { start: 0, length: 520, endExclusive: 520, status: "decoded-writable", field: "Complete complex encounter row", internal: "semantic fields plus deterministic alignment padding", writerGate: "docs/generated/encounter-shop-writer-gates.json" }
    ];
  }
  if (file.name === "Data MD2") {
    return [
      { start: 0, length: 60, endExclusive: 60, status: "decoded-writable", field: "Map marker triples", internal: "icon[10][3]", writerGate: "docs/generated/core-record-writer-gates.json" },
      { start: 60, length: 14, endExclusive: 74, status: "decoded-writable", field: "Map start and display fields", internal: "startX/startY/level/pictId/iconSize/show/isDungeon", writerGate: "docs/generated/core-record-writer-gates.json" },
      { start: 74, length: 2, endExclusive: 76, status: "preserved-known", field: "Compatibility bytes", internal: "raw[74..76]", writerGate: "docs/generated/core-record-writer-gates.json" },
      { start: 76, length: 8, endExclusive: 84, status: "decoded-writable", field: "Map clip rectangle", internal: "rect", writerGate: "docs/generated/core-record-writer-gates.json" },
      { start: 84, length: 256, endExclusive: 340, status: "decoded-writable", field: "Map note text", internal: "note", writerGate: "docs/generated/core-record-writer-gates.json" }
    ];
  }
  if (file.name === "Data NI") {
    return [
      { start: 0, length: 56, endExclusive: 56, status: "decoded-writable", field: "Scenario item core fields", internal: "stats/itemId/icon/type/restrictions/categories", writerGate: "docs/generated/core-record-writer-gates.json" },
      { start: 56, length: 14, endExclusive: 70, status: "decoded-writable", field: "Scenario item spare words", internal: "spare2[7]", writerGate: "docs/generated/core-record-writer-gates.json" },
      { start: 70, length: 30, endExclusive: 100, status: "decoded-writable", field: "Scenario item effects and specials", internal: "damage/elements/specials/weightPerCharge/dropOnEmpty", writerGate: "docs/generated/core-record-writer-gates.json" }
    ];
  }
  if (file.name === "Global") {
    return [
      {
        start: 0,
        length: 2,
        endExclusive: 2,
        status: "decoded-writable",
        field: "Start-up macro",
        internal: "globalmacro[0]",
        writerGate: "docs/generated/fixed-record-writer-gates.json"
      },
      {
        start: 2,
        length: 2,
        endExclusive: 4,
        status: "decoded-writable",
        field: "New game macro",
        internal: "globalmacro[1]",
        writerGate: "docs/generated/fixed-record-writer-gates.json"
      },
      {
        start: 4,
        length: 2,
        endExclusive: 6,
        status: "decoded-writable",
        field: "Resume game macro",
        internal: "globalmacro[2]",
        writerGate: "docs/generated/fixed-record-writer-gates.json"
      },
      {
        start: 6,
        length: 2,
        endExclusive: 8,
        status: "preserved-known",
        field: "Reserved global hook slot",
        internal: "globalmacro[3]",
        writerGate: "docs/generated/fixed-record-writer-gates.json"
      },
      {
        start: 8,
        length: 2,
        endExclusive: 10,
        status: "decoded-writable",
        field: "Day-start macro",
        internal: "globalmacro[4]",
        writerGate: "docs/generated/fixed-record-writer-gates.json"
      },
      {
        start: 10,
        length: 2,
        endExclusive: 12,
        status: "decoded-writable",
        field: "Day-end macro",
        internal: "globalmacro[5]",
        writerGate: "docs/generated/fixed-record-writer-gates.json"
      },
      {
        start: 12,
        length: 48,
        endExclusive: 60,
        status: "preserved-known",
        field: "Reserved global hook slots",
        internal: "globalmacro[6..29]",
        writerGate: "docs/generated/fixed-record-writer-gates.json"
      }
    ];
  }
  if (file.name === "Data BD") {
    return [
      {
        start: 0,
        length: 346,
        endExclusive: 346,
        status: "decoded-writable",
        field: "Complete battle row",
        internal: "semantic fields plus deterministic alignment padding",
        writerGate: "docs/generated/fixed-record-writer-gates.json"
      }
    ];
  }
  if (layout?.recordBytes) {
    return [
      {
        start: 0,
        length: layout.recordBytes,
        endExclusive: layout.recordBytes,
        status: layout.status,
        field: layout.label,
        internal: "fixed record",
        writerGate: MAPS_STORAGE_GATE_CONTAINER_SET.has(file.name)
          ? "docs/generated/maps-storage-writer-gates.json"
          : ENCOUNTER_SHOP_GATE_CONTAINER_SET.has(file.name)
            ? "docs/generated/encounter-shop-writer-gates.json"
            : CORE_RECORD_GATE_CONTAINER_SET.has(file.name)
              ? "docs/generated/core-record-writer-gates.json"
              : CORE_FIXED_RECORD_GATE_CONTAINER_SET.has(file.name)
                ? "docs/generated/fixed-record-writer-gates.json"
                : undefined
      }
    ];
  }
  return [
    {
      start: 0,
      length: null,
      endExclusive: null,
      status: file.coverageStatus,
      field: labelForFile(file),
      internal: null
    }
  ];
}

function customLandlookRangeByteRanges(layout) {
  const ranges = [];
  for (let slot = 0; slot < 10; slot += 1) {
    const start = layout.rangeTailOffset + slot * 6;
    ranges.push(
      {
        start,
        length: 2,
        endExclusive: start + 2,
        status: "decoded-writable",
        field: `Tile group ${slot + 1} first tile`,
        internal: `rangeSlots[${slot}].firstTile`,
        writerGate: "docs/generated/custom-landlook-coverage.json"
      },
      {
        start: start + 2,
        length: 2,
        endExclusive: start + 4,
        status: "decoded-writable",
        field: `Tile group ${slot + 1} last tile`,
        internal: `rangeSlots[${slot}].lastTile`,
        writerGate: "docs/generated/custom-landlook-coverage.json"
      },
      {
        start: start + 4,
        length: 2,
        endExclusive: start + 6,
        status: "preserved-known",
        field: `Tile group ${slot + 1} reserved word`,
        internal: `rangeSlots[${slot}].reserved`,
        writerGate: "docs/generated/custom-landlook-coverage.json"
      }
    );
  }
  return ranges;
}

function summarizeOwnership(containers) {
  const statusCounts = {};
  const statusObservedBytes = {};
  for (const container of containers) {
    statusCounts[container.coverageStatus] = (statusCounts[container.coverageStatus] ?? 0) + 1;
    statusObservedBytes[container.coverageStatus] =
      (statusObservedBytes[container.coverageStatus] ?? 0) +
      container.observedByteSizes.reduce((sum, size) => sum + size * container.observedScenarioCount, 0);
  }
  return {
    containerCount: containers.length,
    statusCounts,
    statusObservedBytes
  };
}

function evidenceForFile(name, status) {
  const evidence = [];
  if (MAPS_STORAGE_GATE_CONTAINER_SET.has(name)) {
    evidence.push("docs/generated/maps-storage-writer-gates.json");
  }
  if (ENCOUNTER_SHOP_GATE_CONTAINER_SET.has(name)) {
    evidence.push("docs/generated/encounter-shop-writer-gates.json");
  }
  if (CORE_RECORD_GATE_CONTAINER_SET.has(name)) {
    evidence.push("docs/generated/core-record-writer-gates.json");
  }
  if (CORE_FIXED_RECORD_GATE_CONTAINER_SET.has(name)) {
    evidence.push("docs/generated/fixed-record-writer-gates.json");
  }
  if (name === "Data DL") {
    evidence.push("docs/generated/dungeon-byte-ownership.json");
    evidence.push("docs/generated/dungeon-cell-bit-taxonomy.json");
    evidence.push("docs/generated/dungeon-high-bit-audit.json");
    evidence.push("docs/format-evidence-cards/dungeon-runtime-anchors.md");
  } else if (name === SCENARIO_STARTUP_SHELL_CONTAINER || name === "Data CS") {
    evidence.push("docs/generated/scenario-startup-shell-gate.json");
    evidence.push("docs/generated/scenario-shell-evidence.json");
    evidence.push("docs/format-evidence-cards/scenario-startup-runtime-anchors.md");
    evidence.push("docs/format-evidence-cards/scenario-shell-startup-release.md");
  } else if (name === "Data ED3") {
    evidence.push("docs/generated/action-point-writer-gate.json");
    evidence.push("docs/generated/extra-ap-reachability-source-map.json");
    evidence.push("docs/format-evidence-cards/action-point-extra-ap-storage-reachability.md");
  } else if (name === "Data EDCD") {
    evidence.push("docs/generated/action-point-writer-gate.json");
    evidence.push("docs/generated/opcode-edcd-crosswalk.json");
    evidence.push("docs/format-evidence-cards/edcd-opcode-source-map.md");
  } else if (name === "Data OD" || name === "Data SD2") {
    evidence.push("docs/format-evidence-cards/strings-data-od-string-sound.md");
  } else if (/^Data Custom [123] BD$/.test(name)) {
    evidence.push("docs/generated/custom-landlook-coverage.json");
    evidence.push("docs/format-evidence-cards/custom-landlook-writers.md");
  } else if (name === "Data Spell" || name === "Data Race" || name === "Data Caste") {
    evidence.push("docs/generated/rules-resource-coverage.json");
    evidence.push("docs/generated/rules-name-resource-packaging.json");
    evidence.push("docs/format-evidence-cards/rules-spell-race-caste-runtime-anchors.md");
  } else if (name === "Data LD" || name === "Layout") {
    evidence.push("docs/generated/map-field-value-evidence.json");
    evidence.push("docs/format-evidence-cards/map-tile-runtime-anchors.md");
  } else if (name === "Data DD" || name === "Data DDD" || name === "Global") {
    evidence.push("docs/generated/extra-ap-reachability-source-map.json");
    evidence.push("docs/format-evidence-cards/action-point-extra-ap-storage-reachability.md");
  } else if (name === "Data RD" || name === "Data RDD") {
    evidence.push("docs/generated/corpus-field-usage.json");
    evidence.push("docs/format-evidence-cards/encounter-record-runtime-anchors.md");
  } else if (name === "Data ED" || name === "Data ED2") {
    evidence.push("docs/generated/encounter-record-evidence.json");
    evidence.push("docs/format-evidence-cards/encounter-record-runtime-anchors.md");
  } else if (name === "Data MD" || name === "Data MD1" || name === "Data MD-1") {
    evidence.push("docs/generated/monster-record-evidence.json");
    evidence.push("docs/format-evidence-cards/monster-record-runtime-anchors.md");
  } else if (name === "Data DES") {
    evidence.push("docs/format-evidence-cards/monster-descriptions-and-sets-runtime-anchors.md");
  } else if (name === "Data BD") {
    evidence.push("docs/generated/battle-record-evidence.json");
    evidence.push("docs/format-evidence-cards/battle-record-runtime-anchors.md");
  } else if (name === "Data SD" || name === "Data TD" || name === "Data TD2" || name === "Data TD3") {
    evidence.push("docs/format-evidence-cards/item-treasure-shop-runtime-anchors.md");
    if (name === "Data TD2" || name === "Data TD3") evidence.push("docs/format-evidence-cards/thief-timed-encounter-runtime-anchors.md");
  } else if (name === "Data MD2") {
    evidence.push("docs/generated/map-record-evidence.json");
    evidence.push("docs/format-evidence-cards/map-record-runtime-anchors.md");
  } else if (name === "Data CI" || name === "Data RI") {
    evidence.push("docs/generated/scenario-party-restrictions-evidence.json");
    evidence.push("docs/format-evidence-cards/scenario-party-restrictions-runtime-anchors.md");
  } else if (name === "Data NI") {
    evidence.push("docs/generated/core-rules-record-evidence.json");
    evidence.push("docs/format-evidence-cards/core-rules-record-runtime-anchors.md");
  } else if (name === "Data Solids") {
    evidence.push("docs/format-evidence-cards/map-tile-intelligence.md");
    evidence.push("docs/format-evidence-cards/map-tile-runtime-anchors.md");
  } else if (name === "Data CS") {
    evidence.push("docs/format-evidence-cards/scenario-shell-startup-release.md");
  } else if (name === "Scenario") {
    evidence.push("docs/generated/preserved-byte-triage.json");
    evidence.push("src-tauri/src/realmz/scenario.rs:scenario_support_file_compiles_bounded_editor_state_without_raw_identity");
    evidence.push("src-tauri/src/exporter.rs:scenario_metadata_legacy_identity_comes_only_from_annex");
    evidence.push("scripts/check_browser_scenario_package.mjs");
    evidence.push("scripts/run_authoritative_scenario_proof.mjs");
  } else if (name === "Scenario.rsrc") {
    evidence.push("docs/generated/resource-byte-ownership.json");
    evidence.push("docs/format-evidence-cards/resource-fork-taxonomy-authoring.md");
    evidence.push("docs/format-evidence-cards/scenario-resource-fork-minimum.md");
    evidence.push("src-tauri/src/resource_fork.rs:minimum_scenario_resource_fork_is_canonical_empty_container");
    evidence.push("src/editor/browser/resourceFork.test.ts:builds the canonical empty scenario resource container");
    evidence.push("scripts/check_generated_scenario_baseline.mjs");
    evidence.push("scripts/run_authoritative_scenario_proof.mjs");
  } else if (name.endsWith(".rsrc") || name.endsWith(".rsf") || name.startsWith("._")) {
    evidence.push("docs/generated/resource-byte-ownership.json");
    evidence.push("docs/format-evidence-cards/resource-fork-taxonomy-authoring.md");
  } else if (name === "Format" || name === "Icon_" || /^Custom [1-9]( Music)?$/.test(name)) {
    evidence.push("docs/generated/scenario-target-compatibility.json");
    evidence.push("docs/format-evidence-cards/scenario-music-and-format-files.md");
  } else if (status === "decoded-writable") {
    evidence.push("docs/generated/corpus-field-usage.json");
    evidence.push("docs/format-evidence-cards/scenario-shell-startup-release.md");
  } else if (status === "runtime-cache") {
    evidence.push("docs/generated/runtime-cache-classification.json");
  } else if (status === "unknown-active-risk") {
    evidence.push("docs/generated/unknown-data-backlog.json");
  }
  return evidence;
}

function editorPolicyFor(status, name) {
  if (name === "Scenario.rsrc") {
    return "Fresh projects compile the canonical zero-entry resource container; project-owned resource payloads are added by their supported semantic workflows, while imported extras remain compatibility data.";
  }
  switch (status) {
    case "decoded-writable":
      return "Editable fields may be written when the record-specific writer owns the byte range.";
    case "decoded-readonly":
      return "Decoded for inspection and validation; editing is hidden until writer coverage exists.";
    case "mixed-writable-preserved":
      return "Some byte ranges are writer-proven or structurally decoded, while preserved/runtime ranges remain read-only.";
    case "preserved-known":
      return "Known scenario payload preserved byte-for-byte unless explicitly imported into a supported editor workflow.";
    case "preserved-unknown":
      return "Preserved byte-for-byte; format ownership is not yet proven.";
    case "runtime-cache":
      return "Runtime/generated state. Providence inspects it only when useful and writes the authored source file instead.";
    case "ignored-non-scenario":
      return "Ignored as non-scenario metadata or packaging documentation.";
    case "understood-resource-container":
      return "Resource fork container, map, type, reference, name, and data-entry bytes are inventoried. Payload codec ownership is tracked separately.";
    case "decoded-resource-payload":
      return "Resource payload bytes are decoded for reference or validation; normal editing still follows supported project-owned resource workflows.";
    case "preserved-standard-media-payload":
      return "Standard classic media payload preserved byte-for-byte until the specific resource is replaced through a supported import workflow.";
    case "custom-media-payload":
      return "Scenario-owned custom media payload preserved byte-for-byte until a dedicated codec writer owns the format.";
    case "needs-codec-work":
      return "Resource payload or container needs further codec archaeology before semantic ownership can be claimed.";
    case "understood-runtime-writer-gated":
      return "Runtime behavior and byte ownership are understood; normal editing remains gated to fixture-proven writer paths.";
    default:
      return "Needs format work before Providence can claim safe authoring behavior.";
  }
}

function roleForScannedFile(name, bytes, fallbackRole) {
  if (name === "Scenario" && bytes === 600) return "supported-binary";
  if (fallbackRole) return fallbackRole;
  if (rustRegistry.supportedWriteFiles.has(name)) return "supported-binary";
  if (name === "Scenario" || name.endsWith(".rsrc") || name.endsWith(".rsf") || name.startsWith("._")) return "resource-fork";
  if (rustRegistry.trackedFiles.has(name)) return "pass-through";
  return "unknown";
}

function resourceForkTypesFor(filePath) {
  const name = path.basename(filePath);
  if (name === "Scenario" && fs.statSync(filePath).size === 600) return [];
  if (!(name === "Scenario" || name.endsWith(".rsrc") || name.endsWith(".rsf") || name.startsWith("._"))) return [];
  try {
    const size = fs.statSync(filePath).size;
    if (size > MAX_RESOURCE_FORK_BYTES_TO_SCAN) return [{ type: "large-resource-fork", count: 1, bytes: size, status: "preserved-known", role: "large resource fork" }];
    const buffer = fs.readFileSync(filePath);
    const groups = parseResourceForkEntries(buffer)
      .reduce((groups, entry) => {
        const policy = RESOURCE_TYPE_POLICIES[entry.type] ?? { status: "preserved-unknown", role: "resource" };
        const group = groups.get(entry.type) ?? { type: entry.type, count: 0, bytes: 0, status: policy.status, role: policy.role };
        group.count += 1;
        group.bytes += entry.length;
        groups.set(entry.type, group);
        return groups;
      }, new Map());
    return [...groups.values()];
  } catch {
    return [];
  }
}

function parseResourceForkEntries(buffer) {
  buffer = extractResourceForkBuffer(buffer);
  if (buffer.length < 16) return [];
  const dataOffset = u32At(buffer, 0);
  const mapOffset = u32At(buffer, 4);
  const dataLength = u32At(buffer, 8);
  const mapLength = u32At(buffer, 12);
  if ([dataOffset, mapOffset, dataLength, mapLength].some((value) => value === null)) return [];
  if (dataOffset + dataLength > buffer.length || mapOffset + mapLength > buffer.length) return [];
  const typeListRelativeOffset = u16At(buffer, mapOffset + 24);
  if (typeListRelativeOffset === null) return [];
  const typeListOffset = mapOffset + typeListRelativeOffset;
  const typeCountMinusOne = u16At(buffer, typeListOffset);
  if (typeCountMinusOne === null) return [];
  if (typeCountMinusOne + 1 > MAX_RESOURCE_TYPES) return [];
  const entries = [];
  for (let typeIndex = 0; typeIndex <= typeCountMinusOne; typeIndex += 1) {
    const typeOffset = typeListOffset + 2 + typeIndex * 8;
    if (typeOffset + 8 > buffer.length) break;
    const type = textAt(buffer, typeOffset, 4);
    const resourceCountMinusOne = u16At(buffer, typeOffset + 4);
    const refListOffset = u16At(buffer, typeOffset + 6);
    if (resourceCountMinusOne === null || refListOffset === null) continue;
    if (resourceCountMinusOne + 1 > MAX_RESOURCES_PER_TYPE) continue;
    for (let refIndex = 0; refIndex <= resourceCountMinusOne; refIndex += 1) {
      const refOffset = typeListOffset + refListOffset + refIndex * 12;
      if (refOffset + 12 > buffer.length) break;
      const id = i16At(buffer, refOffset);
      const dataRelative = u24At(buffer, refOffset + 5);
      if (id === null || dataRelative === null) continue;
      const dataEntryOffset = dataOffset + dataRelative;
      const length = u32At(buffer, dataEntryOffset);
      if (length === null || dataEntryOffset + 4 + length > buffer.length) continue;
      entries.push({ type, id, length });
    }
  }
  return entries;
}

function extractResourceForkBuffer(buffer) {
  if (buffer.length < 26) return buffer;
  const magic = u32At(buffer, 0);
  if (magic !== APPLE_SINGLE_MAGIC && magic !== APPLE_DOUBLE_MAGIC) return buffer;
  const entryCount = u16At(buffer, 24);
  if (entryCount === null) return buffer;
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = 26 + index * 12;
    const entryId = u32At(buffer, entryOffset);
    const offset = u32At(buffer, entryOffset + 4);
    const length = u32At(buffer, entryOffset + 8);
    if (entryId === RESOURCE_FORK_ENTRY_ID && offset !== null && length !== null && offset + length <= buffer.length) {
      return buffer.subarray(offset, offset + length);
    }
  }
  return buffer;
}

function parseRustRegistry(source) {
  return {
    supportedWriteFiles: parseRustStringArray(source, "SUPPORTED_WRITE_FILES"),
    trackedFiles: parseRustStringArray(source, "TRACKED_FILES")
  };
}

function parseRustStringArray(source, name) {
  const match = source.match(new RegExp(`pub const ${name}: \\&\\[\\&str\\] = \\&\\[([\\s\\S]*?)\\];`));
  if (!match) return new Set();
  return new Set([...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]));
}

function ed3Summary() {
  const pathToFile = path.join(repoRoot, "docs/generated/extra-ap-reachability-source-map.json");
  const data = readJson(pathToFile);
  const gate = actionPointWriterGate?.gates?.find((entry) => entry.container === "Data ED3");
  return {
    status: "Extra Action Point storage is fixed-row writer-proven; normal authoring remains reachability-gated.",
    recordBytes: data.storage?.recordBytes ?? 40,
    writerStatus: gate?.writerStatus ?? null,
    semanticExposure: gate?.semanticExposure ?? "reachability-gated",
    runtimeCallsites: data.loaddoor2CallsiteAudit?.totalRuntimeCallsites ?? null,
    evidence: [
      "docs/generated/action-point-writer-gate.json",
      "docs/generated/extra-ap-reachability-source-map.json"
    ]
  };
}

function edcdSummary() {
  const pathToFile = path.join(repoRoot, "docs/generated/opcode-edcd-crosswalk.json");
  const data = readJson(pathToFile);
  const gate = actionPointWriterGate?.gates?.find((entry) => entry.container === "Data EDCD");
  return {
    status: "Action parameter row storage is fixed-row writer-proven; field labels remain opcode-crosswalk-gated.",
    edcdBackedOpcodes: data.summary?.edcdBacked ?? null,
    fieldComparisonGaps: data.summary?.fieldComparisonGaps?.length ?? null,
    writerStatus: gate?.writerStatus ?? null,
    semanticExposure: gate?.semanticExposure ?? "opcode-crosswalk-gated",
    evidence: [
      "docs/generated/action-point-writer-gate.json",
      "docs/generated/opcode-edcd-crosswalk.json"
    ]
  };
}

function dungeonSummary() {
  if (!dungeonByteOwnership) {
    return {
      status: "Dungeon bit coverage has not been generated yet.",
      bits: null,
      writerSafeBits: null,
      runtimeStateBits: null,
      preservedUnknownBits: null,
      preservedKnownBits: null,
      evidence: "docs/generated/dungeon-byte-ownership.json"
    };
  }
  const bitStatuses = dungeonByteOwnership.summary?.bitStatuses ?? {};
  const writerStatuses = dungeonByteOwnership.summary?.writerStatuses ?? {};
  return {
    status: "Dungeon cells are classified as signed-short bitfields with per-bit ownership.",
    bits: dungeonByteOwnership.bitOwnership?.length ?? 16,
    writerSafeBits: writerStatuses["writer-safe-primitive"] ?? 0,
    routedWorkflowBits:
      (writerStatuses["route-through-note-workflow"] ?? 0) +
      (writerStatuses["route-through-action-point-workflow"] ?? 0),
    runtimeStateBits: bitStatuses["runtime-state"] ?? 0,
    preservedUnknownBits: bitStatuses["preserved-unknown"] ?? 0,
    preservedKnownBits: bitStatuses["preserved-known"] ?? 0,
    evidence: "docs/generated/dungeon-byte-ownership.json"
  };
}

function labelForFile(file) {
  if (file.name === SCENARIO_STARTUP_SHELL_CONTAINER) return SCENARIO_STARTUP_SHELL_CONTAINER;
  if (file.roles.includes("supported-binary") && file.observedByteSizes?.every((size) => size === 316 || size === 320)) return "Scenario startup shell";
  if (file.resourceTypes?.length) return "Resource fork";
  if (file.roles.includes("resource-fork")) return "Resource fork";
  if (file.roles.includes("pass-through")) return "Preserved scenario file";
  return "Scenario file";
}

function statusSort(status) {
  return {
    "unknown-active-risk": 0,
    "preserved-unknown": 1,
    "needs-codec-work": 2,
    "decoded-readonly": 3,
    "runtime-cache": 4,
    "mixed-writable-preserved": 5,
    "preserved-known": 6,
    "custom-media-payload": 7,
    "preserved-standard-media-payload": 8,
    "understood-resource-container": 9,
    "decoded-resource-payload": 10,
    "decoded-writable": 11,
    "ignored-non-scenario": 12
  }[status] ?? 99;
}

function u16At(buffer, offset) {
  if (offset < 0 || offset + 2 > buffer.length) return null;
  return buffer.readUInt16BE(offset);
}

function i16At(buffer, offset) {
  if (offset < 0 || offset + 2 > buffer.length) return null;
  return buffer.readInt16BE(offset);
}

function u24At(buffer, offset) {
  if (offset < 0 || offset + 3 > buffer.length) return null;
  return (buffer[offset] << 16) | (buffer[offset + 1] << 8) | buffer[offset + 2];
}

function u32At(buffer, offset) {
  if (offset < 0 || offset + 4 > buffer.length) return null;
  return buffer.readUInt32BE(offset);
}

function textAt(buffer, offset, length) {
  return buffer.subarray(offset, offset + length).toString("latin1");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readOptionalJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}
