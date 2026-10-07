//! New and copied Battle forms remain local until one vacant, reviewed record is committed.

use super::{EditorSession, SessionError};
use crate::codecs::{BATTLE_GRID_SLOTS, validate_battle_record_shape};
use crate::model::{BattleRecord, NativeRecordId, StableId};
use crate::references::{FieldPath, ReferenceDescriptor, ResolutionState, TargetKind};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BattleCopySource {
    pub native_id: NativeRecordId,
    pub record_hash: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BattleAllocation {
    pub battle: BattleRecord,
    pub copy_source: Option<BattleCopySource>,
}

impl EditorSession {
    pub fn clear_battle_draft(&self, native_id: NativeRecordId) -> Result<Value, SessionError> {
        let current = self
            .snapshot
            .battles
            .iter()
            .find(|row| row.native_id == native_id)
            .ok_or_else(|| {
                SessionError::BattleNotFound(StableId(format!("battle:{}", native_id.0)))
            })?;
        let uses = self.battle_uses(native_id).len();
        Ok(
            json!({"battle": empty_battle(native_id), "occupantsRemoved": current.grid.iter().filter(|value| **value != 0).count(),
            "incomingUses": uses, "identityRetained": true}),
        )
    }

    /// Query one Battle without expanding every authored range into a catalog.
    /// Interior uses retain the low endpoint's exact owning field and provenance.
    pub fn battle_uses(&self, native_id: NativeRecordId) -> Vec<ReferenceDescriptor> {
        let references = self.references();
        let endpoints = references
            .iter()
            .filter(|row| row.target_kind == TargetKind::Battle)
            .map(|row| ((row.source.clone(), row.field.clone()), row))
            .collect::<BTreeMap<_, _>>();
        let target = native_id.0.to_string();
        let mut uses = endpoints
            .values()
            .filter(|row| row.target_id == target)
            .map(|row| (*row).clone())
            .collect::<Vec<_>>();
        let resolved = self
            .snapshot
            .battles
            .iter()
            .any(|row| row.native_id == native_id);
        for row in endpoints.values() {
            let high_field = if let Some(prefix) = row.field.0.strip_suffix(".settings.battleLow") {
                format!("{prefix}.settings.battleHigh")
            } else if row.field.0 == "battleRange[0]" {
                "battleRange[1]".to_string()
            } else {
                continue;
            };
            let Some(high) = endpoints.get(&(row.source.clone(), FieldPath(high_field))) else {
                continue;
            };
            let (Ok(low), Ok(high)) = (row.target_id.parse::<u32>(), high.target_id.parse::<u32>())
            else {
                continue;
            };
            if low < native_id.0 && native_id.0 < high {
                let mut interior = (*row).clone();
                interior.target_id = target.clone();
                interior.resolution = if resolved {
                    ResolutionState::Resolved
                } else {
                    ResolutionState::Missing
                };
                uses.push(interior);
            }
        }
        uses.sort_by_key(|row| (row.source.clone(), row.field.clone()));
        uses
    }

    pub fn allocate_battle(
        &self,
        source_id: Option<NativeRecordId>,
    ) -> Result<BattleAllocation, SessionError> {
        let occupied: BTreeSet<_> = self
            .snapshot
            .battles
            .iter()
            .map(|row| row.native_id.0)
            .collect();
        let native_id = (0..=i16::MAX as u32)
            .find(|id| !occupied.contains(id))
            .ok_or_else(|| {
                invalid(
                    StableId("battle:new".into()),
                    "All authorable Battle IDs are occupied.",
                )
            })?;
        let (mut battle, copy_source) = if let Some(source_id) = source_id {
            let source = self
                .snapshot
                .battles
                .iter()
                .find(|row| row.native_id == source_id)
                .ok_or_else(|| {
                    SessionError::BattleNotFound(StableId(format!("battle:{}", source_id.0)))
                })?;
            (
                source.clone(),
                Some(BattleCopySource {
                    native_id: source_id,
                    record_hash: record_hash(source),
                }),
            )
        } else {
            (empty_battle(NativeRecordId(native_id)), None)
        };
        battle.identity = StableId(format!("battle:{native_id}"));
        battle.native_id = NativeRecordId(native_id);
        battle.authored = true;
        Ok(BattleAllocation {
            battle,
            copy_source,
        })
    }

    pub(super) fn create_battle(
        &mut self,
        mut battle: Box<BattleRecord>,
        source: Option<BattleCopySource>,
    ) -> Result<Vec<StableId>, SessionError> {
        let identity = battle.identity.clone();
        if battle.native_id.0 > i16::MAX as u32
            || identity.0 != format!("battle:{}", battle.native_id.0)
        {
            return Err(invalid(
                identity,
                "New Battle identity must be an authorable ID from 0 to 32767.",
            ));
        }
        if self
            .snapshot
            .battles
            .iter()
            .any(|row| row.native_id == battle.native_id || row.identity == identity)
        {
            return Err(invalid(
                identity,
                "The reviewed destination is occupied. Allocate another Battle; no record was replaced.",
            ));
        }
        if let Some(source) = source {
            let current = self
                .snapshot
                .battles
                .iter()
                .find(|row| row.native_id == source.native_id)
                .ok_or_else(|| {
                    invalid(
                        identity.clone(),
                        "The reviewed copy source is no longer available.",
                    )
                })?;
            if record_hash(current) != source.record_hash {
                return Err(invalid(
                    identity,
                    "The copy source changed after review. Review a new copy; your draft was not applied.",
                ));
            }
        }
        battle.authored = true;
        validate_battle_record_shape(&battle)
            .map_err(|error| invalid(identity.clone(), &error.to_string()))?;
        self.snapshot.battles.push(*battle);
        self.snapshot.normalize();
        Ok(vec![identity])
    }
}

pub fn draft_issues(raw: &Value) -> Vec<Value> {
    let mut issues = Vec::new();
    if !raw
        .get("distance")
        .and_then(Value::as_i64)
        .is_some_and(|value| (-128..=127).contains(&value))
    {
        issues.push(json!({"field": "distance", "message": "Enter a whole number from -128 to 127. Zero has no random spread; 1-30 is usual."}));
    }
    if let Some(grid) = raw.get("grid").and_then(Value::as_array) {
        if grid.len() != BATTLE_GRID_SLOTS {
            issues.push(json!({"field": "grid", "message": "The Battle grid must contain 169 anchor cells."}));
        }
        if grid
            .iter()
            .filter(|value| value.as_i64() != Some(0))
            .count()
            > crate::codecs::BATTLE_RUNTIME_MONSTER_LIMIT
        {
            issues.push(json!({"field": "grid", "message": "Remove occupants to meet the 100-anchor limit."}));
        }
    }
    issues
}

pub fn empty_battle(native_id: NativeRecordId) -> BattleRecord {
    BattleRecord {
        identity: StableId(format!("battle:{}", native_id.0)),
        native_id,
        grid: vec![0; BATTLE_GRID_SLOTS],
        distance: 0,
        message_before: 0,
        message_after: 0,
        battle_macro: 0,
        authored: true,
    }
}

fn record_hash(record: &BattleRecord) -> String {
    format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(record).expect("Battle fields serialize"))
    )
}

fn invalid(identity: StableId, reason: &str) -> SessionError {
    SessionError::InvalidBattle {
        identity,
        reason: reason.into(),
    }
}
