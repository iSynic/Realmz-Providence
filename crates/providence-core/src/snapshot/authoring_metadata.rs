use super::SnapshotError;
use crate::model::ProjectSnapshot;
use std::collections::BTreeSet;

pub(super) fn migrate(snapshot: &mut ProjectSnapshot, version: u32) {
    if version < 38 {
        snapshot.import_interpretation_version = 0;
    }
    if version < 36 {
        snapshot.classic_rule_selection = None;
    }
    if version < 37 {
        snapshot.terrain_mappings.clear();
    }
}

pub fn validate(snapshot: &ProjectSnapshot) -> Result<(), SnapshotError> {
    if snapshot.terrain_mappings.len() > 256 {
        return Err(SnapshotError::InvalidTerrainMapping(
            "Too many terrain mappings.".into(),
        ));
    }
    if let Some(context) = &snapshot.classic_rule_selection {
        context
            .validate_binding(snapshot)
            .map_err(SnapshotError::InvalidClassicRuleSelection)?;
    }
    let mut identities = BTreeSet::new();
    for mapping in &snapshot.terrain_mappings {
        mapping
            .validate()
            .map_err(SnapshotError::InvalidTerrainMapping)?;
        if !identities.insert(&mapping.tileset_id) {
            return Err(SnapshotError::InvalidTerrainMapping(
                "An atlas has duplicate mapping records.".into(),
            ));
        }
    }
    Ok(())
}
