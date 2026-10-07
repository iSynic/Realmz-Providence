use super::contracts::RebuiltV3RuleCatalogError;
use crate::model::{ProjectSnapshot, StableId};
use std::collections::BTreeSet;

pub(super) fn validate_eligibility(
    snapshot: &ProjectSnapshot,
    race_ids: &BTreeSet<StableId>,
    caste_ids: &BTreeSet<StableId>,
) -> Result<(), RebuiltV3RuleCatalogError> {
    for race in &snapshot.race_rules {
        for caste_id in &race.definition.eligible_caste_ids {
            if !caste_ids.contains(caste_id) {
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
