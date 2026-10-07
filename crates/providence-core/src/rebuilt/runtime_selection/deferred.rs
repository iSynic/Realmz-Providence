use super::sources::{SelectedCatalogs, SelectedEncounters};
use crate::model::{ProjectSnapshot, StableId};
use crate::rebuilt::{
    RebuiltV3DeferredDisposition, RebuiltV3DeferredReference,
    combat_selection::RebuiltV3ReachableCombatSelection,
    item_spell_selection::RebuiltV3RuntimeDefinitionKind,
    owner_selection::RebuiltV3RuntimeCatalogKind,
    reachability::{
        RebuiltV3ReachabilityReference, RebuiltV3ReachabilityReport, RebuiltV3ReachabilityTarget,
    },
};
use std::collections::BTreeSet;

pub(super) fn collect(
    snapshot: &ProjectSnapshot,
    reachability: &RebuiltV3ReachabilityReport,
    encounters: &SelectedEncounters,
    catalogs: &SelectedCatalogs,
    combat: &RebuiltV3ReachableCombatSelection,
) -> BTreeSet<RebuiltV3DeferredReference> {
    let mut deferred_references = reachability
        .unresolved_references
        .iter()
        .map(deferred_reachability_reference)
        .collect();
    super::instructions::collect(snapshot, &encounters.scenario, &mut deferred_references);
    collect_messages(catalogs, &mut deferred_references);
    collect_owners(catalogs, &mut deferred_references);
    collect_rogue_targets(encounters, &mut deferred_references);
    collect_quarantined_timers(catalogs, &mut deferred_references);
    collect_post_action_maps(snapshot, encounters, &mut deferred_references);
    collect_item_spells(catalogs, &mut deferred_references);
    collect_battle_references(snapshot, combat, &mut deferred_references);
    collect_monster_programs(snapshot, combat, &mut deferred_references);
    deferred_references
}

fn collect_messages(
    catalogs: &SelectedCatalogs,
    deferred_references: &mut BTreeSet<RebuiltV3DeferredReference>,
) {
    deferred_references.extend(
        catalogs
            .messages
            .missing_references
            .iter()
            .map(|reference| RebuiltV3DeferredReference {
                source: reference.source.clone(),
                field: reference.field_path.clone(),
                target_kind: "message".into(),
                target_id: reference.message_native_id.to_string(),
                reason: "the referenced Classic message is unavailable".into(),
                disposition: RebuiltV3DeferredDisposition::Deferred,
            }),
    );
}

fn collect_owners(
    catalogs: &SelectedCatalogs,
    deferred_references: &mut BTreeSet<RebuiltV3DeferredReference>,
) {
    let emitted_treasure_ids = catalogs
        .owners
        .reachable_treasure_ids
        .iter()
        .copied()
        .collect::<std::collections::BTreeSet<_>>();
    let emitted_shop_ids = catalogs
        .owners
        .reachable_shop_ids
        .iter()
        .copied()
        .collect::<std::collections::BTreeSet<_>>();
    deferred_references.extend(catalogs.owners.references.iter().filter_map(|reference| {
        let emitted = match reference.target_kind {
            RebuiltV3RuntimeCatalogKind::Treasure => {
                emitted_treasure_ids.contains(&reference.target_native_id)
            }
            RebuiltV3RuntimeCatalogKind::Shop => {
                emitted_shop_ids.contains(&reference.target_native_id)
            }
        };
        (!emitted).then(|| RebuiltV3DeferredReference {
            source: reference.source.clone(),
            field: reference.field_path.clone(),
            target_kind: format!("{:?}", reference.target_kind).to_ascii_lowercase(),
            target_id: reference.target_native_id.to_string(),
            reason: "the referenced Classic catalog record is unavailable".into(),
            disposition: RebuiltV3DeferredDisposition::Deferred,
        })
    }));
}

fn collect_rogue_targets(
    encounters: &SelectedEncounters,
    deferred_references: &mut BTreeSet<RebuiltV3DeferredReference>,
) {
    deferred_references.extend(encounters.complex.iter().filter_map(|encounter| {
        let id = u32::try_from(encounter.thief_success).ok()?;
        (encounter.thief && !encounters.rogue_ids.contains(&id)).then(|| {
            RebuiltV3DeferredReference {
                source: StableId(format!("complex-encounter:{}", encounter.id)),
                field: "thiefSuccess".into(),
                target_kind: "rogue-encounter".into(),
                target_id: id.to_string(),
                reason: "the referenced Classic Rogue Encounter is unavailable".into(),
                disposition: RebuiltV3DeferredDisposition::Deferred,
            }
        })
    }));
}

fn collect_quarantined_timers(
    catalogs: &SelectedCatalogs,
    deferred_references: &mut BTreeSet<RebuiltV3DeferredReference>,
) {
    deferred_references.extend(
        catalogs
            .owners
            .quarantined_timed_encounter_ids
            .iter()
            .map(|id| RebuiltV3DeferredReference {
                source: StableId(format!("timed-encounter:{id}")),
                field: "record".into(),
                target_kind: "timed-encounter".into(),
                target_id: id.to_string(),
                reason: "the imported Classic Timed Encounter cannot be represented safely".into(),
                disposition: RebuiltV3DeferredDisposition::Quarantined,
            }),
    );
}

fn collect_post_action_maps(
    snapshot: &ProjectSnapshot,
    encounters: &SelectedEncounters,
    deferred_references: &mut BTreeSet<RebuiltV3DeferredReference>,
) {
    let emitted_map_ids = snapshot
        .world
        .maps
        .iter()
        .map(|map| map.identity.clone())
        .collect::<std::collections::BTreeSet<_>>();
    let emitted_program_ids = encounters
        .scenario
        .programs
        .iter()
        .map(|program| program.id.clone())
        .collect::<std::collections::BTreeSet<_>>();
    deferred_references.extend(snapshot.world.action_points.iter().filter_map(|trigger| {
        if !emitted_program_ids.contains(&crate::rebuilt::runtime_ids::action_point_program_id(
            trigger,
        )) {
            return None;
        }
        let destination_map_id = StableId(format!(
            "{}:{}",
            match trigger.level_type {
                crate::model::LevelType::Land => "land",
                crate::model::LevelType::Dungeon => "dungeon",
            },
            trigger.post_action_level
        ));
        (!emitted_map_ids.contains(&destination_map_id)).then(|| RebuiltV3DeferredReference {
            source: crate::rebuilt::runtime_ids::action_point_id(trigger),
            field: "postActionLocation.mapId".into(),
            target_kind: "map".into(),
            target_id: destination_map_id.0,
            reason: "the imported Classic post-action map is unavailable".into(),
            disposition: RebuiltV3DeferredDisposition::Deferred,
        })
    }));
}

fn collect_item_spells(
    catalogs: &SelectedCatalogs,
    deferred_references: &mut BTreeSet<RebuiltV3DeferredReference>,
) {
    let emitted_item_ids = catalogs
        .item_spells
        .items
        .iter()
        .map(|item| item.id.clone())
        .collect::<std::collections::BTreeSet<_>>();
    let emitted_spell_ids = catalogs
        .item_spells
        .spells
        .iter()
        .map(|spell| spell.id.clone())
        .collect::<std::collections::BTreeSet<_>>();
    deferred_references.extend(
        catalogs
            .item_spells
            .references
            .iter()
            .filter_map(|reference| {
                let emitted = match reference.target_kind {
                    RebuiltV3RuntimeDefinitionKind::Item => {
                        emitted_item_ids.contains(&reference.target_id)
                    }
                    RebuiltV3RuntimeDefinitionKind::Spell => {
                        emitted_spell_ids.contains(&reference.target_id)
                    }
                };
                (!emitted).then(|| RebuiltV3DeferredReference {
                    source: reference.source.clone(),
                    field: reference.field_path.clone(),
                    target_kind: format!("{:?}", reference.target_kind).to_ascii_lowercase(),
                    target_id: reference.classic_id.to_string(),
                    reason: "the referenced Classic runtime definition is unavailable".into(),
                    disposition: RebuiltV3DeferredDisposition::Deferred,
                })
            }),
    );
}

fn collect_battle_references(
    snapshot: &ProjectSnapshot,
    combat: &RebuiltV3ReachableCombatSelection,
    deferred_references: &mut BTreeSet<RebuiltV3DeferredReference>,
) {
    let available_message_ids = snapshot
        .messages
        .iter()
        .map(|message| message.native_id.0)
        .collect::<std::collections::BTreeSet<_>>();
    let available_program_ids = snapshot
        .extra_action_points
        .iter()
        .map(|row| row.native_id.0)
        .collect::<std::collections::BTreeSet<_>>();
    for battle in &combat.battles {
        for (field, value) in [
            ("messageBeforeId", battle.message_before_id),
            ("messageAfterId", battle.message_after_id),
        ] {
            let id = i32::from(value).unsigned_abs();
            if value != 0 && !available_message_ids.contains(&id) {
                deferred_references.insert(RebuiltV3DeferredReference {
                    source: battle.id.clone(),
                    field: field.into(),
                    target_kind: "message".into(),
                    target_id: id.to_string(),
                    reason: "the referenced Classic battle message is unavailable".into(),
                    disposition: RebuiltV3DeferredDisposition::Deferred,
                });
            }
        }
        let id = i32::from(battle.macro_id).unsigned_abs();
        if battle.macro_id != 0 && !available_program_ids.contains(&id) {
            deferred_references.insert(RebuiltV3DeferredReference {
                source: battle.id.clone(),
                field: "macroId".into(),
                target_kind: "program".into(),
                target_id: format!("xap:{id}"),
                reason: "the referenced Classic after-battle program is unavailable".into(),
                disposition: RebuiltV3DeferredDisposition::Deferred,
            });
        }
    }
}

fn collect_monster_programs(
    snapshot: &ProjectSnapshot,
    combat: &RebuiltV3ReachableCombatSelection,
    deferred_references: &mut BTreeSet<RebuiltV3DeferredReference>,
) {
    let available_program_ids = snapshot
        .extra_action_points
        .iter()
        .map(|row| row.native_id.0)
        .collect::<BTreeSet<_>>();
    for monster in combat.all_monsters() {
        let id = i32::from(monster.death_macro).unsigned_abs();
        if monster.death_macro != 0 && !available_program_ids.contains(&id) {
            deferred_references.insert(RebuiltV3DeferredReference {
                source: monster.id.clone(),
                field: "deathMacro".into(),
                target_kind: "program".into(),
                target_id: format!("xap:{id}"),
                reason: "the referenced Classic monster death program is unavailable".into(),
                disposition: RebuiltV3DeferredDisposition::Deferred,
            });
        }
    }
}
fn deferred_reachability_reference(
    reference: &RebuiltV3ReachabilityReference,
) -> RebuiltV3DeferredReference {
    let (target_kind, target_id) = match &reference.target {
        RebuiltV3ReachabilityTarget::Program(id) => ("program", id.0.clone()),
        RebuiltV3ReachabilityTarget::SimpleEncounter(id) => ("simple-encounter", id.to_string()),
        RebuiltV3ReachabilityTarget::ComplexEncounter(id) => ("complex-encounter", id.to_string()),
        RebuiltV3ReachabilityTarget::Battle(id) => ("battle", id.to_string()),
        RebuiltV3ReachabilityTarget::Monster(id) => ("monster", id.to_string()),
        RebuiltV3ReachabilityTarget::ExtraCode(id) => ("extra-code", id.to_string()),
        RebuiltV3ReachabilityTarget::RuntimeNoOp(id) => ("runtime-no-op", id.clone()),
        RebuiltV3ReachabilityTarget::Invalid(id) => ("invalid", id.clone()),
    };
    RebuiltV3DeferredReference {
        source: reference.source.clone(),
        field: reference.field.clone(),
        target_kind: target_kind.into(),
        target_id,
        reason: format!(
            "the imported Classic {:?} reference does not resolve",
            reference.relation
        ),
        disposition: RebuiltV3DeferredDisposition::Deferred,
    }
}
