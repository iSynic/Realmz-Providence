use super::super::{
    RebuiltV3MonsterDefinition, RebuiltV3MonsterError, RebuiltV3MonsterOmission,
    RebuiltV3MonsterSetDefinition,
};
use crate::model::ProjectSnapshot;
use std::collections::BTreeSet;

pub(super) fn align_package_monster_sets(
    snapshot: &ProjectSnapshot,
    reachable_ids: &BTreeSet<u32>,
    monsters: &mut Vec<RebuiltV3MonsterDefinition>,
    monster_sets: &mut [RebuiltV3MonsterSetDefinition],
    omissions: &mut Vec<RebuiltV3MonsterOmission>,
) -> Result<(), RebuiltV3MonsterError> {
    if monster_sets.is_empty() {
        return Ok(());
    }
    let (common_ids, _physical_common_ids) = common_set_ids(snapshot, monsters, monster_sets);
    let normal_source = snapshot.monster_sets.iter().find(|set| set.set_id == 0);
    *monsters = retain_common_monsters(
        std::mem::take(monsters),
        normal_source,
        &common_ids,
        reachable_ids,
        omissions,
    )?;
    for set in monster_sets.iter_mut() {
        let source = snapshot
            .monster_sets
            .iter()
            .find(|row| row.set_id == set.set_id);
        set.monsters = retain_common_monsters(
            std::mem::take(&mut set.monsters),
            source,
            &common_ids,
            reachable_ids,
            omissions,
        )?;
    }
    Ok(())
}

fn common_set_ids(
    snapshot: &ProjectSnapshot,
    monsters: &[RebuiltV3MonsterDefinition],
    monster_sets: &[RebuiltV3MonsterSetDefinition],
) -> (BTreeSet<u32>, BTreeSet<u32>) {
    let mut common_ids = monsters
        .iter()
        .map(|row| row.classic_id)
        .collect::<BTreeSet<_>>();
    let normal_source = snapshot.monster_sets.iter().find(|set| set.set_id == 0);
    let mut physical_common_ids = normal_source
        .map(|set| {
            set.monsters
                .iter()
                .map(|row| row.native_id.0)
                .collect::<BTreeSet<_>>()
        })
        .unwrap_or_default();
    for set in monster_sets.iter() {
        let set_ids = set
            .monsters
            .iter()
            .map(|row| row.classic_id)
            .collect::<BTreeSet<_>>();
        common_ids.retain(|id| set_ids.contains(id));
        let source = snapshot
            .monster_sets
            .iter()
            .find(|row| row.set_id == set.set_id)
            .expect("projected Monster set has a source");
        let source_ids = source
            .monsters
            .iter()
            .map(|row| row.native_id.0)
            .collect::<BTreeSet<_>>();
        physical_common_ids.retain(|id| source_ids.contains(id));
    }
    (common_ids, physical_common_ids)
}

fn retain_common_monsters(
    definitions: Vec<RebuiltV3MonsterDefinition>,
    source: Option<&crate::model::MonsterSet>,
    common_ids: &BTreeSet<u32>,
    reachable_ids: &BTreeSet<u32>,
    omissions: &mut Vec<RebuiltV3MonsterOmission>,
) -> Result<Vec<RebuiltV3MonsterDefinition>, RebuiltV3MonsterError> {
    let mut retained = Vec::new();
    for definition in definitions {
        if common_ids.contains(&definition.classic_id) {
            retained.push(definition);
            continue;
        }
        let source = source.expect("projected Monster has a source set");
        let authored = source
            .monsters
            .iter()
            .any(|row| row.native_id.0 == definition.classic_id && row.authored);
        if authored || reachable_ids.contains(&definition.classic_id) {
            return Err(RebuiltV3MonsterError::IncompleteSetCoverage {
                set_id: source.set_id,
                classic_id: definition.classic_id,
            });
        }
        omissions.push(RebuiltV3MonsterOmission {
            native_path: source.native_path.clone(),
            set_id: source.set_id,
            native_id: definition.classic_id,
            reason: "Classic ID has no projectable counterpart in every packaged Monster set"
                .into(),
        });
    }
    Ok(retained)
}
