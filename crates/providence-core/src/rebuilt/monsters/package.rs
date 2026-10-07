mod alignment;
use super::{
    RebuiltV3MonsterCatalog, RebuiltV3MonsterDefinition, RebuiltV3MonsterError,
    RebuiltV3MonsterOmission,
};
use super::{
    descriptions::validated_descriptions,
    records::RecordProjection,
    sets::{ProjectedSets, validate_monster_set},
};
use crate::model::{ProjectOrigin, ProjectSnapshot};
use std::collections::BTreeSet;

pub fn project_rebuilt_v3_monster_catalog(
    snapshot: &ProjectSnapshot,
) -> Result<RebuiltV3MonsterCatalog, RebuiltV3MonsterError> {
    project_monster_catalog(snapshot, None, false).map(|(catalog, _)| catalog)
}

pub fn project_rebuilt_v4_imported_monster_catalog(
    snapshot: &ProjectSnapshot,
) -> Result<RebuiltV3MonsterCatalog, RebuiltV3MonsterError> {
    if !matches!(
        snapshot.origin,
        crate::model::ProjectOrigin::Imported { .. }
    ) {
        return Err(RebuiltV3MonsterError::InvalidRecord {
            monster: crate::model::StableId("project:origin".into()),
            reason: "schema v4 monster projection is reserved for imported projects".into(),
        });
    }
    project_monster_catalog(snapshot, None, true).map(|(catalog, _)| catalog)
}

pub(crate) fn project_rebuilt_v3_package_monster_catalog(
    snapshot: &ProjectSnapshot,
    reachable_monster_ids: &BTreeSet<u32>,
) -> Result<(RebuiltV3MonsterCatalog, Vec<RebuiltV3MonsterOmission>), RebuiltV3MonsterError> {
    project_monster_catalog(snapshot, Some(reachable_monster_ids), true)
}

fn project_monster_catalog(
    snapshot: &ProjectSnapshot,
    reachable_monster_ids: Option<&BTreeSet<u32>>,
    allow_v4_values: bool,
) -> Result<(RebuiltV3MonsterCatalog, Vec<RebuiltV3MonsterOmission>), RebuiltV3MonsterError> {
    let imported = matches!(snapshot.origin, ProjectOrigin::Imported { .. });
    let descriptions = validated_descriptions(snapshot)?;
    let macro_ids = snapshot
        .extra_action_points
        .iter()
        .map(|row| row.native_id.0)
        .collect::<BTreeSet<_>>();
    let projection = RecordProjection {
        descriptions: &descriptions,
        macro_ids: &macro_ids,
        allow_deferred: reachable_monster_ids.is_some() && imported,
        allow_v4_values: allow_v4_values && imported,
    };
    let mut seen_sets = BTreeSet::new();
    let mut projected_sets = ProjectedSets::default();
    let mut omissions = Vec::new();
    let mut sets = snapshot.monster_sets.iter().collect::<Vec<_>>();
    sets.sort_by_key(|set| set.set_id);
    for set in sets {
        validate_monster_set(set)?;
        if !seen_sets.insert(set.set_id) {
            return Err(RebuiltV3MonsterError::DuplicateSet(set.set_id));
        }
        let projected =
            project_monster_set(set, &projection, reachable_monster_ids, &mut omissions)?;
        projected_sets.insert(set.set_id, projected);
    }
    if let Some(ids) = reachable_monster_ids {
        alignment::align_package_monster_sets(
            snapshot,
            ids,
            &mut projected_sets.monsters,
            &mut projected_sets.monster_sets,
            &mut omissions,
        )?;
    }
    Ok((
        projected_sets.finish(descriptions.into_values().collect()),
        omissions,
    ))
}

fn project_monster_set(
    set: &crate::model::MonsterSet,
    projection: &RecordProjection<'_>,
    reachable_ids: Option<&BTreeSet<u32>>,
    omissions: &mut Vec<RebuiltV3MonsterOmission>,
) -> Result<Vec<RebuiltV3MonsterDefinition>, RebuiltV3MonsterError> {
    let mut records = set.monsters.iter().collect::<Vec<_>>();
    records.sort_by_key(|monster| monster.native_id);
    let mut classic_ids = BTreeSet::new();
    let mut projected = Vec::new();
    for monster in records {
        if !classic_ids.insert(monster.native_id.0) {
            return Err(RebuiltV3MonsterError::DuplicateClassicId {
                set_id: set.set_id,
                classic_id: monster.native_id.0,
            });
        }
        match projection.project(monster, set.set_id) {
            Ok(definition) => projected.push(definition),
            Err(error @ RebuiltV3MonsterError::InvalidRecord { .. })
                if reachable_ids.is_some_and(|ids| {
                    !monster.authored && !ids.contains(&monster.native_id.0)
                }) =>
            {
                omissions.push(RebuiltV3MonsterOmission {
                    native_path: set.native_path.clone(),
                    set_id: set.set_id,
                    native_id: monster.native_id.0,
                    reason: error.to_string(),
                });
            }
            Err(error) => return Err(error),
        }
    }
    Ok(projected)
}
