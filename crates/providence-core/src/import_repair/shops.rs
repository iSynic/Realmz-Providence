use super::RepairAssessment;
use crate::{
    codecs::decode_shops,
    model::{ProjectSnapshot, ShopRecord},
};
use std::collections::{BTreeMap, BTreeSet};

pub(super) const PRESERVATION_GUIDANCE: &str = "Native Shop records cannot be removed by an import repair. Keep this project and its authored edits; explicitly reimport the source into a separate project for comparison.";

pub(super) fn assess(
    snapshot: &ProjectSnapshot,
    files: &BTreeMap<String, Vec<u8>>,
    assessment: &mut RepairAssessment,
) {
    let Some(bytes) = files.get("Data SD") else {
        return;
    };
    let decoded = decode_shops(bytes);
    let classified = decoded
        .quarantined_records
        .iter()
        .map(|row| row.native_id)
        .collect::<BTreeSet<_>>();
    for original in decoded.records {
        let current = snapshot
            .shops
            .iter()
            .find(|row| row.native_id == original.native_id);
        let diagnostic = if current.is_none() {
            Some(
                "the supplied native row is absent from this model; this is an import preservation defect",
            )
        } else if classified.contains(&original.native_id) {
            Some(
                "the native row and any authored edits are retained despite its legacy inventory classification",
            )
        } else {
            None
        };
        if let Some(reason) = diagnostic {
            assessment.preservation_diagnostics.push(format!(
                "Data SD Shop {}: {}. {}",
                original.native_id.0, reason, PRESERVATION_GUIDANCE
            ));
        }
    }
}

pub(super) fn apply(_snapshot: &mut ProjectSnapshot, _expected: &ShopRecord) -> Result<(), String> {
    Err(PRESERVATION_GUIDANCE.into())
}
