use super::{RebuiltV3MonsterDescription, RebuiltV3MonsterError};
use crate::model::{ProjectSnapshot, StableId};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn validated_selected_descriptions(
    snapshot: &ProjectSnapshot,
    classic_ids: &BTreeSet<u32>,
) -> Result<BTreeMap<u32, RebuiltV3MonsterDescription>, RebuiltV3MonsterError> {
    let mut descriptions = BTreeMap::new();
    for description in snapshot
        .monster_descriptions
        .iter()
        .filter(|description| classic_ids.contains(&description.native_id.0))
    {
        let expected = StableId(format!("monster-description:{}", description.native_id.0));
        if description.identity != expected {
            return Err(RebuiltV3MonsterError::InvalidDescriptionIdentity {
                expected,
                actual: description.identity.clone(),
            });
        }
        if descriptions
            .insert(
                description.native_id.0,
                RebuiltV3MonsterDescription {
                    id: description.native_id.0,
                    text: description.text.clone(),
                },
            )
            .is_some()
        {
            return Err(RebuiltV3MonsterError::DuplicateDescription(
                description.native_id.0,
            ));
        }
    }
    Ok(descriptions)
}

pub(super) fn validated_descriptions(
    snapshot: &ProjectSnapshot,
) -> Result<BTreeMap<u32, RebuiltV3MonsterDescription>, RebuiltV3MonsterError> {
    let mut descriptions = BTreeMap::new();
    for description in &snapshot.monster_descriptions {
        let expected = StableId(format!("monster-description:{}", description.native_id.0));
        if description.identity != expected {
            return Err(RebuiltV3MonsterError::InvalidDescriptionIdentity {
                expected,
                actual: description.identity.clone(),
            });
        }
        if descriptions
            .insert(
                description.native_id.0,
                RebuiltV3MonsterDescription {
                    id: description.native_id.0,
                    text: description.text.clone(),
                },
            )
            .is_some()
        {
            return Err(RebuiltV3MonsterError::DuplicateDescription(
                description.native_id.0,
            ));
        }
    }
    Ok(descriptions)
}
