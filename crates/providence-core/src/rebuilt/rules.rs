mod contracts;
mod eligibility;
mod validation;

use crate::{
    codecs::{effective_caste_name, effective_race_name},
    model::ProjectSnapshot,
};
pub use contracts::{CLASSIC_RULE_RECORDS, RebuiltV3RuleCatalog, RebuiltV3RuleCatalogError};
use eligibility::validate_eligibility;
use validation::{validate_castes, validate_counts, validate_name_catalog, validate_races};

pub fn project_rebuilt_v3_rule_catalog(
    snapshot: &ProjectSnapshot,
) -> Result<RebuiltV3RuleCatalog, RebuiltV3RuleCatalogError> {
    if snapshot.classic_rule_selection.is_some() {
        return Err(RebuiltV3RuleCatalogError::UnresolvedSelection);
    }
    validate_counts(snapshot)?;
    validate_name_catalog(snapshot)?;
    let race_ids = validate_races(snapshot)?;
    let caste_ids = validate_castes(snapshot)?;
    validate_eligibility(snapshot, &race_ids, &caste_ids)?;

    let mut races = snapshot
        .race_rules
        .iter()
        .map(|rule| {
            let mut definition = rule.definition.clone();
            definition.name = effective_race_name(
                snapshot.rule_names.as_ref(),
                definition.classic_id,
                &definition.name,
            )
            .unwrap_or_default()
            .to_string();
            if definition.name.trim().is_empty() {
                definition.name = format!("Unnamed Classic race {}", definition.classic_id);
            }
            definition
        })
        .collect::<Vec<_>>();
    races.sort_by_key(|rule| rule.classic_id);
    let mut castes = snapshot
        .caste_rules
        .iter()
        .map(|rule| {
            let mut definition = rule.definition.clone();
            definition.name = effective_caste_name(
                snapshot.rule_names.as_ref(),
                definition.classic_id,
                &definition.name,
            )
            .unwrap_or_default()
            .to_string();
            if definition.name.trim().is_empty() {
                definition.name = format!("Unnamed Classic caste {}", definition.classic_id);
            }
            definition
        })
        .collect::<Vec<_>>();
    castes.sort_by_key(|rule| rule.classic_id);
    Ok(RebuiltV3RuleCatalog { races, castes })
}

#[cfg(test)]
pub(crate) mod tests;
