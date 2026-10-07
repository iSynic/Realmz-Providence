use super::{RepairAssessment, RepairChange, RepairCommand};
use std::collections::BTreeSet;

impl RepairAssessment {
    pub fn reviewed_command(self, selections: &[String]) -> Result<RepairCommand, String> {
        let assessment = self;
        let selected = selections.iter().collect::<BTreeSet<_>>();
        if selected.len() != selections.len()
            || selections.iter().any(|key| {
                !assessment
                    .entries
                    .iter()
                    .any(|e| e.conflict && e.key == *key)
            })
        {
            return Err("Repair contains an unknown or duplicate conflict selection.".into());
        }
        for entry in assessment
            .entries
            .iter()
            .filter(|entry| selected.contains(&entry.key))
        {
            if let RepairChange::ItemText { record_index, .. } = entry.change {
                let binding = format!("item:{record_index}:source");
                if assessment
                    .entries
                    .iter()
                    .any(|other| other.key == binding && other.conflict)
                    && !selected.contains(&binding)
                {
                    return Err(
                        "Recovering this text also requires reviewing its item text source.".into(),
                    );
                }
            }
        }
        let changes = assessment
            .entries
            .into_iter()
            .filter(|entry| !entry.conflict || selected.contains(&entry.key))
            .collect::<Vec<_>>();
        Ok(RepairCommand {
            expected_source_identity: assessment.source_identity,
            expected_previous_version: assessment.previous_version,
            changes,
        })
    }
}
