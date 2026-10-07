use super::inputs::BattleInputs;
use super::{RebuiltV3BattleDefinition, RebuiltV3BattleError, RebuiltV3BattleMonsterSlot};
use crate::{
    codecs::{BATTLE_GRID_WIDTH, validate_battle_record_shape},
    model::{BattleRecord, StableId},
};
use std::collections::BTreeSet;

impl BattleInputs {
    pub(super) fn project(
        &self,
        battle: &BattleRecord,
    ) -> Result<RebuiltV3BattleDefinition, RebuiltV3BattleError> {
        validate_identity_and_shape(battle)?;
        self.validate_references(battle)?;
        Ok(RebuiltV3BattleDefinition {
            id: StableId(format!("classic.battle.{}", battle.native_id.0)),
            classic_id: battle.native_id.0,
            monster_slots: self.monster_slots(battle)?,
            distance: battle.distance,
            message_before_id: battle.message_before,
            message_after_id: battle.message_after,
            macro_id: battle.battle_macro,
        })
    }

    fn validate_references(&self, battle: &BattleRecord) -> Result<(), RebuiltV3BattleError> {
        if !self.allow_deferred {
            validate_message(
                battle,
                "messageBeforeId",
                battle.message_before,
                &self.message_ids,
            )?;
            validate_message(
                battle,
                "messageAfterId",
                battle.message_after,
                &self.message_ids,
            )?;
        }
        if !self.allow_deferred && battle.battle_macro != 0 {
            let macro_id = signed_magnitude(battle.battle_macro);
            if !self.macro_ids.contains(&macro_id) {
                return Err(RebuiltV3BattleError::MissingMacro {
                    battle: battle.identity.clone(),
                    macro_id,
                });
            }
        }

        Ok(())
    }

    fn monster_slots(
        &self,
        battle: &BattleRecord,
    ) -> Result<Vec<RebuiltV3BattleMonsterSlot>, RebuiltV3BattleError> {
        let mut monster_slots = Vec::new();
        for (slot, raw_id) in battle.grid.iter().copied().enumerate() {
            if raw_id == 0 {
                continue;
            }
            let monster_id = signed_magnitude(raw_id);
            if !self.normal_monster_ids.contains(&monster_id) && !self.allow_deferred {
                return Err(RebuiltV3BattleError::MissingMonster {
                    battle: battle.identity.clone(),
                    slot,
                    monster_id,
                });
            }
            monster_slots.push(RebuiltV3BattleMonsterSlot {
                x: (slot / BATTLE_GRID_WIDTH) as u8,
                y: (slot % BATTLE_GRID_WIDTH) as u8,
                monster_id: StableId(format!("classic.monster.{monster_id}")),
                invert_traitor: raw_id < 0,
            });
        }
        Ok(monster_slots)
    }
}

fn validate_identity_and_shape(battle: &BattleRecord) -> Result<(), RebuiltV3BattleError> {
    let expected_identity = StableId(format!("battle:{}", battle.native_id.0));
    if battle.identity != expected_identity {
        return Err(RebuiltV3BattleError::InvalidIdentity {
            expected: expected_identity,
            actual: battle.identity.clone(),
        });
    }
    validate_battle_record_shape(battle).map_err(|error| RebuiltV3BattleError::InvalidRecord {
        battle: battle.identity.clone(),
        reason: error.to_string(),
    })?;
    Ok(())
}

fn validate_message(
    battle: &BattleRecord,
    field: &'static str,
    raw_id: i16,
    message_ids: &BTreeSet<u32>,
) -> Result<(), RebuiltV3BattleError> {
    if raw_id == 0 {
        return Ok(());
    }
    let message_id = signed_magnitude(raw_id);
    if message_ids.contains(&message_id) {
        Ok(())
    } else {
        Err(RebuiltV3BattleError::MissingMessage {
            battle: battle.identity.clone(),
            field,
            message_id,
        })
    }
}

fn signed_magnitude(value: i16) -> u32 {
    i32::from(value).unsigned_abs()
}
