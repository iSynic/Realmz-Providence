//! A Monster form commits its exact set, shared text and Normal bestiary together.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::monster_draft_fields::patch_record;
use super::monster_records::{
    authored_monster_description, monster_for_set, monster_identity, upsert_monster_description,
    upsert_monster_record, validate_monster_native_id, validate_monster_set_id,
};
use super::{EditorSession, SessionError};
use crate::model::{MonsterDescription, MonsterRecord, NativeRecordId, StableId};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MonsterRecordDraft {
    pub set_id: i16,
    pub native_id: NativeRecordId,
    #[serde(default)]
    pub fields: BTreeMap<String, Value>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub normal_not_on_menu: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterDraftChange {
    pub entity: StableId,
    pub field: String,
    pub before: Value,
    pub after: Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterDraftIssue {
    pub field: String,
    pub message: String,
    pub diagnostic: String,
}

struct PreparedDraft {
    selected: Option<MonsterRecord>,
    normal: Option<MonsterRecord>,
    description: Option<MonsterDescription>,
    changes: Vec<MonsterDraftChange>,
}

impl EditorSession {
    pub fn monster_draft_issues(&self, draft: &MonsterRecordDraft) -> Vec<MonsterDraftIssue> {
        let mut probes = Vec::new();
        let empty = MonsterRecordDraft {
            set_id: draft.set_id,
            native_id: draft.native_id,
            fields: BTreeMap::new(),
            description: None,
            normal_not_on_menu: None,
        };
        for (field, value) in &draft.fields {
            let mut probe = empty.clone();
            probe.fields.insert(field.clone(), value.clone());
            probes.push((field.clone(), probe));
        }
        if draft.description.is_some() {
            let mut probe = empty.clone();
            probe.description = draft.description.clone();
            probes.push(("description".into(), probe));
        }
        if draft.normal_not_on_menu.is_some() {
            let mut probe = empty;
            probe.normal_not_on_menu = draft.normal_not_on_menu;
            probes.push(("normalNotOnMenu".into(), probe));
        }
        let mut issues = probes
            .into_iter()
            .take(128)
            .filter_map(|(field, probe)| {
                self.monster_draft_changes(&probe)
                    .err()
                    .map(|error| MonsterDraftIssue {
                        message: super::monster_draft_fields::issue_message(
                            &field,
                            &error.to_string(),
                        ),
                        field,
                        diagnostic: error.to_string(),
                    })
            })
            .collect::<Vec<_>>();
        if issues.is_empty()
            && let Err(error) = self.monster_draft_changes(draft)
        {
            issues.push(MonsterDraftIssue {
                field: String::new(),
                message:
                    "The draft could not be validated. Check the selected record and try again."
                        .into(),
                diagnostic: error.to_string(),
            });
        }
        issues
    }

    pub fn monster_draft_changes(
        &self,
        draft: &MonsterRecordDraft,
    ) -> Result<Vec<MonsterDraftChange>, SessionError> {
        Ok(self.prepare_monster_draft(draft)?.changes)
    }

    pub(super) fn apply_monster_draft(
        &mut self,
        draft: MonsterRecordDraft,
    ) -> Result<Vec<StableId>, SessionError> {
        // Every fallible check precedes writes, including the separate Normal owner.
        let prepared = self.prepare_monster_draft(&draft)?;
        let mut changed = Vec::new();
        if let Some(mut record) = prepared.selected {
            record.authored = true;
            changed.push(record.identity.clone());
            upsert_monster_record(&mut self.snapshot, draft.set_id, record);
        }
        if let Some(mut record) = prepared.normal {
            record.authored = true;
            changed.push(record.identity.clone());
            upsert_monster_record(&mut self.snapshot, 0, record);
        }
        if let Some(description) = prepared.description {
            changed.push(description.identity.clone());
            upsert_monster_description(&mut self.snapshot, description);
        }
        self.snapshot.normalize();
        Ok(changed)
    }

    fn prepare_monster_draft(
        &self,
        draft: &MonsterRecordDraft,
    ) -> Result<PreparedDraft, SessionError> {
        let identity = monster_identity(draft.set_id, draft.native_id);
        validate_monster_set_id(draft.set_id, &identity)?;
        validate_monster_native_id(draft.native_id, &identity)?;
        let existing = monster_for_set(&self.snapshot, draft.set_id, draft.native_id)
            .ok_or_else(|| SessionError::MonsterNotFound(identity.clone()))?;
        let mut record = patch_record(existing, &draft.fields)?;
        let mut changes = field_changes(existing, &record, &draft.fields);
        let normal = self.prepare_normal_flag(draft, &mut record, &mut changes)?;
        let description = self.prepare_shared_description(draft, &mut changes)?;
        Ok(PreparedDraft {
            selected: (record != *existing).then_some(record),
            normal,
            description,
            changes,
        })
    }

    fn prepare_normal_flag(
        &self,
        draft: &MonsterRecordDraft,
        selected: &mut MonsterRecord,
        changes: &mut Vec<MonsterDraftChange>,
    ) -> Result<Option<MonsterRecord>, SessionError> {
        let Some(value) = draft.normal_not_on_menu else {
            return Ok(None);
        };
        let normal = monster_for_set(&self.snapshot, 0, draft.native_id)
            .filter(|record| record.hit_dice != 0)
            .ok_or_else(|| SessionError::InvalidMonster {
                identity: monster_identity(0, draft.native_id),
                reason: "Hide from Bestiary requires an active Normal record".into(),
            })?;
        if normal.not_on_menu == value {
            return Ok(None);
        }
        changes.push(MonsterDraftChange {
            entity: normal.identity.clone(),
            field: "notOnMenu".into(),
            before: Value::Bool(normal.not_on_menu),
            after: Value::Bool(value),
        });
        if draft.set_id == 0 {
            selected.not_on_menu = value;
            Ok(None)
        } else {
            let mut edited = normal.clone();
            edited.not_on_menu = value;
            Ok(Some(edited))
        }
    }

    fn prepare_shared_description(
        &self,
        draft: &MonsterRecordDraft,
        changes: &mut Vec<MonsterDraftChange>,
    ) -> Result<Option<MonsterDescription>, SessionError> {
        let Some(text) = &draft.description else {
            return Ok(None);
        };
        let identity = StableId(format!("monster-description:{}", draft.native_id.0));
        validate_text(&identity, text, 255)?;
        let existing = self
            .snapshot
            .monster_descriptions
            .iter()
            .find(|description| description.native_id == draft.native_id);
        let before = existing.map_or("", |description| description.text.as_str());
        if before == text {
            return Ok(None);
        }
        changes.push(MonsterDraftChange {
            entity: identity,
            field: "description".into(),
            before: Value::String(before.into()),
            after: Value::String(text.clone()),
        });
        Ok(Some(authored_monster_description(
            draft.native_id,
            text.clone(),
        )))
    }
}

pub(crate) fn validate_text(
    identity: &StableId,
    text: &str,
    maximum: usize,
) -> Result<(), SessionError> {
    if !text.is_ascii() {
        return Err(SessionError::InvalidMonster {
            identity: identity.clone(),
            reason: "Monster text currently supports ASCII; non-ASCII text cannot be exported without substitution".into(),
        });
    }
    let bytes = crate::codecs::encode_classic_text_payload(text).map_err(|error| {
        SessionError::InvalidMonster {
            identity: identity.clone(),
            reason: error.to_string(),
        }
    })?;
    if bytes.len() > maximum {
        return Err(SessionError::InvalidMonster {
            identity: identity.clone(),
            reason: format!(
                "text uses {} Classic bytes; maximum is {maximum}",
                bytes.len()
            ),
        });
    }
    Ok(())
}

fn field_changes(
    before: &MonsterRecord,
    after: &MonsterRecord,
    fields: &BTreeMap<String, Value>,
) -> Vec<MonsterDraftChange> {
    let before = serde_json::to_value(before).expect("Monster serialization is infallible");
    let after = serde_json::to_value(after).expect("Monster serialization is infallible");
    fields
        .keys()
        .filter_map(|field| {
            let pointer = format!("/{}", field.replace('.', "/"));
            let prior = before.pointer(&pointer)?;
            let value = after.pointer(&pointer)?;
            (prior != value).then(|| MonsterDraftChange {
                entity: StableId(after["identity"].as_str().expect("Monster identity").into()),
                field: field.clone(),
                before: prior.clone(),
                after: value.clone(),
            })
        })
        .collect()
}
