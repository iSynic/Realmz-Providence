use super::assets::asset_index_blockers;
use super::finding_groups;
use super::rebuilt_documents::{
    application_contract_blockers, battle_terrain_blockers, item_catalog_blockers,
    rebuilt_battle_blockers, rebuilt_complex_encounter_blockers, rebuilt_content_document_blockers,
    rebuilt_monster_blockers, rebuilt_rogue_encounter_blockers, rebuilt_shop_blockers,
    rebuilt_simple_encounter_blockers, rebuilt_spell_blockers, rebuilt_standard_spell_blockers,
    rebuilt_timed_encounter_blockers, rebuilt_treasure_blockers, rule_catalog_blockers,
    scenario_item_catalog_blockers, trigger_program_blockers,
};
use super::reference_readiness::reference_blockers;
use super::startup::{
    campaign_blockers, deferred_start_location_warning,
    imported_start_location_requires_deferred_capability, start_location_blockers,
};
use super::world::{map_runtime_blockers, terrain_catalog_blockers, topology_blockers};
use super::{
    CompatibilityBlocker, CompileTarget, TargetCompatibility, blocker, finish_with_warnings,
};
use crate::codecs::SCENARIO_MUSIC_FILES;
use crate::model::{ProjectSnapshot, StableId};
use crate::rebuilt::{
    ApplicationMediaCatalog, compile_rebuilt_v3_reachable_content,
    compile_rebuilt_v3_reachable_world_with_application, imported_requires_rebuilt_v4,
    project_rebuilt_v3_reachable_media_with_application, project_rebuilt_v3_reachable_runtime,
};

pub fn classify_rebuilt_v3(snapshot: &ProjectSnapshot) -> TargetCompatibility {
    classify_rebuilt_v3_internal(snapshot, None)
}

pub fn classify_rebuilt_v3_with_application(
    snapshot: &ProjectSnapshot,
    application_media: &ApplicationMediaCatalog,
) -> TargetCompatibility {
    classify_rebuilt_v3_internal(snapshot, Some(application_media))
}

fn classify_rebuilt_v3_internal(
    snapshot: &ProjectSnapshot,
    application_media: Option<&ApplicationMediaCatalog>,
) -> TargetCompatibility {
    if let Some(application_media) = application_media {
        return classify_application_backed_rebuilt_v3(snapshot, application_media);
    }
    let mut blockers = reference_blockers(snapshot, None);
    let mut warnings = Vec::new();
    finding_groups::runtime_conditions(snapshot, &mut blockers, &mut warnings);
    blockers.extend(campaign_blockers(snapshot));
    if imported_start_location_requires_deferred_capability(snapshot) {
        warnings.push(deferred_start_location_warning(snapshot));
    } else {
        blockers.extend(start_location_blockers(snapshot));
    }
    let terrain_blockers = terrain_catalog_blockers(snapshot);
    let runtime_blockers = map_runtime_blockers(snapshot);
    if terrain_blockers.is_empty() && runtime_blockers.is_empty() {
        blockers.extend(topology_blockers(snapshot, application_media));
    }
    blockers.extend(terrain_blockers);
    blockers.extend(runtime_blockers);
    blockers.extend(battle_terrain_blockers(snapshot));
    blockers.extend(asset_index_blockers(snapshot, application_media));
    blockers.extend(trigger_program_blockers(snapshot));
    blockers.extend(rule_catalog_blockers(snapshot));
    blockers.extend(item_catalog_blockers(snapshot));
    blockers.extend(scenario_item_catalog_blockers(snapshot));
    blockers.extend(application_contract_blockers(snapshot));
    blockers.extend(rebuilt_monster_blockers(snapshot));
    blockers.extend(rebuilt_battle_blockers(snapshot));
    blockers.extend(rebuilt_treasure_blockers(snapshot));
    blockers.extend(rebuilt_shop_blockers(snapshot));
    blockers.extend(rebuilt_simple_encounter_blockers(snapshot));
    blockers.extend(rebuilt_complex_encounter_blockers(snapshot));
    blockers.extend(rebuilt_rogue_encounter_blockers(snapshot));
    blockers.extend(rebuilt_timed_encounter_blockers(snapshot));
    blockers.extend(rebuilt_standard_spell_blockers(snapshot));
    blockers.extend(rebuilt_spell_blockers(snapshot));
    blockers.extend(rebuilt_content_document_blockers(snapshot));
    if let Err(error) = project_rebuilt_v3_reachable_runtime(snapshot)
        && let Some(reachability_blocker) =
            actionable_reachability_blocker(blockers.is_empty(), error.to_string())
    {
        blockers.push(reachability_blocker);
    }
    finish_with_warnings(rebuilt_package_target(snapshot), blockers, warnings)
}

fn classify_application_backed_rebuilt_v3(
    snapshot: &ProjectSnapshot,
    application_media: &ApplicationMediaCatalog,
) -> TargetCompatibility {
    let mut blockers = campaign_blockers(snapshot);
    let mut warnings = Vec::new();
    let imported = matches!(
        snapshot.origin,
        crate::model::ProjectOrigin::Imported { .. }
    );
    if imported {
        warnings.extend(imported_source_warnings(snapshot));
    }
    if imported_start_location_requires_deferred_capability(snapshot) {
        warnings.push(deferred_start_location_warning(snapshot));
    } else {
        blockers.extend(start_location_blockers(snapshot));
    }

    let world_blockers =
        application_world_blockers(snapshot, application_media, imported, &mut warnings);
    // A world failure suppresses world compilation, not content or media checks.
    let world_prerequisites_ready = world_blockers.is_empty();
    blockers.extend(world_blockers);
    let prerequisites = runtime_prerequisites(snapshot);
    let runtime_prerequisites_ready = prerequisites.is_empty();
    blockers.extend(prerequisites);
    if runtime_prerequisites_ready {
        classify_reachable(
            snapshot,
            application_media,
            imported,
            world_prerequisites_ready,
            &mut blockers,
            &mut warnings,
        );
    }
    finish_with_warnings(rebuilt_package_target(snapshot), blockers, warnings)
}

fn imported_source_warnings(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    let mut warnings = music_warnings(snapshot);
    warnings.extend(partial_record_warnings(snapshot));
    warnings
}

fn music_warnings(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    let mut warnings = Vec::new();

    for (index, native_path) in SCENARIO_MUSIC_FILES.iter().enumerate() {
        let source_exists = snapshot
            .classic_sources
            .iter()
            .any(|source| source.native_path == *native_path);
        let asset_exists = snapshot
            .assets
            .iter()
            .any(|asset| asset.scenario_music_slot == Some(index as u8 + 1));
        if source_exists && !asset_exists {
            warnings.push(blocker(
                "rebuilt.quarantined-record",
                format!(
                    "Imported Classic '{native_path}' is preserved as source bytes but omitted because it is not a representable MOD module"
                ),
                Some(snapshot.project_id.clone()),
            ));
        }
    }
    warnings
}

fn partial_record_warnings(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    let mut warnings = Vec::new();
    for (native_path, record_bytes, record_kind) in
        [("Data SD2", 256, "Str255"), ("Data EDCD", 10, "Extra Code")]
    {
        let Some(source) = snapshot
            .classic_sources
            .iter()
            .find(|source| source.native_path == native_path)
        else {
            continue;
        };
        let trailing_bytes = source.byte_length % record_bytes;
        if trailing_bytes != 0 {
            warnings.push(blocker(
                "rebuilt.quarantined-record",
                format!(
                    "Imported Classic '{native_path}' preserves {trailing_bytes} trailing byte(s) after {} complete {record_bytes}-byte {record_kind} row(s); the fragment is retained as source evidence and is not executable content",
                    source.byte_length / record_bytes
                ),
                Some(StableId(format!("classic-source:{native_path}"))),
            ));
        }
    }
    warnings
}

fn application_world_blockers(
    snapshot: &ProjectSnapshot,
    application_media: &ApplicationMediaCatalog,
    imported: bool,
    warnings: &mut Vec<CompatibilityBlocker>,
) -> Vec<CompatibilityBlocker> {
    let terrain_blockers = terrain_catalog_blockers(snapshot);
    let mut runtime_blockers = map_runtime_blockers(snapshot);
    if imported {
        let (quarantined, retained): (Vec<_>, Vec<_>) = runtime_blockers
            .into_iter()
            .partition(|finding| finding.code == "rebuilt.map-runtime-metadata.random-rectangle");
        warnings.extend(quarantined.into_iter().map(|finding| {
            blocker(
                "rebuilt.quarantined-record",
                format!(
                    "Imported Classic {} The source rectangle is preserved, but its unusable runtime definition is omitted.",
                    finding.message
                ),
                finding.entity,
            )
        }));
        runtime_blockers = retained;
    }
    let mut world_blockers = Vec::new();
    if terrain_blockers.is_empty() && runtime_blockers.is_empty() {
        world_blockers.extend(topology_blockers(snapshot, Some(application_media)));
    }
    world_blockers.extend(terrain_blockers);
    world_blockers.extend(runtime_blockers);
    world_blockers.extend(battle_terrain_blockers(snapshot));
    world_blockers
}

fn runtime_prerequisites(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    let mut runtime_prerequisites = rule_catalog_blockers(snapshot);
    runtime_prerequisites.extend(item_catalog_blockers(snapshot));
    runtime_prerequisites.extend(rebuilt_standard_spell_blockers(snapshot));
    if snapshot.scenario_application.is_none() {
        runtime_prerequisites.push(blocker(
            "rebuilt.application-hooks.unavailable",
            "Scenario lifecycle hooks must be explicitly authored, including an all-null contract.",
            Some(snapshot.project_id.clone()),
        ));
    }
    runtime_prerequisites
}

fn classify_reachable(
    snapshot: &ProjectSnapshot,
    application_media: &ApplicationMediaCatalog,
    imported: bool,
    world_prerequisites_ready: bool,
    blockers: &mut Vec<CompatibilityBlocker>,
    warnings: &mut Vec<CompatibilityBlocker>,
) {
    match project_rebuilt_v3_reachable_runtime(snapshot) {
        Err(error) => blockers.push(blocker(
            "rebuilt.reachability.invalid",
            error.to_string(),
            None,
        )),
        Ok(runtime) => {
            warnings.extend(finding_groups::deferred(&runtime.deferred_references));
            if world_prerequisites_ready
                && let Err(error) = compile_rebuilt_v3_reachable_world_with_application(
                    snapshot,
                    application_media,
                    &runtime,
                )
            {
                blockers.push(blocker("rebuilt.world.invalid", error.to_string(), None));
            }
            if let Err(error) = compile_rebuilt_v3_reachable_content(snapshot, &runtime) {
                blockers.push(blocker(
                    "rebuilt.content-document.invalid",
                    error.to_string(),
                    None,
                ));
            }
            match project_rebuilt_v3_reachable_media_with_application(
                snapshot,
                application_media,
                &runtime.scenario,
                &runtime.item_spells.items,
                &runtime.item_spells.spells,
                runtime.combat.all_monsters(),
                &runtime.rogue_encounters,
                !runtime.combat.battles.is_empty(),
            ) {
                Err(error) => blockers.push(blocker(
                    "rebuilt.media-selection.invalid",
                    error.to_string(),
                    None,
                )),
                Ok(media) => {
                    let findings = finding_groups::media(&media.references, imported);
                    if imported {
                        warnings.extend(findings);
                    } else {
                        blockers.extend(findings);
                    }
                }
            }
        }
    }
}

fn rebuilt_package_target(snapshot: &ProjectSnapshot) -> CompileTarget {
    if crate::rebuilt::imported_extra_code_tail(snapshot).is_some() {
        CompileTarget::RebuiltPackageV5
    } else if imported_requires_rebuilt_v4(snapshot) {
        CompileTarget::RebuiltPackageV4
    } else {
        CompileTarget::RebuiltPackageV3
    }
}

pub(super) fn actionable_reachability_blocker(
    prerequisites_ready: bool,
    error: String,
) -> Option<CompatibilityBlocker> {
    prerequisites_ready.then(|| blocker("rebuilt.reachability.invalid", error, None))
}
