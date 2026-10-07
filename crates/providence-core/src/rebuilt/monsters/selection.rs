use super::{RebuiltV3MonsterCatalog, RebuiltV3MonsterError, RebuiltV3NormalMonsterSelection};
use super::{
    descriptions::validated_selected_descriptions,
    records::RecordProjection,
    sets::{ProjectedSets, validate_monster_set},
};
use crate::model::{MonsterSet, ProjectOrigin, ProjectSnapshot};
use std::collections::BTreeSet;

pub fn project_rebuilt_v3_normal_monsters_by_classic_ids(
    snapshot: &ProjectSnapshot,
    classic_ids: &BTreeSet<u32>,
) -> Result<RebuiltV3NormalMonsterSelection, RebuiltV3MonsterError> {
    let normal_sets = snapshot
        .monster_sets
        .iter()
        .filter(|set| set.set_id == 0 && set.native_path == "Data MD")
        .collect::<Vec<_>>();
    if normal_sets.len() > 1 {
        return Err(RebuiltV3MonsterError::DuplicateSet(0));
    }

    let available_classic_ids = normal_sets
        .first()
        .into_iter()
        .flat_map(|set| set.monsters.iter().map(|monster| monster.native_id.0))
        .collect::<BTreeSet<_>>();
    if let Some(missing) = classic_ids.difference(&available_classic_ids).next() {
        return Err(RebuiltV3MonsterError::MissingSelectedClassicId(*missing));
    }

    let descriptions = validated_selected_descriptions(snapshot, classic_ids)?;
    let macro_ids = snapshot
        .extra_action_points
        .iter()
        .map(|row| row.native_id.0)
        .collect::<BTreeSet<_>>();
    let projection = RecordProjection {
        descriptions: &descriptions,
        macro_ids: &macro_ids,
        allow_deferred: false,
        allow_v4_values: false,
    };
    let mut records = normal_sets
        .first()
        .into_iter()
        .flat_map(|set| set.monsters.iter())
        .filter(|monster| classic_ids.contains(&monster.native_id.0))
        .collect::<Vec<_>>();
    records.sort_by_key(|monster| monster.native_id);
    let mut seen_classic_ids = BTreeSet::new();
    let mut monsters = Vec::with_capacity(records.len());
    for monster in records {
        if !seen_classic_ids.insert(monster.native_id.0) {
            return Err(RebuiltV3MonsterError::DuplicateClassicId {
                set_id: 0,
                classic_id: monster.native_id.0,
            });
        }
        monsters.push(projection.project(monster, 0)?);
    }

    Ok(RebuiltV3NormalMonsterSelection {
        monsters,
        monster_descriptions: descriptions.into_values().collect(),
    })
}

pub fn project_rebuilt_v3_monsters_by_classic_ids(
    snapshot: &ProjectSnapshot,
    classic_ids: &BTreeSet<u32>,
) -> Result<RebuiltV3MonsterCatalog, RebuiltV3MonsterError> {
    let allow_deferred = matches!(snapshot.origin, ProjectOrigin::Imported { .. });
    let descriptions = validated_selected_descriptions(snapshot, classic_ids)?;
    let macro_ids = snapshot
        .extra_action_points
        .iter()
        .map(|row| row.native_id.0)
        .collect::<BTreeSet<_>>();

    let projection = RecordProjection {
        descriptions: &descriptions,
        macro_ids: &macro_ids,
        allow_deferred,
        allow_v4_values: allow_deferred,
    };
    let mut seen_sets = BTreeSet::new();
    let mut projected_sets = ProjectedSets::default();
    let mut sets = snapshot.monster_sets.iter().collect::<Vec<_>>();
    sets.sort_by_key(|set| set.set_id);
    for set in sets {
        validate_monster_set(set)?;
        if !seen_sets.insert(set.set_id) {
            return Err(RebuiltV3MonsterError::DuplicateSet(set.set_id));
        }
        projected_sets.insert(
            set.set_id,
            project_selected_set(set, classic_ids, &projection)?,
        );
    }
    if !allow_deferred && !seen_sets.contains(&0) && !classic_ids.is_empty() {
        return Err(RebuiltV3MonsterError::MissingSelectedClassicId(
            *classic_ids.first().expect("nonempty selected Monster IDs"),
        ));
    }
    Ok(projected_sets.finish(descriptions.into_values().collect()))
}

fn project_selected_set(
    set: &MonsterSet,
    classic_ids: &BTreeSet<u32>,
    projection: &RecordProjection<'_>,
) -> Result<Vec<super::RebuiltV3MonsterDefinition>, RebuiltV3MonsterError> {
    let mut records = set
        .monsters
        .iter()
        .filter(|monster| classic_ids.contains(&monster.native_id.0))
        .collect::<Vec<_>>();
    records.sort_by_key(|monster| monster.native_id);
    let mut seen_classic_ids = BTreeSet::new();
    let mut projected = Vec::with_capacity(records.len());
    for monster in records {
        if !seen_classic_ids.insert(monster.native_id.0) {
            return Err(RebuiltV3MonsterError::DuplicateClassicId {
                set_id: set.set_id,
                classic_id: monster.native_id.0,
            });
        }
        projected.push(projection.project(monster, set.set_id)?);
    }
    if !projection.allow_deferred
        && let Some(missing) = classic_ids.difference(&seen_classic_ids).next()
    {
        return Err(RebuiltV3MonsterError::MissingSelectedClassicId(*missing));
    }
    Ok(projected)
}
