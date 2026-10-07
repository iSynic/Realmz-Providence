//! Read-only Library slot presentation; does not alter runtime/reference compilation.
use serde::Serialize;

use crate::model::{MonsterRecord, ProjectSnapshot, StableId};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewResolution {
    Resolved,
    Ambiguous,
    ContextUnavailable,
    Missing,
    UnsupportedSigned,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotPreview {
    pub slot: usize,
    pub raw_id: i16,
    pub target: Option<StableId>,
    pub label: Option<String>,
    pub resolution: PreviewResolution,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterReferencePreview {
    pub spells: Vec<SlotPreview>,
    pub items: Vec<SlotPreview>,
}

#[derive(Clone, Copy)]
struct Definition<'a> {
    id: &'a StableId,
    classic_id: i16,
    name: &'a str,
}

/// Completeness is caller evidence, never inferred from an empty definition list.
pub fn preview_monster_references(
    snapshot: &ProjectSnapshot,
    monster: &MonsterRecord,
    application_items_complete: bool,
    application_spells_complete: bool,
) -> Result<MonsterReferencePreview, &'static str> {
    if monster.spells.len() > 10 || monster.items.len() > 6 {
        return Err("Monster reference preview exceeds native slot geometry");
    }
    let standard_items: Vec<_> = snapshot
        .item_rules
        .iter()
        .map(|row| Definition {
            id: &row.definition.id,
            classic_id: row.definition.classic_id,
            name: &row.definition.name,
        })
        .collect();
    let scenario_items: Vec<_> = snapshot
        .scenario_item_rules
        .iter()
        .map(|row| Definition {
            id: &row.definition.id,
            classic_id: row.definition.classic_id,
            name: &row.definition.name,
        })
        .collect();
    let standard_spells: Vec<_> = snapshot
        .standard_spells
        .iter()
        .map(|row| Definition {
            id: &row.definition.id,
            classic_id: row.definition.classic_id,
            name: &row.definition.name,
        })
        .collect();
    let scenario_spells: Vec<_> = snapshot
        .scenario_spells
        .iter()
        .map(|row| Definition {
            id: &row.definition.id,
            classic_id: row.definition.classic_id,
            name: &row.definition.name,
        })
        .collect();
    Ok(MonsterReferencePreview {
        spells: slots(
            &monster.spells,
            &standard_spells,
            &scenario_spells,
            application_spells_complete,
            false,
        ),
        items: slots(
            &monster.items,
            &standard_items,
            &scenario_items,
            application_items_complete,
            true,
        ),
    })
}

fn slots(
    raw: &[i16],
    standard: &[Definition<'_>],
    scenario: &[Definition<'_>],
    complete: bool,
    signed_item: bool,
) -> Vec<SlotPreview> {
    let effective: Vec<_> = standard
        .iter()
        .filter(|row| !scenario.iter().any(|replacement| replacement.id == row.id))
        .chain(scenario.iter())
        .collect();
    raw.iter()
        .copied()
        .enumerate()
        .filter(|(_, id)| *id != 0)
        .map(|(slot, raw_id)| {
            let mut result = SlotPreview {
                slot,
                raw_id,
                target: None,
                label: None,
                resolution: PreviewResolution::ContextUnavailable,
            };
            let Some(classic_id) = raw_id.checked_abs() else {
                result.resolution = PreviewResolution::UnsupportedSigned;
                return result;
            };
            if raw_id < 0 && !signed_item {
                result.resolution = PreviewResolution::UnsupportedSigned;
                return result;
            }
            let matches: Vec<_> = effective
                .iter()
                .filter(|row| row.classic_id == classic_id)
                .collect();
            match matches.as_slice() {
                [row] => {
                    result.resolution = PreviewResolution::Resolved;
                    result.target = Some(row.id.clone());
                    result.label = Some(row.name.to_owned());
                }
                [] if complete => result.resolution = PreviewResolution::Missing,
                [] => (),
                _ => result.resolution = PreviewResolution::Ambiguous,
            }
            result
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_projection_is_bounded_deterministic_and_does_not_mutate_sources() {
        use crate::codecs::{
            MONSTER_RECORD_BYTES, SPELL_RECORD_BYTES, decode_monsters, decode_standard_spells,
        };
        let mut snapshot = ProjectSnapshot::new_authored(StableId("fixture".into()));
        snapshot.standard_spells = decode_standard_spells(&[0; SPELL_RECORD_BYTES], None).spells;
        let id = snapshot.standard_spells[0].definition.classic_id;
        snapshot.standard_spells[0].definition.name = "Source spell".into();
        let mut monster = decode_monsters(&vec![0; MONSTER_RECORD_BYTES], "Data MD", 0)
            .records
            .remove(0);
        monster.spells = vec![id, 0, id];
        let before = snapshot.clone();
        let first = preview_monster_references(&snapshot, &monster, false, false).unwrap();
        assert_eq!(first.spells.len(), 2);
        assert_eq!(first.spells[1].slot, 2);
        assert_eq!(first.spells[0].label.as_deref(), Some("Source spell"));
        assert_eq!(
            first,
            preview_monster_references(&snapshot, &monster, false, false).unwrap()
        );
        assert_eq!(snapshot, before);
        monster.items = vec![1; 7];
        assert!(preview_monster_references(&snapshot, &monster, false, false).is_err());
    }

    #[test]
    fn exact_identity_overlay_and_classic_collision_are_distinct() {
        let id = StableId("classic.item.93".into());
        let other = StableId("custom.item.93".into());
        let standard = [Definition {
            id: &id,
            classic_id: 93,
            name: "Application",
        }];
        let replacement = [Definition {
            id: &id,
            classic_id: 93,
            name: "Scenario",
        }];
        let projected = slots(&[93, -93, 0, 93], &standard, &replacement, false, true);
        assert_eq!(projected.len(), 3);
        assert_eq!(projected[1].raw_id, -93);
        assert_eq!(projected[2].slot, 3);
        assert!(projected.iter().all(
            |row| row.label.as_deref() == Some("Scenario") && row.target.as_ref() == Some(&id)
        ));
        let collision = [Definition {
            id: &other,
            classic_id: 93,
            name: "Other",
        }];
        let projected = slots(&[93], &standard, &collision, true, true);
        assert_eq!(projected[0].resolution, PreviewResolution::Ambiguous);
        assert!(projected[0].target.is_none() && projected[0].label.is_none());
    }

    #[test]
    fn absent_context_and_signed_spells_never_invent_missing_targets() {
        assert_eq!(
            slots(&[2103], &[], &[], false, false)[0].resolution,
            PreviewResolution::ContextUnavailable
        );
        assert_eq!(
            slots(&[2103], &[], &[], true, false)[0].resolution,
            PreviewResolution::Missing
        );
        assert_eq!(
            slots(&[-2103], &[], &[], true, false)[0].resolution,
            PreviewResolution::UnsupportedSigned
        );
        assert_eq!(
            slots(&[i16::MIN], &[], &[], true, true)[0].resolution,
            PreviewResolution::UnsupportedSigned
        );
    }
}
