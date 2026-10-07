//! Divinity's zero-based author numbers are projections of stable one-based rule IDs.
use crate::session::rule_authoring::{RuleEdit, RuleKind, empty_rule_edit};
use serde::Serialize;

pub fn author_number(classic_id: u8) -> Option<u8> {
    classic_id.checked_sub(1).filter(|number| *number < 30)
}

pub fn identity_author_number(identity: &str) -> Option<u8> {
    let id = identity
        .strip_prefix("classic.race.")
        .or_else(|| identity.strip_prefix("classic.caste."))?;
    author_number(id.parse().ok()?)
}

pub fn record_label(kind: RuleKind, classic_id: u8, name: &str) -> String {
    let family = if kind == RuleKind::Race {
        "Race"
    } else {
        "Caste"
    };
    let number = author_number(classic_id).unwrap_or(classic_id);
    if name.trim().is_empty()
        || name == format!("Unnamed Classic {} {classic_id}", family.to_lowercase())
    {
        format!("Custom {family} {number}")
    } else {
        name.into()
    }
}

pub fn edit_label(edit: &RuleEdit) -> String {
    let name = match edit {
        RuleEdit::Race { definition } => &definition.name,
        RuleEdit::Caste { definition, .. } => &definition.name,
    };
    record_label(edit.kind(), edit.classic_id(), name)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RuleContent {
    Populated,
    EligibilityOnly,
    TemplateOnly,
    Empty,
}

pub fn creation_fields_present(edit: &RuleEdit) -> bool {
    match edit {
        RuleEdit::Race { definition } => definition
            .age_ranges
            .iter()
            .any(|range| range.len() == 2 && range[0] > 0 && range[1] >= range[0]),
        RuleEdit::Caste { definition, .. } => {
            definition.stamina_dice.iter().any(|value| *value > 0)
        }
    }
}

pub fn record_content_with_template(
    edit: &RuleEdit,
    template: &RuleEdit,
) -> Result<RuleContent, String> {
    let mut value = edit.clone();
    let mut reference = template.clone();
    let name = match &reference {
        RuleEdit::Race { definition } => &definition.name,
        RuleEdit::Caste { definition, .. } => &definition.name,
    };
    if edit.classic_id() < edit.kind().custom_start() || !name.trim().is_empty() {
        return record_content(edit);
    }
    let eligibility = match (&value, &reference) {
        (RuleEdit::Race { definition: left }, RuleEdit::Race { definition: right }) => {
            left.eligible_caste_ids != right.eligible_caste_ids
        }
        (
            RuleEdit::Caste {
                definition: left, ..
            },
            RuleEdit::Caste {
                definition: right, ..
            },
        ) => left.eligible_race_ids != right.eligible_race_ids,
        _ => return Err("A rule template must belong to the same family.".into()),
    };
    strip_presentation(&mut value);
    strip_presentation(&mut reference);
    if value == reference && record_content(edit)? != RuleContent::Empty {
        Ok(if eligibility {
            RuleContent::EligibilityOnly
        } else {
            RuleContent::TemplateOnly
        })
    } else {
        record_content(edit)
    }
}

// This describes editable mechanics, not allocation permission or creator viability.
pub fn record_content(edit: &RuleEdit) -> Result<RuleContent, String> {
    let mut value = edit.clone();
    let mut blank = empty_rule_edit(edit.kind(), edit.classic_id())?;
    let eligibility = strip_presentation(&mut value);
    strip_presentation(&mut blank);
    Ok(if value != blank {
        RuleContent::Populated
    } else if eligibility {
        RuleContent::EligibilityOnly
    } else {
        RuleContent::Empty
    })
}

fn strip_presentation(edit: &mut RuleEdit) -> bool {
    match edit {
        RuleEdit::Race { definition } => {
            definition.name.clear();
            definition.description.clear();
            definition.default_icon_set = 0;
            let eligibility = !definition.eligible_caste_ids.is_empty();
            definition.eligible_caste_ids.clear();
            eligibility
        }
        RuleEdit::Caste { definition, .. } => {
            definition.name.clear();
            definition.description.clear();
            definition.default_icon = 0;
            let eligibility = !definition.eligible_race_ids.is_empty();
            definition.eligible_race_ids.clear();
            eligibility
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn creator_fields_distinguish_partial_rules_without_changing_them() {
        let mut race = empty_rule_edit(RuleKind::Race, 20).unwrap();
        let mut caste = empty_rule_edit(RuleKind::Caste, 21).unwrap();
        assert!(!creation_fields_present(&race));
        assert!(!creation_fields_present(&caste));
        if let RuleEdit::Race { definition } = &mut race {
            definition.age_ranges = vec![vec![12, 8], vec![0, 30]];
        }
        assert!(!creation_fields_present(&race));
        if let RuleEdit::Race { definition } = &mut race {
            definition.age_ranges.push(vec![12, 30]);
        }
        if let RuleEdit::Caste { definition, .. } = &mut caste {
            definition.stamina_dice = vec![15, 10];
        }
        let before = (race.clone(), caste.clone());
        assert!(creation_fields_present(&race));
        assert!(creation_fields_present(&caste));
        assert_eq!((race, caste), before);
    }
    #[test]
    fn template_mechanics_and_eligibility_are_not_new_definitions() {
        let mut template = empty_rule_edit(RuleKind::Race, 22).unwrap();
        if let RuleEdit::Race { definition } = &mut template {
            definition.name.clear();
            definition.base_movement = 12;
        }
        assert_eq!(
            record_content_with_template(&template, &template).unwrap(),
            RuleContent::TemplateOnly
        );
        let mut changed = template.clone();
        if let RuleEdit::Race { definition } = &mut changed {
            definition
                .eligible_caste_ids
                .push(RuleKind::Caste.identity(1));
        }
        assert_eq!(
            record_content_with_template(&changed, &template).unwrap(),
            RuleContent::EligibilityOnly
        );
        if let RuleEdit::Race { definition } = &mut changed {
            definition.base_movement = 15;
        }
        assert_eq!(
            record_content_with_template(&changed, &template).unwrap(),
            RuleContent::Populated
        );
    }
    #[test]
    fn numbers_and_content_do_not_rewrite_identities_or_admit_eligibility_as_mechanics() {
        assert_eq!(author_number(20), Some(19));
        assert_eq!(author_number(21), Some(20));
        assert_eq!(author_number(0), None);
        assert_eq!(author_number(31), None);
        for kind in [RuleKind::Race, RuleKind::Caste] {
            let mut edit = empty_rule_edit(kind, 21).unwrap();
            assert_eq!(record_content(&edit).unwrap(), RuleContent::Empty);
            match &mut edit {
                RuleEdit::Race { definition } => definition
                    .eligible_caste_ids
                    .push(RuleKind::Caste.identity(1)),
                RuleEdit::Caste { definition, .. } => definition
                    .eligible_race_ids
                    .push(RuleKind::Race.identity(1)),
            }
            assert_eq!(record_content(&edit).unwrap(), RuleContent::EligibilityOnly);
            match &mut edit {
                RuleEdit::Race { definition } => definition.base_movement = 12,
                RuleEdit::Caste { native_fields, .. } => native_fields.maximum_spells_per_round = 1,
            }
            let before = edit.clone();
            assert_eq!(record_content(&edit).unwrap(), RuleContent::Populated);
            assert_eq!(edit, before);
            assert_eq!(edit.classic_id(), 21);
        }
    }
}
