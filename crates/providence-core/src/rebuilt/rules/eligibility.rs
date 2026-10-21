use super::contracts::RebuiltV3RuleCatalogError;
use crate::model::{ProjectSnapshot, StableId};
use std::collections::BTreeSet;

pub(super) fn validate_eligibility(
    snapshot: &ProjectSnapshot,
    race_ids: &BTreeSet<StableId>,
    caste_ids: &BTreeSet<StableId>,
    native: bool,
) -> Result<(), RebuiltV3RuleCatalogError> {
    for race in &snapshot.race_rules {
        for caste_id in &race.definition.eligible_caste_ids {
            if !caste_ids.contains(caste_id) {
                if native && native_slot(caste_id, "caste") {
                    continue;
                }
                return Err(RebuiltV3RuleCatalogError::MissingEligibilityTarget {
                    source: race.definition.id.clone(),
                    target: caste_id.clone(),
                });
            }
            let reciprocal = snapshot.caste_rules.iter().any(|caste| {
                caste.definition.id == *caste_id
                    && caste
                        .definition
                        .eligible_race_ids
                        .contains(&race.definition.id)
            });
            if !reciprocal {
                return Err(RebuiltV3RuleCatalogError::AsymmetricEligibility {
                    race: race.definition.id.clone(),
                    caste: caste_id.clone(),
                });
            }
        }
    }
    for caste in &snapshot.caste_rules {
        for race_id in &caste.definition.eligible_race_ids {
            if !race_ids.contains(race_id) {
                if native && native_slot(race_id, "race") {
                    continue;
                }
                return Err(RebuiltV3RuleCatalogError::MissingEligibilityTarget {
                    source: caste.definition.id.clone(),
                    target: race_id.clone(),
                });
            }
            let reciprocal = snapshot.race_rules.iter().any(|race| {
                race.definition.id == *race_id
                    && race
                        .definition
                        .eligible_caste_ids
                        .contains(&caste.definition.id)
            });
            if !reciprocal {
                return Err(RebuiltV3RuleCatalogError::AsymmetricEligibility {
                    race: race_id.clone(),
                    caste: caste.definition.id.clone(),
                });
            }
        }
    }
    Ok(())
}

fn native_slot(id: &StableId, family: &str) -> bool {
    id.0.strip_prefix(&format!("classic.{family}."))
        .and_then(|value| value.parse::<u8>().ok())
        .is_some_and(|number| {
            (1..=30).contains(&number) && id.0 == format!("classic.{family}.{number}")
        })
}
