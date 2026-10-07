//! Item allocation is a query. Only a complete, revisioned draft changes authored truth.
use super::{EditorSession, SessionError};
use crate::codecs::{
    ITEM_RECORD_BYTES, SCENARIO_ITEM_DEFINITIONS, encode_scenario_item_rules,
    new_scenario_item_definition,
};
use crate::model::{BlobId, ItemRuleDefinition, SourcedScenarioItemRule, StableId};
use crate::references::TargetKind;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ItemAllocationGuard {
    pub record_index: u16,
    pub destination_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ItemRecordDraft {
    pub record_index: u16,
    pub definition: ItemRuleDefinition,
    pub allocation: Option<ItemAllocationGuard>,
    #[serde(default)]
    pub copy_source: Option<ItemCopySource>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ItemCopySource {
    pub identity: StableId,
    pub scope: String,
    pub catalog_fingerprint: String,
    pub definition_hash: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemAllocation {
    pub draft: ItemRecordDraft,
    pub available_slots: usize,
    pub custom_capacity: usize,
}

impl EditorSession {
    pub fn allocate_scenario_item(
        &self,
        binary: Option<&[u8]>,
        destination: Option<u16>,
    ) -> Result<ItemAllocation, SessionError> {
        if binary.is_some_and(|bytes| bytes.len() != ITEM_RECORD_BYTES * SCENARIO_ITEM_DEFINITIONS)
        {
            return Err(invalid(
                0,
                "The retained Data NI family must contain exactly 20,000 bytes.",
            ));
        }
        let used = self.used_item_identities();
        let free = (100..200)
            .filter(|index| self.item_destination_vacant(*index, binary, &used))
            .collect::<Vec<_>>();
        let index = destination
            .or_else(|| free.first().copied())
            .ok_or_else(|| {
                invalid(
                    100,
                    "All 100 custom item slots are occupied. No item was replaced.",
                )
            })?;
        if !free.contains(&index) {
            return Err(invalid(
                index,
                "Choose a vacant custom item ID from 900 to 999. Existing content, retained bytes and incoming references are protected.",
            ));
        }
        Ok(ItemAllocation {
            draft: ItemRecordDraft {
                record_index: index,
                definition: new_scenario_item_definition(index)
                    .map_err(|error| invalid(index, error))?,
                allocation: Some(ItemAllocationGuard {
                    record_index: index,
                    destination_hash: self.item_destination_hash(index),
                }),
                copy_source: None,
            },
            available_slots: free.len(),
            custom_capacity: 100,
        })
    }

    pub fn item_draft_issues(&self, draft: &ItemRecordDraft) -> Vec<String> {
        let rule = SourcedScenarioItemRule {
            record_index: draft.record_index,
            source: format!("Data NI record {}", draft.record_index),
            source_blob: BlobId(String::new()),
            text_source_blob: None,
            definition: draft.definition.clone(),
        };
        encode_scenario_item_rules(
            &[rule],
            &vec![0; ITEM_RECORD_BYTES * SCENARIO_ITEM_DEFINITIONS],
        )
        .err()
        .map(|error| vec![error.to_string()])
        .unwrap_or_default()
    }

    pub(super) fn apply_item_draft(
        &mut self,
        draft: ItemRecordDraft,
        binary_blob: BlobId,
        text_blob: Option<BlobId>,
    ) -> Result<Vec<StableId>, SessionError> {
        if let Some(issue) = self.item_draft_issues(&draft).first() {
            return Err(invalid(draft.record_index, issue));
        }
        self.check_item_draft_destination(&draft)?;
        if self
            .snapshot
            .scenario_item_rules
            .iter()
            .any(|rule| rule.source_blob != binary_blob)
        {
            return Err(invalid(
                draft.record_index,
                "The item family source changed; reopen the original draft.",
            ));
        }
        let identity = draft.definition.id.clone();
        let rule = SourcedScenarioItemRule {
            record_index: draft.record_index,
            source: format!("Data NI record {}", draft.record_index),
            source_blob: binary_blob,
            text_source_blob: text_blob.clone(),
            definition: draft.definition,
        };
        if let Some(existing) = self
            .snapshot
            .scenario_item_rules
            .iter_mut()
            .find(|row| row.record_index == rule.record_index)
        {
            *existing = rule;
        } else {
            self.snapshot.scenario_item_rules.push(rule);
        }
        for existing in &mut self.snapshot.scenario_item_rules {
            existing.text_source_blob = text_blob.clone();
        }
        self.snapshot.normalize();
        Ok(vec![identity])
    }

    fn check_item_draft_destination(&self, draft: &ItemRecordDraft) -> Result<(), SessionError> {
        if let Some(guard) = &draft.allocation {
            if guard.record_index != draft.record_index
                || guard.destination_hash != self.item_destination_hash(draft.record_index)
                || !self.item_destination_vacant(
                    draft.record_index,
                    None,
                    &self.used_item_identities(),
                )
            {
                return Err(invalid(
                    draft.record_index,
                    "The allocation changed after review. Review another destination; your draft was not applied.",
                ));
            }
        } else if !self
            .snapshot
            .scenario_item_rules
            .iter()
            .any(|rule| rule.record_index == draft.record_index)
        {
            return Err(SessionError::ScenarioItemNotFound(draft.record_index));
        }
        Ok(())
    }

    fn item_destination_hash(&self, index: u16) -> String {
        let source = self
            .snapshot
            .scenario_item_rules
            .first()
            .map(|rule| (&rule.source_blob, &rule.text_source_blob));
        let row = self
            .snapshot
            .scenario_item_rules
            .iter()
            .find(|rule| rule.record_index == index);
        let payload =
            serde_json::to_vec(&(index, source, row)).expect("Item allocation serializes");
        format!("sha256:{:x}", Sha256::digest(payload))
    }

    fn used_item_identities(&self) -> BTreeSet<String> {
        self.references()
            .into_iter()
            .filter(|reference| reference.target_kind == TargetKind::Item)
            .map(|reference| reference.target_id)
            .collect()
    }

    fn item_destination_vacant(
        &self,
        index: u16,
        binary: Option<&[u8]>,
        used: &BTreeSet<String>,
    ) -> bool {
        if !(100..200).contains(&index) {
            return false;
        }
        let identity = format!("classic.item.{}", 800 + index);
        if used.contains(&identity) {
            return false;
        }
        let empty = new_scenario_item_definition(index).expect("Custom index is bounded");
        if self
            .snapshot
            .scenario_item_rules
            .iter()
            .find(|rule| rule.record_index == index)
            .is_some_and(|rule| rule.definition != empty)
        {
            return false;
        }
        binary.is_none_or(|bytes| {
            let row = &bytes[usize::from(index) * ITEM_RECORD_BYTES
                ..usize::from(index + 1) * ITEM_RECORD_BYTES];
            let stored_id = i16::from_be_bytes([row[2], row[3]]);
            (stored_id == 0 || stored_id == 800 + index as i16)
                && row
                    .iter()
                    .enumerate()
                    .all(|(offset, byte)| (2..4).contains(&offset) || *byte == 0)
        })
    }
}

fn invalid(record_index: u16, reason: impl ToString) -> SessionError {
    SessionError::InvalidScenarioItem {
        record_index,
        reason: reason.to_string(),
    }
}
