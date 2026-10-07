use crate::codecs::validate_monster_record_shape;
use crate::model::ClassicSourceBlob;
use crate::model::MonsterDescription;
use crate::model::MonsterRecord;
use crate::model::MonsterSet;
use crate::model::NativeRecordId;
use crate::model::ProjectSnapshot;
use crate::model::StableId;
use crate::session::errors::SessionError;
use std::collections::BTreeSet;

pub(super) fn monster_native_path(set_id: i16) -> Option<&'static str> {
    match set_id {
        -1 => Some("Data MD-1"),
        0 => Some("Data MD"),
        1 => Some("Data MD1"),
        _ => None,
    }
}

pub(super) fn monster_identity(set_id: i16, native_id: NativeRecordId) -> StableId {
    StableId(format!("monster:{set_id}:{}", native_id.0))
}

pub(super) fn validate_monster_set_id(
    set_id: i16,
    identity: &StableId,
) -> Result<(), SessionError> {
    monster_native_path(set_id)
        .map(|_| ())
        .ok_or_else(|| SessionError::InvalidMonster {
            identity: identity.clone(),
            reason: format!("set {set_id} is not one of Classic's -1, 0, or 1 monster sets"),
        })
}

pub(super) fn validate_monster_native_id(
    native_id: NativeRecordId,
    identity: &StableId,
) -> Result<(), SessionError> {
    if native_id.0 > i16::MAX as u32 {
        return Err(SessionError::InvalidMonster {
            identity: identity.clone(),
            reason: "record ID exceeds Classic's positive signed-short reference range".into(),
        });
    }
    Ok(())
}

pub(super) fn monster_record_is_active(monster: &MonsterRecord) -> bool {
    monster.hit_dice != 0
}

pub(super) fn monster_for_set(
    snapshot: &ProjectSnapshot,
    set_id: i16,
    native_id: NativeRecordId,
) -> Option<&MonsterRecord> {
    snapshot
        .monster_sets
        .iter()
        .find(|set| set.set_id == set_id)
        .and_then(|set| {
            set.monsters
                .iter()
                .find(|monster| monster.native_id == native_id)
        })
}

pub(super) fn authored_monster(native_id: NativeRecordId, set_id: i16) -> MonsterRecord {
    MonsterRecord {
        identity: monster_identity(set_id, native_id),
        native_id,
        hit_dice: 1,
        stamina_bonus: 0,
        agility: 10,
        name_id: native_id.0 as u8,
        movement_max: 10,
        armor: 0,
        magic_resistance: 0,
        required_weapon: 0,
        traitor: 0,
        size: 1,
        type_flags: vec![0; 8],
        attack_count: 1,
        magic_attack_count: 0,
        attacks: vec![vec![0; 4]; 5],
        damage_bonus: 0,
        cast_percent: 0,
        run_percent: 0,
        surrender_percent: 0,
        missile_percent: 0,
        can_summon: 0,
        saves: vec![0; 6],
        spell_immunities: vec![0; 6],
        money: vec![0; 3],
        spells: vec![0; 10],
        items: vec![0; 6],
        weapon: 0,
        icon_id: 0,
        spell_points: 0,
        experience: 0,
        stamina: 0,
        stamina_max: 0,
        underneath: vec![0; 4],
        target: 0,
        guarding: 0,
        not_on_menu: false,
        been_attacked: 0,
        movement: 0,
        magic_to_hit: 0,
        conditions: vec![0; 40],
        left_right: 0,
        up_down: 0,
        attack_number: 0,
        bonus_attack: 0,
        death_macro: 0,
        max_spell_points: 0,
        display_name: format!("Monster {}", native_id.0),
        authored: true,
    }
}

pub(super) fn cleared_monster(native_id: NativeRecordId, set_id: i16) -> MonsterRecord {
    MonsterRecord {
        hit_dice: 0,
        agility: 0,
        movement_max: 0,
        size: 0,
        attack_count: 0,
        display_name: String::new(),
        ..authored_monster(native_id, set_id)
    }
}

pub(super) fn monster_for_target(
    mut monster: MonsterRecord,
    set_id: i16,
    native_id: NativeRecordId,
) -> MonsterRecord {
    monster.identity = monster_identity(set_id, native_id);
    monster.native_id = native_id;
    monster.name_id = native_id.0 as u8;
    monster.authored = true;
    monster
}

pub(super) fn upsert_monster_record(
    snapshot: &mut ProjectSnapshot,
    set_id: i16,
    monster: MonsterRecord,
) {
    let native_path = monster_native_path(set_id).expect("validated Classic monster set");
    let set_index = snapshot
        .monster_sets
        .iter()
        .position(|set| set.set_id == set_id);
    let set = if let Some(index) = set_index {
        &mut snapshot.monster_sets[index]
    } else {
        snapshot.monster_sets.push(MonsterSet {
            set_id,
            native_path: native_path.into(),
            monsters: Vec::new(),
        });
        snapshot
            .monster_sets
            .last_mut()
            .expect("inserted monster set")
    };
    set.native_path = native_path.into();
    if let Some(existing) = set
        .monsters
        .iter_mut()
        .find(|candidate| candidate.native_id == monster.native_id)
    {
        *existing = monster;
    } else {
        set.monsters.push(monster);
    }
}

pub(super) fn authored_monster_description(
    native_id: NativeRecordId,
    text: String,
) -> MonsterDescription {
    MonsterDescription {
        identity: StableId(format!("monster-description:{}", native_id.0)),
        native_id,
        text,
        authored: true,
    }
}

pub(super) fn upsert_monster_description(
    snapshot: &mut ProjectSnapshot,
    description: MonsterDescription,
) {
    if let Some(existing) = snapshot
        .monster_descriptions
        .iter_mut()
        .find(|candidate| candidate.native_id == description.native_id)
    {
        *existing = description;
    } else {
        snapshot.monster_descriptions.push(description);
    }
}

pub(super) fn generated_monster_variant(source: &MonsterRecord, set_id: i16) -> MonsterRecord {
    let (
        hit_dice,
        stamina_bonus,
        agility,
        movement_max,
        armor,
        magic_resistance,
        damage_bonus,
        saves,
        spell_numerator,
        spell_denominator,
        exp_numerator,
        exp_denominator,
    ) = if set_id == 1 {
        (6, 6, 1, 2, 10, 10, 2, 10, 133, 100, 5, 4)
    } else {
        (15, 15, 3, 4, 30, 25, 5, 25, 2, 1, 25, 16)
    };
    let mut variant = monster_for_target(source.clone(), set_id, source.native_id);
    variant.hit_dice = source.hit_dice.saturating_add(hit_dice);
    variant.stamina_bonus = source.stamina_bonus.saturating_add(stamina_bonus);
    variant.agility = source.agility.saturating_add(agility);
    variant.movement_max = source.movement_max.saturating_add(movement_max);
    variant.armor = source.armor.saturating_add(armor);
    variant.magic_resistance = source.magic_resistance.saturating_add(magic_resistance);
    variant.damage_bonus = source.damage_bonus.saturating_add(damage_bonus);
    variant.saves = source
        .saves
        .iter()
        .map(|value| value.saturating_add(saves))
        .collect();
    let spell_points =
        (i32::from(source.spell_points) * spell_numerator / spell_denominator).clamp(0, 999) as i16;
    variant.spell_points = spell_points;
    variant.max_spell_points = source.max_spell_points.max(spell_points).clamp(0, 999);
    variant.experience =
        (i32::from(source.experience) * exp_numerator / exp_denominator).clamp(0, 32_767) as i16;
    variant
}

pub(super) fn validate_classic_monster_import(
    sources: &[ClassicSourceBlob],
    monster_sets: &[MonsterSet],
    monster_descriptions: &[MonsterDescription],
) -> Result<(), SessionError> {
    let source_paths = sources
        .iter()
        .map(|source| source.native_path.as_str())
        .collect::<BTreeSet<_>>();
    let mut seen_sets = BTreeSet::new();
    for set in monster_sets {
        let expected = match set.set_id {
            0 => "Data MD",
            1 => "Data MD1",
            -1 => "Data MD-1",
            value => {
                return Err(SessionError::InvalidClassicImport(format!(
                    "unsupported monster set id {value}"
                )));
            }
        };
        if set.native_path != expected {
            return Err(SessionError::InvalidClassicImport(format!(
                "monster set {} must use {expected}, not {}",
                set.set_id, set.native_path
            )));
        }
        if !seen_sets.insert(set.set_id) {
            return Err(SessionError::InvalidClassicImport(format!(
                "duplicate monster set id {}",
                set.set_id
            )));
        }
        if !source_paths.contains(set.native_path.as_str()) {
            return Err(SessionError::InvalidClassicImport(format!(
                "decoded monster set {} requires {} provenance",
                set.set_id, set.native_path
            )));
        }
        for monster in &set.monsters {
            validate_monster_record_shape(monster)
                .map_err(|error| SessionError::InvalidClassicImport(error.to_string()))?;
            let expected_identity = format!("monster:{}:{}", set.set_id, monster.native_id.0);
            if monster.identity.0 != expected_identity {
                return Err(SessionError::InvalidClassicImport(format!(
                    "monster record {} in set {} must use identity {expected_identity}",
                    monster.native_id.0, set.set_id
                )));
            }
        }
    }
    validate_imported_monster_descriptions(monster_descriptions, &source_paths)
}

fn validate_imported_monster_descriptions(
    monster_descriptions: &[MonsterDescription],
    source_paths: &BTreeSet<&str>,
) -> Result<(), SessionError> {
    if !monster_descriptions.is_empty() && !source_paths.contains("Data DES") {
        return Err(SessionError::InvalidClassicImport(
            "decoded monster descriptions require Data DES provenance".into(),
        ));
    }
    for description in monster_descriptions {
        if description.identity.0 != format!("monster-description:{}", description.native_id.0) {
            return Err(SessionError::InvalidClassicImport(format!(
                "monster description {} has an invalid stable identity",
                description.native_id.0
            )));
        }
    }
    Ok(())
}
