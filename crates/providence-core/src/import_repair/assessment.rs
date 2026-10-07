use super::{INTERPRETATION_VERSION, RepairAssessment, items, retained_sources, shops, spells};
use crate::model::{ProjectOrigin, ProjectSnapshot, classic_source_set_sha256};
use std::collections::BTreeMap;

pub fn assess(
    snapshot: &ProjectSnapshot,
    files: &BTreeMap<String, Vec<u8>>,
) -> Result<RepairAssessment, String> {
    let mut assessment = RepairAssessment {
        source_identity: classic_source_set_sha256(snapshot)?,
        previous_version: snapshot.import_interpretation_version,
        version: INTERPRETATION_VERSION,
        entries: Vec::new(),
        source_requirements: Vec::new(),
    };
    if !matches!(snapshot.origin, ProjectOrigin::Imported { .. })
        || snapshot.import_interpretation_version >= INTERPRETATION_VERSION
    {
        return Ok(assessment);
    }
    retained_sources::verify(snapshot, files, &mut assessment)?;
    if !assessment.source_requirements.is_empty() {
        return Ok(assessment);
    }
    if snapshot.import_interpretation_version < 1 {
        spells::assess(snapshot, files, &mut assessment)?;
        items::assess(snapshot, files, &mut assessment)?;
    }
    shops::assess(snapshot, files, &mut assessment);
    Ok(assessment)
}
