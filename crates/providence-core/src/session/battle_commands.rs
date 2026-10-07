use crate::codecs::BATTLE_GRID_SLOTS;
use crate::codecs::BATTLE_RECORD_BYTES;
use crate::codecs::certified_battle_source;
use crate::codecs::validate_battle_record_shape;
use crate::model::BattleRecord;
use crate::model::BlobId;
use crate::model::ClassicSourceBlob;
use crate::model::ProjectOrigin;
use crate::model::StableId;
use crate::session::BattleMonsterReferenceRewrite;
use crate::session::EditorSession;
use crate::session::errors::SessionError;
use crate::session::field_paths::parse_battle_grid_field;
use std::collections::BTreeSet;

impl EditorSession {
    pub(super) fn import_classic_battle_slice(
        &mut self,
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        battles: Vec<BattleRecord>,
    ) -> Result<Vec<StableId>, SessionError> {
        validate_classic_battle_import(&sources, &battles)?;
        let identities = std::iter::once(self.snapshot.project_id.clone())
            .chain(
                self.snapshot
                    .battles
                    .iter()
                    .chain(battles.iter())
                    .map(|battle| battle.identity.clone()),
            )
            .collect::<BTreeSet<_>>();
        self.snapshot.origin = ProjectOrigin::Imported {
            compatibility_annex: annex_blob,
        };
        self.snapshot.classic_sources = sources;
        self.snapshot.battles = battles;
        self.snapshot.normalize();
        Ok(identities.into_iter().collect())
    }

    pub(super) fn update_battle(
        &mut self,
        mut battle: Box<BattleRecord>,
    ) -> Result<Vec<StableId>, SessionError> {
        battle.authored = true;
        validate_battle_record_shape(&battle).map_err(|error| SessionError::InvalidBattle {
            identity: battle.identity.clone(),
            reason: error.to_string(),
        })?;
        let existing = self
            .snapshot
            .battles
            .iter_mut()
            .find(|candidate| candidate.identity == battle.identity)
            .ok_or_else(|| SessionError::BattleNotFound(battle.identity.clone()))?;
        if existing.native_id != battle.native_id {
            return Err(SessionError::InvalidBattle {
                identity: battle.identity.clone(),
                reason: "native record identity cannot be changed".into(),
            });
        }
        let identity = battle.identity.clone();
        *existing = *battle;
        Ok(vec![identity])
    }

    pub(super) fn rewrite_battle_monster_references(
        &mut self,
        rewrite: BattleMonsterReferenceRewrite,
    ) -> Result<Vec<StableId>, SessionError> {
        let normalized = normalize_battle_monster_rewrite(rewrite)?;
        let mut changed = Vec::new();
        for battle in &mut self.snapshot.battles {
            let mut battle_changed = false;
            for raw_id in &mut battle.grid {
                let replacement = rewrite_battle_monster_id(*raw_id, &normalized);
                if replacement != *raw_id {
                    *raw_id = replacement;
                    battle_changed = true;
                }
            }
            if battle_changed {
                battle.authored = true;
                changed.push(battle.identity.clone());
            }
        }
        Ok(changed)
    }

    pub(super) fn retarget_battle_reference(
        &mut self,
        source: StableId,
        field: String,
        target_id: i16,
    ) -> Result<Vec<StableId>, SessionError> {
        if target_id < 0 {
            return Err(SessionError::InvalidBattleReference { source, field });
        }
        let battle_index = self
            .snapshot
            .battles
            .iter()
            .position(|battle| battle.identity == source)
            .ok_or_else(|| SessionError::BattleNotFound(source.clone()))?;
        let mut battle = self.snapshot.battles[battle_index].clone();
        if let Some(slot) = parse_battle_grid_field(&field) {
            if slot >= BATTLE_GRID_SLOTS {
                return Err(SessionError::InvalidBattleReference { source, field });
            }
            let side_flip = battle.grid[slot] < 0;
            battle.grid[slot] = if side_flip { -target_id } else { target_id };
        } else if field == "messageBefore" {
            battle.message_before = target_id;
        } else if field == "messageAfter" {
            battle.message_after = target_id;
        } else if field == "battleMacro" {
            battle.battle_macro = if target_id > 0 { -target_id } else { target_id };
        } else {
            return Err(SessionError::InvalidBattleReference { source, field });
        }
        battle.authored = true;
        validate_battle_record_shape(&battle).map_err(|error| SessionError::InvalidBattle {
            identity: battle.identity.clone(),
            reason: error.to_string(),
        })?;
        self.snapshot.battles[battle_index] = battle;
        Ok(vec![source])
    }
}

pub(super) fn normalize_battle_monster_rewrite(
    rewrite: BattleMonsterReferenceRewrite,
) -> Result<BattleMonsterReferenceRewrite, SessionError> {
    let invalid = |message: &str| SessionError::InvalidBattleMonsterRewrite(message.into());
    match rewrite {
        BattleMonsterReferenceRewrite::Clear { monster_id } => {
            if monster_id == 0 || monster_id > i16::MAX as u32 {
                return Err(invalid(
                    "clear target must be a positive signed-short monster ID",
                ));
            }
            Ok(BattleMonsterReferenceRewrite::Clear { monster_id })
        }
        BattleMonsterReferenceRewrite::Replace { from_id, to_id } => {
            if from_id == 0 || to_id == 0 || from_id > i16::MAX as u32 || to_id > i16::MAX as u32 {
                return Err(invalid(
                    "replacement IDs must be positive signed-short values",
                ));
            }
            if from_id == to_id {
                return Err(invalid("replacement source and target must be different"));
            }
            Ok(BattleMonsterReferenceRewrite::Replace { from_id, to_id })
        }
        BattleMonsterReferenceRewrite::Swap { from_id, to_id } => {
            if from_id == 0 || to_id == 0 || from_id > i16::MAX as u32 || to_id > i16::MAX as u32 {
                return Err(invalid("swap IDs must be positive signed-short values"));
            }
            if from_id == to_id {
                return Err(invalid("swap IDs must be different"));
            }
            Ok(BattleMonsterReferenceRewrite::Swap { from_id, to_id })
        }
    }
}

pub(super) fn rewrite_battle_monster_id(
    raw_id: i16,
    rewrite: &BattleMonsterReferenceRewrite,
) -> i16 {
    if raw_id == 0 {
        return 0;
    }
    let monster_id = i32::from(raw_id).unsigned_abs();
    let sign = if raw_id < 0 { -1 } else { 1 };
    match *rewrite {
        BattleMonsterReferenceRewrite::Clear { monster_id: target } => {
            if monster_id == target {
                0
            } else {
                raw_id
            }
        }
        BattleMonsterReferenceRewrite::Replace { from_id, to_id } => {
            if monster_id == from_id {
                sign * to_id as i16
            } else {
                raw_id
            }
        }
        BattleMonsterReferenceRewrite::Swap { from_id, to_id } => {
            if monster_id == from_id {
                sign * to_id as i16
            } else if monster_id == to_id {
                sign * from_id as i16
            } else {
                raw_id
            }
        }
    }
}

pub(super) fn validate_classic_battle_import(
    sources: &[ClassicSourceBlob],
    battles: &[BattleRecord],
) -> Result<(), SessionError> {
    let Some(source) = sources
        .iter()
        .find(|source| source.native_path == "Data BD")
    else {
        return Err(SessionError::InvalidClassicImport(
            "decoded battles require Data BD provenance".into(),
        ));
    };
    let complete_rows = certified_battle_source(&source.blob.0, source.byte_length as usize)
        .map(|extent| extent.authored_records)
        .unwrap_or(source.byte_length as usize / BATTLE_RECORD_BYTES);
    if complete_rows != battles.len() {
        return Err(SessionError::InvalidClassicImport(
            "Data BD complete-row count does not match the decoded battle count".into(),
        ));
    }
    for (index, battle) in battles.iter().enumerate() {
        validate_battle_record_shape(battle)
            .map_err(|error| SessionError::InvalidClassicImport(error.to_string()))?;
        if battle.native_id.0 != index as u32
            || battle.identity.0 != format!("battle:{index}")
            || battle.authored
        {
            return Err(SessionError::InvalidClassicImport(format!(
                "Data BD row {index} does not have canonical imported identity and state"
            )));
        }
    }
    Ok(())
}
