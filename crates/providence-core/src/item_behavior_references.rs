use crate::{
    model::{ItemRuleDefinition, ProjectSnapshot, StableId},
    references::{ReferenceDescriptor, ResolutionState, TargetKind},
    rule_references::reference_for_stable_target,
};
use std::collections::BTreeSet;

pub(crate) fn references(
    snapshot: &ProjectSnapshot,
    item_ids: &BTreeSet<StableId>,
    race_ids: &BTreeSet<StableId>,
    caste_ids: &BTreeSet<StableId>,
) -> Vec<ReferenceDescriptor> {
    let mut references = Vec::new();
    for item in snapshot.item_rules.iter().map(|row| &row.definition).chain(
        snapshot
            .scenario_item_rules
            .iter()
            .map(|row| &row.definition),
    ) {
        for (field, kind, target, ids) in [
            (
                "cursedItemId",
                TargetKind::Item,
                item.cursed_item_id.as_ref(),
                item_ids,
            ),
            (
                "specificRaceId",
                TargetKind::Race,
                item.specific_race_id.as_ref(),
                race_ids,
            ),
            (
                "specificCasteId",
                TargetKind::Caste,
                item.specific_caste_id.as_ref(),
                caste_ids,
            ),
        ] {
            if let Some(target) = target {
                references.push(reference_for_stable_target(
                    item.id.clone(),
                    field.into(),
                    kind,
                    target.clone(),
                    ids.contains(target),
                ));
            }
        }
        append_effect_references(snapshot, item, &mut references);
        if item.sound_id != 0 {
            references.push(sound_reference(snapshot, item));
        }
    }
    references
}

fn append_effect_references(
    snapshot: &ProjectSnapshot,
    item: &ItemRuleDefinition,
    references: &mut Vec<ReferenceDescriptor>,
) {
    // These are the same operand-addressed dependencies used by Rebuilt closure.
    if item.item_type.unsigned_abs() == 23 || item.special[0] == -23 {
        let id = item.special[4];
        let resolved = snapshot
            .extra_action_points
            .iter()
            .any(|row| i64::from(row.native_id.0) == i64::from(id));
        references.push(reference_for_stable_target(
            item.id.clone(),
            "special[4]".into(),
            TargetKind::ExtraActionPoint,
            StableId(id.to_string()),
            resolved,
        ));
    }
    if item.special[1] > 1100 {
        let id = item.special[1];
        let matches = snapshot
            .standard_spells
            .iter()
            .chain(snapshot.scenario_spells.iter())
            .filter(|row| i32::from(row.definition.classic_id) == id)
            .collect::<Vec<_>>();
        let target = matches.first().map_or_else(
            || StableId(format!("classic.spell.{id}")),
            |row| row.definition.id.clone(),
        );
        let mut reference = reference_for_stable_target(
            item.id.clone(),
            "special[1]".into(),
            TargetKind::Spell,
            target,
            matches.len() == 1,
        );
        if matches.len() > 1 {
            reference.resolution = ResolutionState::Ambiguous;
        }
        references.push(reference);
    }
}

fn sound_reference(snapshot: &ProjectSnapshot, item: &ItemRuleDefinition) -> ReferenceDescriptor {
    let number = crate::item_sound::resource_id(item.sound_id).unwrap_or(0);
    let matches = snapshot
        .assets
        .iter()
        .filter(|asset| {
            asset
                .classic_resource
                .as_ref()
                .is_some_and(|key| key.resource_type == "snd " && key.resource_id == number)
        })
        .collect::<Vec<_>>();
    let valid = matches.len() == 1 && matches[0].kind == "sound" && matches[0].byte_length > 0;
    let target = matches.first().map_or_else(
        || StableId(number.to_string()),
        |asset| asset.identity.clone(),
    );
    let mut reference = reference_for_stable_target(
        item.id.clone(),
        "soundId".into(),
        TargetKind::Sound,
        target,
        valid,
    );
    if matches.len() > 1 {
        reference.resolution = ResolutionState::Ambiguous;
    } else if matches.is_empty() && i16::try_from(number).is_ok() {
        reference.resolution = ResolutionState::StockFallback;
        reference.stock_fallback = Some("Realmz application sounds".into());
    }
    reference
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        codecs::new_scenario_item_definition,
        model::{BlobId, SourcedScenarioItemRule},
    };

    #[test]
    fn item_effect_references_keep_zero_xap_spell_and_signed_sound_identities() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("item-uses".into()));
        let mut definition = new_scenario_item_definition(100).unwrap();
        definition.item_type = -23;
        definition.special = [0, 1201, 0, 0, 0];
        definition.sound_id = -185;
        snapshot.scenario_item_rules.push(SourcedScenarioItemRule {
            record_index: 100,
            source: "controlled native Item".into(),
            source_blob: BlobId("binary".into()),
            text_source_blob: None,
            definition,
        });
        let ids = BTreeSet::new();
        let rows = references(&snapshot, &ids, &ids, &ids);
        let xap = rows
            .iter()
            .find(|row| row.target_kind == TargetKind::ExtraActionPoint)
            .unwrap();
        assert_eq!(xap.target_id, "0");
        assert_eq!(xap.field.0, "special[4]");
        assert_eq!(xap.resolution, ResolutionState::Missing);
        let spell = rows
            .iter()
            .find(|row| row.target_kind == TargetKind::Spell)
            .unwrap();
        assert_eq!(spell.target_id, "classic.spell.1201");
        let sound = rows
            .iter()
            .find(|row| row.target_kind == TargetKind::Sound)
            .unwrap();
        assert_eq!(sound.target_id, "415");
        assert_eq!(sound.resolution, ResolutionState::StockFallback);
        snapshot.scenario_item_rules[0].definition.item_type = 0;
        snapshot.scenario_item_rules[0].definition.special = [0; 5];
        assert!(
            references(&snapshot, &ids, &ids, &ids)
                .iter()
                .all(|row| row.target_kind != TargetKind::ExtraActionPoint
                    && row.target_kind != TargetKind::Spell)
        );
    }
}
