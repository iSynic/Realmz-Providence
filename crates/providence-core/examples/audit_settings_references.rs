use std::{env, fs, path::Path};

use providence_core::{
    codecs::NativeFileFamily,
    compiler::{NativeManifest, reimport_classic_slice},
    model::{ClassicAction, LevelType, ProjectSnapshot, StableId},
    rebuilt::derive_rebuilt_v3_reachability,
    references::TargetKind,
    session::EditorSession,
};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportedReference {
    file: &'static str,
    record: u32,
    slot: u8,
    raw_opcode: i16,
    target: i16,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Audit<'a> {
    scenario_path: &'a str,
    references: Vec<ImportedReference>,
    xap_references: Vec<providence_core::references::ReferenceDescriptor>,
    reachable_xap_ids: Vec<u32>,
}

fn append_actions(
    references: &mut Vec<ImportedReference>,
    file: &'static str,
    record: u32,
    actions: &[ClassicAction],
) {
    references.extend(actions.iter().map(|action| ImportedReference {
        file,
        record,
        slot: action.slot,
        raw_opcode: action.raw_opcode,
        target: action.target_native_id,
    }));
}

fn insert_if_present(
    manifest: &mut NativeManifest,
    directory: &Path,
    file: &'static str,
    family: NativeFileFamily,
) -> Result<(), String> {
    let path = directory.join(file);
    if path.is_file() {
        manifest.insert_generated(
            file,
            family,
            fs::read(&path).map_err(|error| format!("{}: {error}", path.display()))?,
        );
    }
    Ok(())
}

fn imported_manifest(directory: &Path) -> Result<NativeManifest, String> {
    let mut manifest = NativeManifest::default();
    for (file, family) in [
        ("Data LD", NativeFileFamily::LandMaps),
        ("Data DL", NativeFileFamily::DungeonMaps),
        ("Data RD", NativeFileFamily::LandRandomLevels),
        ("Data RDD", NativeFileFamily::DungeonRandomLevels),
        ("Data DD", NativeFileFamily::LandActionPoints),
        ("Data DDD", NativeFileFamily::DungeonActionPoints),
        ("Data ED3", NativeFileFamily::ExtraActionPoints),
        ("Data ED", NativeFileFamily::SimpleEncounters),
        ("Data ED2", NativeFileFamily::ComplexEncounters),
        ("Data TD2", NativeFileFamily::RogueEncounters),
        ("Data TD3", NativeFileFamily::TimedEncounters),
        ("Data EDCD", NativeFileFamily::ExtraCodes),
        ("Data MD", NativeFileFamily::ScenarioMonsters),
        ("Data MD1", NativeFileFamily::ScenarioMonsters),
        ("Data MD-1", NativeFileFamily::ScenarioMonsters),
        ("Data BD", NativeFileFamily::BattleRecords),
        ("Data OD", NativeFileFamily::OptionLabels),
        ("Global", NativeFileFamily::GlobalMacroHooks),
    ] {
        insert_if_present(&mut manifest, directory, file, family)?;
    }
    Ok(manifest)
}

fn imported_references(manifest: &NativeManifest) -> Vec<ImportedReference> {
    let imported = reimport_classic_slice(manifest);
    let mut references = Vec::new();
    for record in &imported.action_points {
        let file = match record.level_type {
            LevelType::Land => "Data DD",
            LevelType::Dungeon => "Data DDD",
        };
        append_actions(
            &mut references,
            file,
            record.level_index * 100 + u32::from(record.record_index),
            &record.actions,
        );
    }
    for record in &imported.extra_action_points {
        append_actions(
            &mut references,
            "Data ED3",
            record.native_id.0,
            &record.actions,
        );
    }
    for record in &imported.simple_encounters {
        append_actions(
            &mut references,
            "Data ED",
            record.native_id.0,
            &record.actions,
        );
    }
    for record in &imported.complex_encounters {
        append_actions(
            &mut references,
            "Data ED2",
            record.native_id.0,
            &record.actions,
        );
    }
    references.sort_by_key(|reference| {
        (
            reference.file,
            reference.record,
            reference.slot,
            reference.raw_opcode,
            reference.target,
        )
    });
    references
}

fn imported_snapshot(manifest: &NativeManifest) -> ProjectSnapshot {
    let imported = reimport_classic_slice(manifest);
    let mut snapshot = ProjectSnapshot::new_authored(StableId("archaeology-audit".into()));
    snapshot.campaign = imported.campaign;
    snapshot.start_location = imported.start_location;
    snapshot.world.maps = imported.maps;
    snapshot.world.action_points = imported.action_points;
    snapshot.world.land_layout = imported.land_layout;
    snapshot.world.player_maps = imported.player_maps;
    snapshot.player_map_names = imported.player_map_names;
    snapshot.extra_action_points = imported.extra_action_points;
    snapshot.messages = imported.messages;
    snapshot.option_labels = imported.option_labels;
    snapshot.simple_encounters = imported.simple_encounters;
    snapshot.complex_encounters = imported.complex_encounters;
    snapshot.rogue_encounters = imported.rogue_encounters;
    snapshot.timed_encounters = imported.timed_encounters;
    snapshot.extra_codes = imported.extra_codes;
    snapshot.scenario_application = imported.scenario_application;
    snapshot.monster_sets = imported.monster_sets;
    snapshot.monster_descriptions = imported.monster_descriptions;
    snapshot.battles = imported.battles;
    snapshot.treasures = imported.treasures;
    snapshot.shops = imported.shops;
    snapshot.caste_rules = imported.caste_rules;
    snapshot.scenario_item_rules = imported.scenario_item_rules;
    snapshot.terrain_catalog = imported.terrain_catalog;
    snapshot.landlook_catalogs = imported.landlook_catalogs;
    snapshot
}

fn xap_references(
    snapshot: ProjectSnapshot,
) -> Vec<providence_core::references::ReferenceDescriptor> {
    EditorSession::new(snapshot)
        .references()
        .into_iter()
        .filter(|reference| reference.target_kind == TargetKind::ExtraActionPoint)
        .collect()
}

fn reachable_xap_ids(snapshot: &ProjectSnapshot) -> Result<Vec<u32>, String> {
    Ok(derive_rebuilt_v3_reachability(snapshot)
        .map_err(|error| error.to_string())?
        .reachable_program_ids
        .into_iter()
        .filter_map(|id| {
            id.0.strip_prefix("xap:")
                .and_then(|value| value.parse().ok())
        })
        .collect())
}

fn main() -> Result<(), String> {
    let scenario_path = env::args()
        .nth(1)
        .ok_or_else(|| "usage: audit_settings_references <scenario-directory>".to_owned())?;
    let manifest = imported_manifest(Path::new(&scenario_path))?;
    let snapshot = imported_snapshot(&manifest);
    println!(
        "{}",
        serde_json::to_string_pretty(&Audit {
            scenario_path: &scenario_path,
            references: imported_references(&manifest),
            xap_references: xap_references(snapshot.clone()),
            reachable_xap_ids: reachable_xap_ids(&snapshot)?,
        })
        .map_err(|error| error.to_string())?
    );
    Ok(())
}
