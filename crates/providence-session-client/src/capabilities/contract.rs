//! Task ownership and evidence accompany the executable route, not a second command authority.
use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthoringContract {
    pub task: &'static str,
    pub owner: String,
    pub prerequisites: Vec<&'static str>,
    pub history_scope: &'static str,
    pub verification: Verification,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Verification {
    pub status: &'static str,
    pub checks: Vec<&'static str>,
    pub limitation: &'static str,
}

pub(super) fn describe(method: &str, mutation: bool) -> AuthoringContract {
    let (task, owner, prerequisite) = feature(method);
    let mut prerequisites = vec![
        "Open project; exact project identity, session generation and expected revision",
        prerequisite,
    ];
    let history_scope = if method == "project.import-classic-scenario.begin" {
        "private import preparation; no project Undo entry"
    } else if method == "project.import-classic-scenario.commit" {
        "initial imported baseline; no Undo entry"
    } else if method == "export.inspect-artifact" {
        "artifact inspection; no project Undo entry"
    } else if method.starts_with("export.") {
        "export job; filesystem publication outside project Undo/Redo"
    } else if method.starts_with("paint-resources.") {
        "local paint resources; outside project Undo/Redo"
    } else if method.starts_with("history.") {
        "shared-history-head"
    } else if method == "project.save" {
        "checkpoint; no Undo entry"
    } else if method.starts_with("project.compile-") {
        "filesystem-publication; outside Undo"
    } else if method.starts_with("validation.") || method.starts_with("readiness.") {
        "derived-job-or-diagnostic; no project Undo entry"
    } else if mutation {
        prerequisites.push(
            "No active or disconnected native draft; exact prepared change token before MCP commit",
        );
        "project; one shared Undo entry per committed change set"
    } else {
        "read-only; no Undo entry"
    };
    AuthoringContract {
        task,
        owner: format!("crates/providence-native-adapter/src/{owner}.rs"),
        prerequisites,
        history_scope,
        verification: verification(method),
    }
}

type Feature = (
    &'static [&'static str],
    &'static str,
    &'static str,
    &'static str,
);
const FEATURES: &[Feature] = &[
    (
        &["terrain-generation", "map-connectivity"],
        "terrain-generation",
        "terrain_generation",
        "Exact reviewed artwork, selected area, fixed landmarks and conservative ordinary walking; scripts and transport remain unresolved",
    ),
    (
        &["special-land-solidity"],
        "initialize-special-land-collision",
        "special_land_solidity",
        "Absent scenario table, explicit 1024-byte native source and exact reviewed SHA-256; existing rules require the cell workflow",
    ),
    (
        &["classic-rule-selection"],
        "imported-classic-rule-choice",
        "classic_rule_selection",
        "Retained source-set hash and explicit author-configured selection; no inferred menu choice",
    ),
    (
        &["export"],
        "captured-export-jobs",
        "shared_host/export_jobs",
        "Configured output root, exact capture revision/support; submission acknowledgement is separate from publication outcome",
    ),
    (
        &["action-settings"],
        "guided-action-settings-repair",
        "extra_code_commands/repair",
        "Source-bound Random Message/Random Area draft; inspect exact shared callers and native preview before commit",
    ),
    (
        &["media"],
        "scenario-media",
        "stored_routes/media_authoring",
        "Supported native codecs and exact resource ownership; file imports require per-client input grants and native review",
    ),
    (
        &["project-asset"],
        "scenario-media-catalog",
        "document_catalogs",
        "Bounded scenario-owned descriptors and typed uses; stock resources are not copied into the scenario",
    ),
    (
        &["land-cell"],
        "land-cell-behavior",
        "land_cell_behavior",
        "Native secret/placement encoder and shared special-resource solidity; no party reachability claim",
    ),
    (
        &["smart-terrain", "terrain-mapping"],
        "smart-terrain",
        "terrain_atlas",
        "Exact resolved atlas and reviewed mappings; inspect protected and unresolved cells",
    ),
    (
        &["random-region"],
        "random-regions",
        "random_regions",
        "Native slots 0–19, exclusive edges and reference checks; imported untouched residue remains source-owned",
    ),
    (
        &["paint-resources", "map-stamp"],
        "stamps-and-palettes",
        "paint_resources",
        "Catalog availability, local resource revision and native placement preview; local resources are outside project Undo",
    ),
    (
        &["monster-appearance"],
        "monster-artwork",
        "stored_routes/monsters",
        "Exact base/facing pair resolution; a missing or ambiguous resource remains unavailable",
    ),
    (
        &["player-map"],
        "player-maps",
        "session_routes/player_maps",
        "Allocate through Providence; retain ten markers and exact resource identities; notes and names use MacRoman limits",
    ),
    (
        &["message", "text"],
        "native-strings",
        "session_routes/text",
        "Use the native allocator and MacRoman byte limits",
    ),
    (
        &["option-label", "quest", "quest-label"],
        "story-labels",
        "session_routes/story_labels",
        "Labels describe native slots; they are not executable quest definitions",
    ),
    (
        &["global-macro"],
        "global-hooks",
        "session_routes/global_macros",
        "Targets are existing XAPs; zero is unassigned",
    ),
    (
        &["action-point"],
        "placed-action-points",
        "session_routes/action_points",
        "Existing map and native coordinate; initial activation does not establish party eligibility",
    ),
    (
        &["extra-action-point"],
        "reusable-scripts",
        "session_routes/extra_action_points",
        "Native allocation and shared Extra Code ownership",
    ),
    (
        &["action-definition", "action-form", "action-target"],
        "instruction-authoring",
        "session_routes/action_authoring",
        "Inspect native opcode, operand and caller-specific settings before editing",
    ),
    (
        &["reference"],
        "typed-references",
        "session_routes/references",
        "Exact owning field and valid native target",
    ),
    (
        &["encounter"],
        "encounters",
        "session_routes/encounters",
        "Native result numbering, caller context and record-specific field limits",
    ),
    (
        &["monster", "monster-description"],
        "monsters",
        "session_routes/monsters",
        "Allocate identities; retain difficulty-set identity and native text limits",
    ),
    (
        &["battle"],
        "battles",
        "session_routes/battles",
        "Native allocation/copy guard and valid signed Monster placements",
    ),
    (
        &["treasure", "shop"],
        "rewards-and-shops",
        "session_routes/economy",
        "Native allocation and valid item targets; shop category terminators remain meaningful",
    ),
    (
        &["item"],
        "items",
        "stored_routes/items",
        "Reviewed scenario allocation; Stock mechanics remain read-only",
    ),
    (
        &["spell"],
        "spells",
        "spell_drafts",
        "Allocate Custom slots; distinguish record index and packed Classic spell number",
    ),
    (
        &["rule"],
        "race-and-caste-authoring",
        "rule_drafts",
        "Configure the application rule library; allocate Custom identities through native ownership; author numbers are 0–29 and canonical IDs are 1–30",
    ),
    (
        &["race-rule", "caste-rule"],
        "race-and-caste-rules",
        "session_routes/rules",
        "Author numbers are zero-based; canonical identities remain one-based",
    ),
    (
        &["level-settings"],
        "level-settings",
        "level_settings",
        "Edit named settings; inspect shared Custom Landlook impact and preserve imported source descriptors and random regions",
    ),
    (
        &["map", "dungeon-cell"],
        "maps-and-cells",
        "session_routes/maps",
        "Native map geometry and protected marker/secret/feature bits",
    ),
    (
        &["land-layout"],
        "land-transitions",
        "session_routes/land_layout",
        "Native Land layout coordinates and valid map targets",
    ),
    (
        &["magic-brush"],
        "semantic-painting",
        "stored_routes/world",
        "Reviewed artwork mappings and revision-bound preview; unavailable connections cannot be inferred",
    ),
    (
        &["discovery"],
        "flow-and-discovery",
        "stored_routes/discovery",
        "Bounded derived projections; references and quest relationships do not prove execution order or reachability",
    ),
    (
        &["history"],
        "shared-history",
        "session_routes/overview",
        "No native draft; current shared history head, including other clients' changes",
    ),
    (
        &["validation", "readiness"],
        "validation",
        "validation_jobs",
        "Captured revision and explicit configured support identities",
    ),
    (
        &["project"],
        "review-and-delivery",
        "stored_routes/project",
        "Explicit support and authorized output root; strict readiness for publication",
    ),
    (
        &[
            "scenario-contact",
            "scenario-startup",
            "scenario-restrictions",
            "start-location",
        ],
        "scenario-settings",
        "session_routes/scenario",
        "Native startup, map references and party restrictions",
    ),
    (
        &["record"],
        "native-record-discovery",
        "session_routes/overview",
        "Bounded native records and exact stable identities",
    ),
];

fn feature(method: &str) -> (&'static str, &'static str, &'static str) {
    if let Some(contract) = super::reference_media::contract(method) {
        return contract;
    }
    if method.starts_with("project.import-classic-scenario.") {
        return (
            "classic-scenario-import",
            "scenario_import/jobs",
            "New unedited project, explicit granted input directories and native import job; imported baseline is outside Undo",
        );
    }
    if method == "project.inspect-classic-scenario-import" {
        return (
            "classic-scenario-import-preflight",
            "scenario_preflight/inspection",
            "Explicit granted Classic scenario/application directories; no inferred parent support paths",
        );
    }
    if method == "quest.flow" {
        return (
            "flow-and-discovery",
            "stored_routes/discovery",
            "Quest checks and changes are derived state relationships, not execution order or party reachability",
        );
    }
    let family = method.split('.').next().unwrap_or_default();
    let (task, owner, prerequisite) = FEATURES
        .iter()
        .find_map(|(families, task, owner, prerequisite)| {
            families
                .contains(&family)
                .then_some((*task, *owner, *prerequisite))
        })
        .unwrap_or_else(|| panic!("Capability {method} needs an explicit author-task contract"));
    let owner = if matches!(
        method,
        "rule.catalog" | "rule.open-authoring" | "rule.used-by"
    ) {
        "rule_catalog"
    } else {
        owner
    };
    (task, owner, prerequisite)
}

fn verification(method: &str) -> Verification {
    let checks = regression_checks(method);
    Verification {
        status: if checks.is_empty() {
            "route-certification-pending"
        } else {
            "process-regression-defined"
        },
        checks,
        limitation: "A defined regression is not a passing receipt, complete task coverage, preservation certification or runtime proof. Output schemas and unlisted task operations remain separate gates.",
    }
}

fn regression_checks(method: &str) -> Vec<&'static str> {
    let authoring = PROCESS_REGRESSION_METHODS.contains(&method);
    let export = EXPORT_REGRESSION_METHODS.contains(&method);
    let reference_media = super::reference_media::contract(method).is_some();
    let export_job = method.starts_with("export.");
    let import = method == "project.inspect-classic-scenario-import"
        || method.starts_with("project.import-classic-scenario.")
        || method.starts_with("classic-rule-selection.");
    let world = WORLD_REGRESSION_METHODS.contains(&method);
    let media = MEDIA_REGRESSION_METHODS.contains(&method);
    let repair = super::repairs::stageable(method) || method == "action-settings.commit-repair";
    let local_paint = LOCAL_PAINT_REGRESSION_METHODS.contains(&method);
    let mut checks = Vec::new();
    for (covered, check) in [
        (
            matches!(
                method,
                "action-form.describe" | "action-form.shared-impact" | "action-target.list"
            ),
            "tools/verify-mcp-action-queries.py",
        ),
        (authoring, "tools/verify-mcp-authoring-contracts.py"),
        (export, "tools/verify-mcp-exports.py"),
        (reference_media, "tools/verify-mcp-reference-media.py"),
        (export_job, "tools/verify-mcp-export-jobs.py"),
        (export_job, "tools/verify-mcp-replacement.py"),
        (import, "tools/verify-mcp-classic-import.py"),
        (world, "tools/verify-mcp-world.py"),
        (media, "tools/verify-mcp-media.py"),
        (repair, "tools/verify-mcp-repairs.py"),
        (local_paint, "tools/verify-mcp-local-paint.py"),
        (
            method.starts_with("terrain-generation.") || method == "map-connectivity.preview",
            "tools/verify-terrain-generation.py",
        ),
    ] {
        if covered {
            checks.push(check);
        }
    }
    if !checks.is_empty() && method.starts_with("rule.") {
        checks.push("tools/mcp_rule_journey.py");
    }
    checks
}

const LOCAL_PAINT_REGRESSION_METHODS: &[&str] = &[
    "paint-resources.allocate",
    "paint-resources.capture",
    "paint-resources.geometry",
    "paint-resources.preview",
    "paint-resources.preview-features",
    "paint-resources.apply",
    "paint-resources.operation-status",
    "paint-resources.open",
    "paint-resources.list",
    "map-stamp.apply",
];

const MEDIA_REGRESSION_METHODS: &[&str] = &[
    "media.import.allocate",
    "media.import.prepare",
    "media.import.commit",
    "media.open",
    "media.metadata.apply",
    "media.remove.prepare",
    "media.remove.commit",
    "project-asset.list",
];

const WORLD_REGRESSION_METHODS: &[&str] = &[
    "terrain-mapping.open",
    "terrain-mapping.review",
    "terrain-mapping.accept",
    "land-cell.open",
    "land-cell.preview",
    "land-cell.apply",
    "smart-terrain.open",
    "smart-terrain.reshape",
    "smart-terrain.preview",
    "smart-terrain.apply",
    "random-region.open",
    "random-region.preview",
    "random-region.apply",
    "random-region.clear",
    "paint-resources.list",
    "paint-resources.open",
    "map-stamp.preview",
    "map-stamp.apply",
    "map.region",
    "map.region-preview",
    "map.tile-catalog",
    "map.apply-intent",
    "dungeon-cell.apply-features",
];

const EXPORT_REGRESSION_METHODS: &[&str] = &[
    "monster-appearance.list",
    "monster-appearance.open",
    "monster.operation.prepare",
    "extra-action-point.create",
    "extra-action-point.step.apply",
    "validation.list",
    "project.compile-classic-slice",
    "project.compile-rebuilt-package",
];

const PROCESS_REGRESSION_METHODS: &[&str] = &[
    "rule.catalog",
    "rule.open-authoring",
    "rule.allocation.review",
    "rule.clear.review",
    "rule.draft.prepare",
    "rule.draft.apply",
    "rule.used-by",
    "level-settings.open",
    "level-settings.preview",
    "level-settings.apply",
    "scenario-startup.validate",
    "scenario-startup.update",
    "scenario-contact.validate",
    "scenario-contact.update",
    "scenario-restrictions.validate",
    "scenario-restrictions.update",
    "item.allocation.review",
    "item.list",
    "item.open",
    "item.draft.prepare",
    "item.draft.apply",
    "item.clear.review",
    "player-map.list",
    "player-map.open",
    "player-map.validate",
    "player-map.create",
    "player-map.apply-draft",
    "text.allocate",
    "text.apply-draft",
    "message.open",
    "message.list",
    "discovery.preview",
    "discovery.links",
    "discovery.flow",
    "map.create",
    "map.region",
    "action-point.create",
    "action-point.open",
    "action-point.apply-draft",
    "action-point.list",
    "start-location.set",
    "history.undo",
    "history.redo",
    "encounter.prepare-create",
    "encounter.create-rogue",
    "encounter.create-timed",
    "encounter.open-rogue",
    "encounter.open-timed",
    "encounter.apply-rogue-draft",
    "encounter.apply-timed-draft",
    "encounter.list-rogue",
    "encounter.list-timed",
    "spell.allocation.review",
    "spell.draft.prepare",
    "spell.draft.apply",
    "spell.open-authoring",
    "spell.clear.review",
    "monster.allocate",
    "monster.operation.commit",
    "monster.open",
    "monster.draft.apply",
    "battle.allocate",
    "battle.open",
    "battle.clear.prepare",
    "battle.draft.prepare",
    "battle.draft.apply",
    "treasure.list",
    "treasure.open",
    "treasure.create",
    "treasure.update",
    "shop.list",
    "shop.open",
    "shop.create",
    "shop.update",
];
