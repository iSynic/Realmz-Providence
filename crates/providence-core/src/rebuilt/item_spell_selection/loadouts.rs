use super::{
    RebuiltV3ReachableCombatSelection, RebuiltV3ReachableItemSpellError as Error,
    RebuiltV3RuntimeDefinitionRelation as Relation, selection::Selection,
};
use crate::{model::StableId, rebuilt::RebuiltV3MonsterDefinition};

pub(super) fn collect(
    combat: &RebuiltV3ReachableCombatSelection,
    selection: &mut Selection,
) -> Result<(), Error> {
    for monster in combat.all_monsters() {
        items(monster, selection)?;
        spells(monster, selection)?;
        incidental_rewards(monster, selection)?;
    }
    Ok(())
}

fn items(monster: &RebuiltV3MonsterDefinition, selection: &mut Selection) -> Result<(), Error> {
    for (slot, target) in monster.item_ids.iter().enumerate() {
        if !target.is_empty() {
            selection.stable_item(
                monster.id.clone(),
                format!("itemIds[{slot}]"),
                &StableId(target.clone()),
                Relation::MonsterLoadout,
            )?;
        }
    }
    if !monster.weapon_id.is_empty() {
        selection.stable_item(
            monster.id.clone(),
            "weaponId".into(),
            &StableId(monster.weapon_id.clone()),
            Relation::MonsterLoadout,
        )?;
    }
    if monster.required_weapon > 0 {
        selection.item(
            monster.id.clone(),
            "requiredWeapon".into(),
            i16::from(monster.required_weapon),
            Relation::MonsterLoadout,
        )?;
    }
    Ok(())
}

fn spells(monster: &RebuiltV3MonsterDefinition, selection: &mut Selection) -> Result<(), Error> {
    for (slot, target) in monster.spell_ids.iter().enumerate() {
        if !target.is_empty() {
            selection.stable_spell(
                monster.id.clone(),
                format!("spellIds[{slot}]"),
                &StableId(target.clone()),
                Relation::MonsterLoadout,
            )?;
        }
    }
    Ok(())
}

fn incidental_rewards(
    monster: &RebuiltV3MonsterDefinition,
    selection: &mut Selection,
) -> Result<(), Error> {
    let type_flag = |index: usize| monster.type_flags.get(index).copied().unwrap_or(0) != 0;
    for (classic_id, eligible) in [
        (
            806,
            monster.can_summon != -1 && type_flag(0) && !type_flag(7),
        ),
        (
            877,
            monster.can_summon != -1 && !type_flag(7) && !type_flag(1),
        ),
    ] {
        if eligible {
            selection.item(
                monster.id.clone(),
                format!("incidentalBattleReward[{classic_id}]"),
                classic_id,
                Relation::IncidentalBattleReward,
            )?;
        }
    }
    Ok(())
}
