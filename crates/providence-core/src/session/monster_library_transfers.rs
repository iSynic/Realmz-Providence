//! Library allocations use the same canonical template commands as single-record copies.
use super::{EditorCommand, EditorSession, MonsterDraftChange, SessionError};
use crate::model::StableId;
use crate::monster_library::MonsterLibraryScenarioCopy;
use crate::monster_uses::MonsterUse;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::sync::Arc;

#[derive(Debug)]
pub(super) struct CachedTransferReview {
    revision: super::Revision,
    copies: Vec<MonsterLibraryScenarioCopy>,
    review: Arc<MonsterLibraryTransferReview>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterLibraryTransferReview {
    pub review_hash: String,
    pub changes: Vec<MonsterDraftChange>,
    pub uses: Vec<MonsterUse>,
    pub comparison: Vec<MonsterTransferField>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterTransferField {
    pub entity: StableId,
    pub field: String,
    pub source: serde_json::Value,
    pub before: serde_json::Value,
    pub after: serde_json::Value,
}

impl EditorSession {
    pub fn review_monster_library_transfer(
        &self,
        copies: &[MonsterLibraryScenarioCopy],
    ) -> Result<MonsterLibraryTransferReview, SessionError> {
        Ok(self
            .shared_monster_library_transfer_review(copies)?
            .as_ref()
            .clone())
    }

    /// One disposable review per session state and exact copy intent. Commit always restages.
    pub fn shared_monster_library_transfer_review(
        &self,
        copies: &[MonsterLibraryScenarioCopy],
    ) -> Result<Arc<MonsterLibraryTransferReview>, SessionError> {
        let cache = &self.projections.monster_transfer;
        if let Some(cached) = cache
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .as_ref()
            && cached.revision == self.revision
            && cached.copies == copies
        {
            return Ok(Arc::clone(&cached.review));
        }
        let review = Arc::new(self.stage_library_transfer(copies)?.2);
        *cache.lock().unwrap_or_else(|error| error.into_inner()) = Some(CachedTransferReview {
            revision: self.revision,
            copies: copies.to_vec(),
            review: Arc::clone(&review),
        });
        Ok(review)
    }

    pub(super) fn commit_monster_library_transfer(
        &mut self,
        copies: Vec<MonsterLibraryScenarioCopy>,
        review_hash: String,
    ) -> Result<Vec<StableId>, SessionError> {
        let (candidate, changed, review) = self.stage_library_transfer(&copies)?;
        if review.review_hash != review_hash {
            return Err(SessionError::InvalidMonster { identity: self.snapshot.project_id.clone(),
                reason: "The reviewed Library transfer changed. Review its allocations and effects again.".into() });
        }
        self.snapshot = candidate.snapshot;
        Ok(changed.into_iter().collect())
    }

    fn stage_library_transfer(
        &self,
        copies: &[MonsterLibraryScenarioCopy],
    ) -> Result<(Self, BTreeSet<StableId>, MonsterLibraryTransferReview), SessionError> {
        let targets = copies
            .iter()
            .map(|copy| copy.target_id.0)
            .collect::<BTreeSet<_>>();
        let uses = crate::monster_uses::monster_uses(&self.snapshot)
            .into_iter()
            .filter(|reference| targets.contains(&reference.target_id))
            .collect::<Vec<_>>();
        let mut candidate = Self::new(self.snapshot.clone());
        let changed = candidate
            .apply_domain_command(EditorCommand::PopulateMonsterLibraryTemplates {
                copies: copies.to_vec(),
            })?
            .into_iter()
            .collect::<BTreeSet<_>>();
        let changes =
            super::monster_operation_diff::changes(&self.snapshot, &candidate.snapshot, &changed);
        let comparison = transfer_comparison(&self.snapshot, &candidate.snapshot, copies);
        let bytes = serde_json::to_vec(&(copies, &changes, &uses, &comparison))
            .expect("typed transfer serialization");
        let review_hash = format!("{:x}", Sha256::digest(bytes));
        Ok((
            candidate,
            changed,
            MonsterLibraryTransferReview {
                review_hash,
                changes,
                uses,
                comparison,
            },
        ))
    }
}

fn transfer_comparison(
    before: &crate::model::ProjectSnapshot,
    after: &crate::model::ProjectSnapshot,
    copies: &[MonsterLibraryScenarioCopy],
) -> Vec<MonsterTransferField> {
    let mut result = Vec::new();
    for copy in copies {
        let source = serde_json::to_value(&copy.template).expect("typed Monster");
        compare_variant_fields(before, after, copy, &source, &mut result);
        result.push(compare_description(before, after, copy));
    }
    result
}

fn compare_variant_fields(
    before: &crate::model::ProjectSnapshot,
    after: &crate::model::ProjectSnapshot,
    copy: &MonsterLibraryScenarioCopy,
    source: &serde_json::Value,
    result: &mut Vec<MonsterTransferField>,
) {
    use serde_json::Value;
    for set in &after.monster_sets {
        if copy.mode == crate::monster_library::MonsterLibraryCopyMode::Normal && set.set_id != 0 {
            continue;
        }
        let Some(record) = set
            .monsters
            .iter()
            .find(|record| record.native_id == copy.target_id)
        else {
            continue;
        };
        let previous = before
            .monster_sets
            .iter()
            .find(|old| old.set_id == set.set_id)
            .and_then(|old| {
                old.monsters
                    .iter()
                    .find(|old| old.native_id == copy.target_id)
            });
        let current = serde_json::to_value(previous).expect("typed Monster");
        let proposed = serde_json::to_value(record).expect("typed Monster");
        for field in
            super::monster_operation_diff::record_changes(&record.identity, &Value::Null, &proposed)
        {
            if !super::monster_draft_fields::authoring_field(&field.field)
                && field.field != "notOnMenu"
            {
                continue;
            }
            let pointer = format!("/{}", field.field.replace('.', "/"));
            result.push(MonsterTransferField {
                entity: record.identity.clone(),
                field: field.field,
                source: source.pointer(&pointer).cloned().unwrap_or(Value::Null),
                before: current.pointer(&pointer).cloned().unwrap_or(Value::Null),
                after: field.after,
            });
        }
    }
}

fn compare_description(
    before: &crate::model::ProjectSnapshot,
    after: &crate::model::ProjectSnapshot,
    copy: &MonsterLibraryScenarioCopy,
) -> MonsterTransferField {
    use serde_json::{Value, json};
    let previous = before
        .monster_descriptions
        .iter()
        .find(|row| row.native_id == copy.target_id);
    let proposed = after
        .monster_descriptions
        .iter()
        .find(|row| row.native_id == copy.target_id);
    MonsterTransferField {
        entity: StableId(format!("monster-description:{}", copy.target_id.0)),
        field: "description".into(),
        source: json!(copy.description),
        before: previous.map_or(Value::Null, |row| json!(row.text)),
        after: proposed.map_or(Value::Null, |row| json!(row.text)),
    }
}
