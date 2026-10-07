use std::collections::{BTreeMap, BTreeSet};

use serde::Serialize;

use crate::model::{NativeRecordId, StableId};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PopulationTargetReason {
    PreferredSlot,
    PreferredOccupied,
    NextOpenSlot,
    ExplicitDestination,
    ExplicitReplacement,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterPopulationRow {
    pub identity: StableId,
    pub preferred_id: NativeRecordId,
    pub target_id: NativeRecordId,
    pub reason: PopulationTargetReason,
}

pub fn plan_explicit_monster_destination(
    identity: StableId,
    preferred_id: NativeRecordId,
    target_id: NativeRecordId,
    replace: bool,
) -> Result<MonsterPopulationRow, String> {
    if !(1..=i16::MAX as u32).contains(&target_id.0) {
        return Err("Choose a Monster destination ID between 1 and 32767.".into());
    }
    Ok(MonsterPopulationRow {
        identity,
        preferred_id,
        target_id,
        reason: if replace {
            PopulationTargetReason::ExplicitReplacement
        } else {
            PopulationTargetReason::ExplicitDestination
        },
    })
}

/// Allocate in the caller's authoritative selection order, reserving each target before the next row.
pub fn plan_monster_population(
    entries: impl IntoIterator<Item = (StableId, NativeRecordId)>,
    mut used: BTreeSet<u32>,
) -> Result<Vec<MonsterPopulationRow>, String> {
    let mut rows = Vec::new();
    let mut next_free = 1;
    for (identity, preferred_id) in entries {
        let preferred = preferred_id.0;
        let (target, reason) = if preferred > 0 && !used.contains(&preferred) {
            (preferred, PopulationTargetReason::PreferredSlot)
        } else {
            while next_free <= i16::MAX as u32 && used.contains(&next_free) {
                next_free += 1;
            }
            if next_free > i16::MAX as u32 {
                return Err(
                    "no free signed-short Monster ID remains for library population".into(),
                );
            }
            let target = next_free;
            (
                target,
                if preferred > 0 {
                    PopulationTargetReason::PreferredOccupied
                } else {
                    PopulationTargetReason::NextOpenSlot
                },
            )
        };
        used.insert(target);
        rows.push(MonsterPopulationRow {
            identity,
            preferred_id,
            target_id: NativeRecordId(target),
            reason,
        });
    }
    Ok(rows)
}

pub fn plan_monster_population_with_destinations(
    entries: &[(StableId, NativeRecordId)],
    mut used: BTreeSet<u32>,
    destinations: &BTreeMap<StableId, NativeRecordId>,
) -> Result<Vec<MonsterPopulationRow>, String> {
    let membership = entries
        .iter()
        .map(|(id, preferred)| (id, *preferred))
        .collect::<BTreeMap<_, _>>();
    let mut explicit = BTreeMap::new();
    for (identity, target) in destinations {
        if !membership.contains_key(identity) {
            return Err("A destination names an entry outside the frozen membership.".into());
        }
        let preferred = membership[identity];
        let row = plan_explicit_monster_destination(identity.clone(), preferred, *target, false)?;
        if !used.insert(target.0) {
            return Err(format!(
                "Monster {} is occupied or allocated twice. Choose an empty ID.",
                target.0
            ));
        }
        explicit.insert(identity.clone(), row);
    }
    let automatic = plan_monster_population(
        entries
            .iter()
            .filter(|(id, _)| !destinations.contains_key(id))
            .cloned(),
        used,
    )?
    .into_iter()
    .map(|row| (row.identity.clone(), row))
    .collect::<BTreeMap<_, _>>();
    Ok(entries
        .iter()
        .map(|(id, _)| {
            explicit
                .get(id)
                .or_else(|| automatic.get(id))
                .expect("every member allocated")
                .clone()
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entries(ids: &[u32]) -> Vec<(StableId, NativeRecordId)> {
        ids.iter()
            .enumerate()
            .map(|(index, id)| (StableId(format!("library:{index}")), NativeRecordId(*id)))
            .collect()
    }

    #[test]
    fn explicit_bulk_destinations_reserve_before_auto_and_reject_stale_membership_or_collisions() {
        let source = entries(&[0, 2, 9]);
        let chosen = BTreeMap::from([(source[2].0.clone(), NativeRecordId(2))]);
        let rows = plan_monster_population_with_destinations(&source, BTreeSet::from([1]), &chosen)
            .unwrap();
        assert_eq!(
            rows.iter().map(|row| row.target_id.0).collect::<Vec<_>>(),
            [3, 4, 2]
        );
        assert_eq!(rows[2].reason, PopulationTargetReason::ExplicitDestination);
        assert!(
            plan_monster_population_with_destinations(&source, BTreeSet::from([2]), &chosen)
                .is_err()
        );
        assert!(
            plan_monster_population_with_destinations(&source[..2], BTreeSet::new(), &chosen)
                .is_err()
        );
        for target in [0, 32768] {
            let invalid = BTreeMap::from([(source[0].0.clone(), NativeRecordId(target))]);
            assert!(
                plan_monster_population_with_destinations(&source, BTreeSet::new(), &invalid)
                    .is_err()
            );
        }
        let duplicate = BTreeMap::from([
            (source[0].0.clone(), NativeRecordId(6)),
            (source[1].0.clone(), NativeRecordId(6)),
        ]);
        assert!(
            plan_monster_population_with_destinations(&source, BTreeSet::new(), &duplicate)
                .is_err()
        );
    }

    #[test]
    fn population_reserves_prior_assignments_and_preserves_order() {
        let rows =
            plan_monster_population(entries(&[0, 2, 9, 9]), BTreeSet::from([0, 1, 7])).unwrap();
        assert_eq!(
            rows.iter().map(|row| row.target_id.0).collect::<Vec<_>>(),
            [2, 3, 9, 4]
        );
        assert_eq!(rows[0].reason, PopulationTargetReason::NextOpenSlot);
        assert_eq!(rows[1].reason, PopulationTargetReason::PreferredOccupied);
        assert_eq!(rows[2].reason, PopulationTargetReason::PreferredSlot);
        assert_eq!(rows[3].identity.0, "library:3");
        assert_eq!(
            rows,
            plan_monster_population(entries(&[0, 2, 9, 9]), BTreeSet::from([0, 1, 7])).unwrap()
        );
    }

    #[test]
    fn population_exhaustion_returns_no_partial_plan() {
        assert!(plan_monster_population(entries(&[0]), (1..=i16::MAX as u32).collect()).is_err());
        assert!(
            plan_monster_population(entries(&[]), BTreeSet::new())
                .unwrap()
                .is_empty()
        );
        let occupied = (1..i16::MAX as u32).collect::<BTreeSet<_>>();
        let last = plan_monster_population(entries(&[0, u32::MAX]), occupied.clone()).unwrap();
        assert_eq!(last[0].target_id.0, i16::MAX as u32);
        assert_eq!(last[1].target_id.0, u32::MAX);
        assert!(plan_monster_population(entries(&[0, u32::MAX, 0]), occupied).is_err());
    }

    #[test]
    fn moving_free_slot_matches_full_scan_for_ordered_preference_collisions() {
        for occupied_mask in 0..16 {
            for sequence in 0..625 {
                let mut used: BTreeSet<u32> =
                    (0..4).filter(|id| occupied_mask & (1 << id) != 0).collect();
                let source = entries(&[
                    sequence % 5,
                    sequence / 5 % 5,
                    sequence / 25 % 5,
                    sequence / 125 % 5,
                    u32::MAX,
                    u32::MAX,
                ]);
                let actual = plan_monster_population(source.clone(), used.clone()).unwrap();
                for ((identity, preferred), row) in source.into_iter().zip(actual) {
                    let preferred_free = preferred.0 > 0 && !used.contains(&preferred.0);
                    let target = if preferred_free {
                        preferred.0
                    } else {
                        (1..=i16::MAX as u32).find(|id| !used.contains(id)).unwrap()
                    };
                    let reason = if preferred_free {
                        PopulationTargetReason::PreferredSlot
                    } else if preferred.0 > 0 {
                        PopulationTargetReason::PreferredOccupied
                    } else {
                        PopulationTargetReason::NextOpenSlot
                    };
                    assert_eq!(
                        row,
                        MonsterPopulationRow {
                            identity,
                            preferred_id: preferred,
                            target_id: NativeRecordId(target),
                            reason,
                        }
                    );
                    used.insert(target);
                }
            }
        }
    }
}
