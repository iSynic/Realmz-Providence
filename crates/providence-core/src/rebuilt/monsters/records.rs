use super::definition::{definition, signed_magnitude};
use super::{RebuiltV3MonsterDefinition, RebuiltV3MonsterDescription, RebuiltV3MonsterError};
use crate::{
    codecs::validate_monster_record_shape,
    model::{MonsterRecord, StableId},
};
use std::collections::{BTreeMap, BTreeSet};

// Value-range compatibility and deferred references are separate policies:
// full imported v4 catalogs allow the former without relaxing the latter.
pub(super) struct RecordProjection<'a> {
    pub descriptions: &'a BTreeMap<u32, RebuiltV3MonsterDescription>,
    pub macro_ids: &'a BTreeSet<u32>,
    pub allow_deferred: bool,
    pub allow_v4_values: bool,
}

impl RecordProjection<'_> {
    pub(super) fn project(
        &self,
        monster: &MonsterRecord,
        set_id: i16,
    ) -> Result<RebuiltV3MonsterDefinition, RebuiltV3MonsterError> {
        validate_identity_and_shape(monster, set_id)?;
        let random_weapon_table = self.validate_values(monster)?;
        Ok(definition(
            monster,
            set_id,
            self.descriptions,
            random_weapon_table,
        ))
    }

    fn validate_values(&self, monster: &MonsterRecord) -> Result<u32, RebuiltV3MonsterError> {
        // Classic stores this count as a signed byte. Imported packages retain the
        // source value even when it cannot be executed against the fixed five-row
        // attack table; runtime bounds execution to the rows that are present.
        if !self.allow_deferred && !(0..=5).contains(&monster.attack_count) {
            return invalid_record(monster, "attackCount must be between 0 and 5");
        }
        if !self.allow_v4_values && monster.magic_to_hit < 0 {
            return invalid_record(monster, "magicToHit must be between 0 and 127");
        }
        let random_weapon_table = if monster.weapon < 0 {
            signed_magnitude(monster.weapon)
        } else {
            0
        };
        if random_weapon_table > 10 && !self.allow_v4_values {
            return invalid_record(monster, "random weapon table must be between 0 and 10");
        }
        for item_id in monster.items.iter().copied().filter(|id| *id != 0) {
            if !self.allow_deferred && signed_magnitude(item_id) > 999 {
                return invalid_record(monster, "item slot is outside the Classic 1..=999 catalog");
            }
        }
        if !self.allow_deferred && monster.weapon > 999 {
            return invalid_record(monster, "weapon is outside the Classic 1..=999 catalog");
        }
        if !self.allow_deferred && monster.death_macro != 0 {
            let macro_id = signed_magnitude(monster.death_macro);
            if !self.macro_ids.contains(&macro_id) {
                return Err(RebuiltV3MonsterError::MissingDeathMacro {
                    monster: monster.identity.clone(),
                    macro_id,
                });
            }
        }

        Ok(random_weapon_table)
    }
}

fn validate_identity_and_shape(
    monster: &MonsterRecord,
    set_id: i16,
) -> Result<(), RebuiltV3MonsterError> {
    let expected = StableId(format!("monster:{set_id}:{}", monster.native_id.0));
    if monster.identity != expected {
        return Err(RebuiltV3MonsterError::InvalidIdentity {
            expected,
            actual: monster.identity.clone(),
        });
    }
    validate_monster_record_shape(monster).map_err(|error| {
        RebuiltV3MonsterError::InvalidRecord {
            monster: monster.identity.clone(),
            reason: error.to_string(),
        }
    })?;
    Ok(())
}

fn invalid_record<T>(monster: &MonsterRecord, reason: &str) -> Result<T, RebuiltV3MonsterError> {
    Err(RebuiltV3MonsterError::InvalidRecord {
        monster: monster.identity.clone(),
        reason: reason.into(),
    })
}
