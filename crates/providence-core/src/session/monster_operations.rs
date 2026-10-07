//! Review and commit Monster record operations through their existing canonical commands.

use super::monster_records::{monster_for_set, monster_identity, monster_record_is_active};
use super::{EditorCommand, EditorSession, MonsterDraftChange, SessionError};
use crate::model::{NativeRecordId, StableId};
use crate::monster_uses::MonsterUse;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum MonsterRecordOperation {
    Create {
        set_id: i16,
        native_id: NativeRecordId,
    },
    Duplicate {
        set_id: i16,
        source_id: NativeRecordId,
        target_id: NativeRecordId,
    },
    Clear {
        set_id: i16,
        native_id: NativeRecordId,
    },
    Switch {
        set_id: i16,
        first_id: NativeRecordId,
        second_id: NativeRecordId,
    },
    CopyAllSets {
        source_set_id: i16,
        native_id: NativeRecordId,
    },
    GenerateVariants {
        native_id: NativeRecordId,
    },
    GenerateAllVariants,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MonsterUseEdit {
    pub source: StableId,
    pub field: String,
    pub target_id: i16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MonsterOperation {
    pub action: MonsterRecordOperation,
    /// Every omitted use deliberately keeps its current reference.
    pub retarget_uses: Vec<MonsterUseEdit>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterOperationReview {
    pub review_hash: String,
    pub changes: Vec<MonsterDraftChange>,
    pub uses: Vec<MonsterUse>,
    pub excluded: Vec<(NativeRecordId, String)>,
}

impl EditorSession {
    pub fn review_monster_operation(
        &self,
        operation: &MonsterOperation,
    ) -> Result<MonsterOperationReview, SessionError> {
        let (_, _, review) = self.stage_monster_operation(operation)?;
        Ok(review)
    }

    pub(super) fn commit_monster_operation(
        &mut self,
        operation: MonsterOperation,
        review_hash: String,
    ) -> Result<Vec<StableId>, SessionError> {
        let (candidate, changed, review) = self.stage_monster_operation(&operation)?;
        if review.review_hash != review_hash {
            return Err(invalid(
                "The reviewed Monster effects changed. Review the operation again.",
            ));
        }
        // Staging includes every fallible command. One outer command owns history and publication.
        self.snapshot = candidate.snapshot;
        Ok(changed.into_iter().collect())
    }

    fn stage_monster_operation(
        &self,
        operation: &MonsterOperation,
    ) -> Result<(Self, BTreeSet<StableId>, MonsterOperationReview), SessionError> {
        let (commands, affected_ids, excluded) = operation.action.commands(self)?;
        let uses = crate::monster_uses::monster_uses(&self.snapshot)
            .into_iter()
            .filter(|reference| affected_ids.contains(&reference.target_id))
            .collect::<Vec<_>>();
        let mut candidate = Self::new(self.snapshot.clone());
        let mut changed = BTreeSet::new();
        for command in commands {
            changed.extend(candidate.apply_domain_command(command)?);
        }
        let mut edited_uses = BTreeSet::new();
        for edit in &operation.retarget_uses {
            if !edited_uses.insert((&edit.source, &edit.field)) {
                return Err(invalid("A Monster use was selected more than once."));
            }
            if !uses.iter().any(|reference| {
                reference.source == edit.source
                    && reference.field == edit.field
                    && reference.can_retarget
            }) {
                return Err(invalid(
                    "The selected use does not belong to this Monster operation.",
                ));
            }
            changed.extend(candidate.apply_monster_use_edit(edit)?);
        }
        let changes =
            super::monster_operation_diff::changes(&self.snapshot, &candidate.snapshot, &changed);
        let bytes = serde_json::to_vec(&(operation, &changes, &uses, &excluded))
            .expect("typed review serialization");
        let review_hash = format!("{:x}", Sha256::digest(bytes));
        Ok((
            candidate,
            changed,
            MonsterOperationReview {
                review_hash,
                changes,
                uses,
                excluded,
            },
        ))
    }

    fn apply_monster_use_edit(
        &mut self,
        edit: &MonsterUseEdit,
    ) -> Result<Vec<StableId>, SessionError> {
        if edit.target_id <= 0
            || !monster_for_set(&self.snapshot, 0, NativeRecordId(edit.target_id as u32))
                .is_some_and(monster_record_is_active)
        {
            return Err(invalid(
                "Choose an active Normal Monster as the replacement reference.",
            ));
        }
        if edit.source.0.starts_with("battle:") {
            return self.retarget_battle_reference(
                edit.source.clone(),
                edit.field.clone(),
                edit.target_id,
            );
        }
        if let Some(slot) = edit
            .field
            .strip_prefix("actions[")
            .and_then(|field| field.strip_suffix("].target"))
            .and_then(|slot| slot.parse::<u8>().ok())
        {
            return self.retarget_action_reference(edit.source.clone(), slot, edit.target_id);
        }
        Err(invalid(
            "This use requires the owning script's settings-impact review. Keep it here or repair it in that script.",
        ))
    }
}

type OperationCommands = (
    Vec<EditorCommand>,
    BTreeSet<u32>,
    Vec<(NativeRecordId, String)>,
);

impl MonsterRecordOperation {
    fn commands(&self, session: &EditorSession) -> Result<OperationCommands, SessionError> {
        use MonsterRecordOperation::*;
        let (command, ids) = match *self {
            Create { set_id, native_id } => (
                EditorCommand::CreateMonster { set_id, native_id },
                vec![native_id.0],
            ),
            Duplicate {
                set_id,
                source_id,
                target_id,
            } => (
                EditorCommand::DuplicateMonster {
                    set_id,
                    source_id,
                    target_id,
                },
                vec![source_id.0, target_id.0],
            ),
            Clear { set_id, native_id } => (
                EditorCommand::ClearMonster { set_id, native_id },
                vec![native_id.0],
            ),
            Switch {
                set_id,
                first_id,
                second_id,
            } => (
                EditorCommand::SwitchMonsterRecords {
                    set_id,
                    first_id,
                    second_id,
                },
                vec![first_id.0, second_id.0],
            ),
            CopyAllSets {
                source_set_id,
                native_id,
            } => (
                EditorCommand::CopyMonsterToAllSets {
                    source_set_id,
                    native_id,
                },
                vec![native_id.0],
            ),
            GenerateVariants { native_id } => (
                EditorCommand::GenerateMonsterVariants { native_id },
                vec![native_id.0],
            ),
            GenerateAllVariants => return generation_commands(session),
        };
        Ok((vec![command], ids.into_iter().collect(), Vec::new()))
    }
}

fn generation_commands(session: &EditorSession) -> Result<OperationCommands, SessionError> {
    let normal = session
        .snapshot
        .monster_sets
        .iter()
        .find(|set| set.set_id == 0)
        .ok_or_else(|| SessionError::MonsterNotFound(monster_identity(0, NativeRecordId(0))))?;
    let terminator = normal
        .monsters
        .iter()
        .find(|record| record.hit_dice == 255 && !record.not_on_menu)
        .map(|record| record.native_id.0);
    let mut commands = Vec::new();
    let mut ids = BTreeSet::new();
    let mut excluded = Vec::new();
    for record in &normal.monsters {
        let reason = if record.native_id.0 == 0 {
            Some("ID zero is reserved for empty battle cells")
        } else if record.hit_dice == 0 {
            Some("Inactive Normal record")
        } else if terminator.is_some_and(|id| record.native_id.0 >= id) {
            Some("Bestiary terminator or preserved non-author-facing tail")
        } else {
            None
        };
        if let Some(reason) = reason {
            excluded.push((record.native_id, reason.into()));
        } else {
            ids.insert(record.native_id.0);
            commands.push(EditorCommand::GenerateMonsterVariants {
                native_id: record.native_id,
            });
        }
    }
    if commands.is_empty() {
        return Err(invalid(
            "No eligible Normal Monsters remain for variant generation.",
        ));
    }
    Ok((commands, ids, excluded))
}

fn invalid(reason: &str) -> SessionError {
    SessionError::InvalidMonster {
        identity: StableId("monster-operation".into()),
        reason: reason.into(),
    }
}
