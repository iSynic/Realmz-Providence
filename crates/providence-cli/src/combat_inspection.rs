use crate::output::{Inspection, finish_inspection, read_source};
use providence_core::codecs::decode_battles;
use providence_core::codecs::decode_extra_action_points;
use providence_core::codecs::decode_messages;
use providence_core::codecs::decode_monster_descriptions;
use providence_core::codecs::decode_monster_set;
use providence_core::codecs::encode_battles;
use providence_core::codecs::encode_monster_descriptions;
use providence_core::codecs::encode_monster_set;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::rebuilt::RebuiltV3MonsterError;
use providence_core::rebuilt::project_rebuilt_v3_battles;
use providence_core::rebuilt::project_rebuilt_v3_monster_catalog;
use serde_json::json;
use std::process::ExitCode;

pub(crate) fn inspect_monster_catalog(
    normal_path: &str,
    monster_path: &str,
    mega_path: &str,
    description_path: &str,
    macro_path: &str,
) -> ExitCode {
    finish_inspection(inspect_monster_catalog_report(
        normal_path,
        monster_path,
        mega_path,
        description_path,
        macro_path,
    ))
}

fn inspect_monster_catalog_report(
    normal_path: &str,
    monster_path: &str,
    mega_path: &str,
    description_path: &str,
    macro_path: &str,
) -> Result<Inspection, String> {
    let normal_bytes = read_source("Data MD", normal_path)?;
    let monster_bytes = read_source("Data MD1", monster_path)?;
    let mega_bytes = read_source("Data MD-1", mega_path)?;
    let description_bytes = read_source("Data DES", description_path)?;
    let macro_bytes = read_source("Data ED3", macro_path)?;
    let normal = decode_monster_set(&normal_bytes, "Data MD", 0);
    let monster = decode_monster_set(&monster_bytes, "Data MD1", 1);
    let mega = decode_monster_set(&mega_bytes, "Data MD-1", -1);
    let descriptions = decode_monster_descriptions(&description_bytes).records;
    let exact_normal = encode_monster_set(&normal, Some(&normal_bytes))
        .is_ok_and(|encoded| encoded == normal_bytes);
    let exact_monster = encode_monster_set(&monster, Some(&monster_bytes))
        .is_ok_and(|encoded| encoded == monster_bytes);
    let exact_mega =
        encode_monster_set(&mega, Some(&mega_bytes)).is_ok_and(|encoded| encoded == mega_bytes);
    let exact_descriptions = encode_monster_descriptions(&descriptions, Some(&description_bytes))
        .is_ok_and(|encoded| encoded == description_bytes);
    let mut snapshot = ProjectSnapshot::new_authored(StableId("monster-catalog-probe".into()));
    snapshot.monster_sets = vec![normal, monster, mega];
    snapshot.monster_descriptions = descriptions;
    snapshot.extra_action_points = decode_extra_action_points(&macro_bytes).records;
    let (catalog, projection_problems, projection_complete) = inspect_monster_projection(&snapshot);
    Ok(Inspection {
        accepted: exact_normal
            && exact_monster
            && exact_mega
            && exact_descriptions
            && projection_problems.is_empty()
            && projection_complete,
        report: json!({
            "normalPath": normal_path,
            "monsterPath": monster_path,
            "megaPath": mega_path,
            "descriptionPath": description_path,
            "macroPath": macro_path,
            "normalMonsters": snapshot.monster_sets.iter().find(|set| set.set_id == 0).map_or(0, |set| set.monsters.len()),
            "variantSets": snapshot.monster_sets.iter().filter(|set| set.set_id != 0).count(),
            "variantMonsters": snapshot.monster_sets.iter().filter(|set| set.set_id != 0).map(|set| set.monsters.len()).sum::<usize>(),
            "descriptions": snapshot.monster_descriptions.len(),
            "projectableNormalMonsters": catalog.as_ref().map(|value| value.monsters.len()),
            "projectableVariantMonsters": catalog.as_ref().map(|value| value.monster_sets.iter().map(|set| set.monsters.len()).sum::<usize>()),
            "projectionProblems": projection_problems,
            "projectionComplete": projection_complete,
            "exactNormalRoundTrip": exact_normal,
            "exactMonsterRoundTrip": exact_monster,
            "exactMegaRoundTrip": exact_mega,
            "exactDescriptionRoundTrip": exact_descriptions,
            "projectionValid": projection_problems.is_empty() && projection_complete
        }),
    })
}

fn inspect_monster_projection(
    snapshot: &ProjectSnapshot,
) -> (
    Option<providence_core::rebuilt::RebuiltV3MonsterCatalog>,
    Vec<serde_json::Value>,
    bool,
) {
    let mut remaining = snapshot.clone();
    let mut problems = Vec::new();
    loop {
        match project_rebuilt_v3_monster_catalog(&remaining) {
            Ok(catalog) => return (Some(catalog), problems, true),
            Err(error) => {
                let identity = match &error {
                    RebuiltV3MonsterError::InvalidRecord { monster, .. }
                    | RebuiltV3MonsterError::MissingDeathMacro { monster, .. } => monster,
                    _ => {
                        problems.push(json!({"reason": error.to_string()}));
                        return (None, problems, false);
                    }
                };
                let Some(set) = remaining.monster_sets.iter_mut().find(|set| {
                    set.monsters
                        .iter()
                        .any(|record| &record.identity == identity)
                }) else {
                    problems.push(json!({"reason": error.to_string()}));
                    return (None, problems, false);
                };
                let Some(position) = set
                    .monsters
                    .iter()
                    .position(|record| &record.identity == identity)
                else {
                    problems.push(json!({"reason": error.to_string()}));
                    return (None, problems, false);
                };
                let record = set.monsters.remove(position);
                problems.push(json!({
                    "nativePath": set.native_path,
                    "setId": set.set_id,
                    "nativeId": record.native_id.0,
                    "byteOffset": record.native_id.0 as usize * providence_core::codecs::MONSTER_RECORD_BYTES,
                    "reason": error.to_string()
                }));
            }
        }
    }
}

pub(crate) fn inspect_battle_catalog(
    battle_path: &str,
    monster_path: &str,
    message_path: &str,
    macro_path: &str,
) -> ExitCode {
    finish_inspection(inspect_battle_catalog_report(
        battle_path,
        monster_path,
        message_path,
        macro_path,
    ))
}

fn inspect_battle_catalog_report(
    battle_path: &str,
    monster_path: &str,
    message_path: &str,
    macro_path: &str,
) -> Result<Inspection, String> {
    let battle_bytes = read_source("Data BD", battle_path)?;
    let monster_bytes = read_source("Data MD", monster_path)?;
    let message_bytes = read_source("Data SD2", message_path)?;
    let macro_bytes = read_source("Data ED3", macro_path)?;
    let decoded_battles = decode_battles(&battle_bytes);
    let normal_monsters = decode_monster_set(&monster_bytes, "Data MD", 0);
    let exact_battles = encode_battles(&decoded_battles.records, Some(&battle_bytes))
        .is_ok_and(|encoded| encoded == battle_bytes);
    let exact_monsters = encode_monster_set(&normal_monsters, Some(&monster_bytes))
        .is_ok_and(|encoded| encoded == monster_bytes);
    let mut snapshot = ProjectSnapshot::new_authored(StableId("battle-catalog-probe".into()));
    snapshot.battles = decoded_battles.records;
    snapshot.monster_sets.push(normal_monsters);
    snapshot.messages = decode_messages(&message_bytes).messages;
    snapshot.extra_action_points = decode_extra_action_points(&macro_bytes).records;
    let battles = project_rebuilt_v3_battles(&snapshot)
        .map_err(|error| format!("battle projection failed: {error}"))?;
    let placements = battles
        .iter()
        .map(|battle| battle.monster_slots.len())
        .sum::<usize>();
    Ok(Inspection {
        accepted: exact_battles && exact_monsters,
        report: json!({
            "battlePath": battle_path,
            "monsterPath": monster_path,
            "messagePath": message_path,
            "macroPath": macro_path,
            "battleBytes": battle_bytes.len(),
            "monsterBytes": monster_bytes.len(),
            "battles": battles.len(),
            "placements": placements,
            "exactBattleRoundTrip": exact_battles,
            "exactMonsterRoundTrip": exact_monsters,
            "projectionValid": true
        }),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use providence_core::codecs::MONSTER_RECORD_BYTES;

    #[test]
    fn monster_inspection_lists_all_invalid_rows_without_changing_imported_truth() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("monster-problems".into()));
        let mut set = decode_monster_set(&vec![0; MONSTER_RECORD_BYTES * 3], "Data MD", 0);
        set.monsters[1].attack_count = 88;
        set.monsters[2].magic_to_hit = -1;
        snapshot.monster_sets.push(set);

        let (catalog, problems, complete) = inspect_monster_projection(&snapshot);

        assert!(complete);
        assert_eq!(
            catalog.expect("remaining projectable rows").monsters.len(),
            1
        );
        assert_eq!(problems.len(), 2);
        assert_eq!(problems[0]["nativePath"], "Data MD");
        assert_eq!(problems[0]["nativeId"], 1);
        assert_eq!(problems[0]["byteOffset"], MONSTER_RECORD_BYTES);
        assert_eq!(problems[1]["nativeId"], 2);
        assert_eq!(problems[1]["byteOffset"], MONSTER_RECORD_BYTES * 2);
        assert_eq!(snapshot.monster_sets[0].monsters.len(), 3);
    }

    #[test]
    fn monster_inspection_marks_unenumerated_catalog_failure_incomplete() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("duplicate-sets".into()));
        let set = decode_monster_set(&vec![0; MONSTER_RECORD_BYTES], "Data MD", 0);
        snapshot.monster_sets.extend([set.clone(), set]);

        let (catalog, problems, complete) = inspect_monster_projection(&snapshot);

        assert!(catalog.is_none());
        assert!(!complete);
        assert_eq!(problems.len(), 1);
        assert!(
            problems[0]["reason"]
                .as_str()
                .unwrap()
                .contains("duplicated")
        );
    }
}
