use crate::model::ItemRuleDefinition;
use crate::model::SourcedItemRule;
use crate::model::SourcedScenarioItemRule;
use crate::model::StableId;
use crate::session::EditorSession;
use crate::session::errors::SessionError;
use std::collections::BTreeSet;

impl EditorSession {
    pub(super) fn replace_item_rules(
        &mut self,
        rules: Vec<SourcedItemRule>,
    ) -> Result<Vec<StableId>, SessionError> {
        let mut classic_ids = BTreeSet::new();
        for rule in &rules {
            if !classic_ids.insert(rule.definition.classic_id) {
                return Err(SessionError::DuplicateClassicRuleId {
                    kind: "item",
                    classic_id: i32::from(rule.definition.classic_id),
                });
            }
        }
        let mut identities = self
            .snapshot
            .item_rules
            .iter()
            .map(|rule| rule.definition.id.clone())
            .collect::<BTreeSet<_>>();
        identities.extend(rules.iter().map(|rule| rule.definition.id.clone()));
        self.snapshot.item_rules = rules;
        self.snapshot.normalize();
        Ok(identities.into_iter().collect())
    }

    pub(super) fn replace_scenario_item_rules(
        &mut self,
        rules: Vec<SourcedScenarioItemRule>,
    ) -> Result<Vec<StableId>, SessionError> {
        let mut record_indexes = BTreeSet::new();
        let mut classic_ids = BTreeSet::new();
        for rule in &rules {
            if !record_indexes.insert(rule.record_index)
                || !classic_ids.insert(rule.definition.classic_id)
            {
                return Err(SessionError::DuplicateClassicRuleId {
                    kind: "scenario item",
                    classic_id: i32::from(rule.definition.classic_id),
                });
            }
        }
        let mut identities = self
            .snapshot
            .scenario_item_rules
            .iter()
            .map(|rule| rule.definition.id.clone())
            .collect::<BTreeSet<_>>();
        identities.extend(rules.iter().map(|rule| rule.definition.id.clone()));
        self.snapshot.scenario_item_rules = rules;
        self.snapshot.normalize();
        Ok(identities.into_iter().collect())
    }

    pub(super) fn update_scenario_item(
        &mut self,
        record_index: u16,
        definition: Box<ItemRuleDefinition>,
    ) -> Result<Vec<StableId>, SessionError> {
        let expected_id = 800 + record_index as i16;
        if definition.classic_id != expected_id
            || definition.id.0 != format!("classic.item.{expected_id}")
        {
            return Err(SessionError::InvalidScenarioItemIdentity {
                record_index,
                classic_id: definition.classic_id,
            });
        }
        let rule = self
            .snapshot
            .scenario_item_rules
            .iter_mut()
            .find(|rule| rule.record_index == record_index)
            .ok_or(SessionError::ScenarioItemNotFound(record_index))?;
        let identity = definition.id.clone();
        rule.definition = *definition;
        Ok(vec![identity])
    }
}
