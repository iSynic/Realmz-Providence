use crate::model::RuleNameCatalog;
use crate::model::SourcedCasteRule;
use crate::model::SourcedRaceRule;
use crate::model::StableId;
use crate::session::EditorSession;
use crate::session::errors::SessionError;
use std::collections::BTreeSet;

impl EditorSession {
    pub(super) fn upsert_race_rule(
        &mut self,
        rule: Box<SourcedRaceRule>,
    ) -> Result<Vec<StableId>, SessionError> {
        if self.snapshot.race_rules.iter().any(|existing| {
            existing.definition.id != rule.definition.id
                && existing.definition.classic_id == rule.definition.classic_id
        }) {
            return Err(SessionError::DuplicateClassicRuleId {
                kind: "race",
                classic_id: i32::from(rule.definition.classic_id),
            });
        }
        let identity = rule.definition.id.clone();
        if let Some(existing) = self
            .snapshot
            .race_rules
            .iter_mut()
            .find(|existing| existing.definition.id == identity)
        {
            *existing = *rule;
        } else {
            self.snapshot.race_rules.push(*rule);
        }
        self.snapshot.normalize();
        Ok(vec![identity])
    }

    pub(super) fn replace_race_rules(
        &mut self,
        rules: Vec<SourcedRaceRule>,
    ) -> Result<Vec<StableId>, SessionError> {
        let mut classic_ids = BTreeSet::new();
        for rule in &rules {
            if !classic_ids.insert(rule.definition.classic_id) {
                return Err(SessionError::DuplicateClassicRuleId {
                    kind: "race",
                    classic_id: i32::from(rule.definition.classic_id),
                });
            }
        }
        let mut identities = self
            .snapshot
            .race_rules
            .iter()
            .map(|rule| rule.definition.id.clone())
            .collect::<BTreeSet<_>>();
        identities.extend(rules.iter().map(|rule| rule.definition.id.clone()));
        self.snapshot.race_rules = rules;
        self.snapshot.normalize();
        Ok(identities.into_iter().collect())
    }

    pub(super) fn upsert_caste_rule(
        &mut self,
        rule: Box<SourcedCasteRule>,
    ) -> Result<Vec<StableId>, SessionError> {
        if self.snapshot.caste_rules.iter().any(|existing| {
            existing.definition.id != rule.definition.id
                && existing.definition.classic_id == rule.definition.classic_id
        }) {
            return Err(SessionError::DuplicateClassicRuleId {
                kind: "caste",
                classic_id: i32::from(rule.definition.classic_id),
            });
        }
        let identity = rule.definition.id.clone();
        if let Some(existing) = self
            .snapshot
            .caste_rules
            .iter_mut()
            .find(|existing| existing.definition.id == identity)
        {
            *existing = *rule;
        } else {
            self.snapshot.caste_rules.push(*rule);
        }
        self.snapshot.normalize();
        Ok(vec![identity])
    }

    pub(super) fn replace_caste_rules(
        &mut self,
        rules: Vec<SourcedCasteRule>,
    ) -> Result<Vec<StableId>, SessionError> {
        let mut classic_ids = BTreeSet::new();
        for rule in &rules {
            if !classic_ids.insert(rule.definition.classic_id) {
                return Err(SessionError::DuplicateClassicRuleId {
                    kind: "caste",
                    classic_id: i32::from(rule.definition.classic_id),
                });
            }
        }
        let mut identities = self
            .snapshot
            .caste_rules
            .iter()
            .map(|rule| rule.definition.id.clone())
            .collect::<BTreeSet<_>>();
        identities.extend(rules.iter().map(|rule| rule.definition.id.clone()));
        self.snapshot.caste_rules = rules;
        self.snapshot.normalize();
        Ok(identities.into_iter().collect())
    }

    pub(super) fn set_rule_name_catalog(
        &mut self,
        catalog: RuleNameCatalog,
    ) -> Result<Vec<StableId>, SessionError> {
        let mut identities = self
            .snapshot
            .race_rules
            .iter()
            .map(|rule| rule.definition.id.clone())
            .chain(
                self.snapshot
                    .caste_rules
                    .iter()
                    .map(|rule| rule.definition.id.clone()),
            )
            .collect::<Vec<_>>();
        if identities.is_empty() {
            identities.push(self.snapshot.project_id.clone());
        }
        self.snapshot.rule_names = Some(catalog);
        Ok(identities)
    }
}
