use super::*;
use crate::session::{EditorSession, SessionError};
use std::collections::BTreeSet;

impl EditorSession {
    pub(in crate::session) fn apply_rule_record_commit(
        &mut self,
        commit: PreparedRuleCommit,
    ) -> Result<Vec<StableId>, SessionError> {
        if commit.expected_family_hash != rule_family_hash(&self.snapshot) {
            return Err(invalid("The saved rule family changed after preparation."));
        }
        validate_commit(&commit).map_err(|e| invalid(&e))?;
        let mut changed = BTreeSet::new();
        for rule in &commit.races {
            if self
                .snapshot
                .race_rules
                .iter()
                .find(|r| r.definition.id == rule.definition.id)
                != Some(rule)
            {
                changed.insert(rule.definition.id.clone());
            }
        }
        for rule in &commit.castes {
            if self
                .snapshot
                .caste_rules
                .iter()
                .find(|r| r.definition.id == rule.definition.id)
                != Some(rule)
            {
                changed.insert(rule.definition.id.clone());
            }
        }
        if self.snapshot.rule_names.as_ref() != Some(&commit.names) {
            changed.insert(self.snapshot.project_id.clone());
        }
        self.snapshot.race_rules = commit.races;
        self.snapshot.caste_rules = commit.castes;
        self.snapshot.rule_names = Some(commit.names);
        self.snapshot.normalize();
        Ok(changed.into_iter().collect())
    }
}

fn validate_commit(commit: &PreparedRuleCommit) -> Result<(), String> {
    if !commit
        .races
        .iter()
        .any(|r| r.definition.id == commit.identity)
        && !commit
            .castes
            .iter()
            .any(|r| r.definition.id == commit.identity)
    {
        return Err("The prepared destination is not in either rule family.".into());
    }
    if commit.races.len() != 30 || commit.castes.len() != 30 {
        return Err("Rule commits must retain both complete 30-row catalogs.".into());
    }
    crate::codecs::encode_race_rules(&commit.races, None).map_err(|e| e.to_string())?;
    crate::codecs::encode_caste_rules(&commit.castes, None).map_err(|e| e.to_string())?;
    let mut derived = commit.castes.clone();
    crate::codecs::derive_caste_eligibility(&commit.races, &mut derived)
        .map_err(|e| e.to_string())?;
    if derived.iter().zip(&commit.castes).any(|(left, right)| {
        left.definition.eligible_race_ids != right.definition.eligible_race_ids
    }) {
        return Err("Caste eligibility must agree with its Race-owned flags.".into());
    }
    if commit.names.race_names.len() != 30
        || commit.names.caste_names.len() != 30
        || commit.names.race_resource_id != 129
        || commit.names.caste_resource_id != 131
    {
        return Err("Rule names must retain their complete STR# 129/131 identity.".into());
    }
    for sources in [
        commit
            .races
            .iter()
            .map(|r| r.source_blob.as_ref())
            .collect::<Vec<_>>(),
        commit
            .castes
            .iter()
            .map(|r| r.source_blob.as_ref())
            .collect(),
    ] {
        if sources.iter().any(|blob| blob.is_none())
            || sources.iter().collect::<BTreeSet<_>>().len() != 1
        {
            return Err("Each rule family requires one consistent canonical source blob.".into());
        }
    }
    Ok(())
}

fn invalid(reason: &str) -> SessionError {
    SessionError::InvalidClassicImport(reason.into())
}
