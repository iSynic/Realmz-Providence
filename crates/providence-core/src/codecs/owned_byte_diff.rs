use std::collections::BTreeSet;

use serde::Serialize;

use super::{CompatibilityOverlayPolicy, NativeFileFamily, descriptor};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnedByteDiffReport {
    pub family: NativeFileFamily,
    pub native_path: &'static str,
    pub compatibility_overlay: CompatibilityOverlayPolicy,
    pub record_bytes: usize,
    pub before_bytes: usize,
    pub after_bytes: usize,
    pub length_delta: i128,
    pub exact: bool,
    pub record_geometry_compatible: bool,
    pub within_declared_ownership: bool,
    pub changed_bytes: usize,
    pub changed_record_count: usize,
    pub changed_records: Vec<usize>,
    pub changed_records_truncated: bool,
    pub canonical_unowned_append_bytes: usize,
    pub unowned_change_count: usize,
    pub unowned_change_offsets: Vec<usize>,
    pub unowned_change_offsets_truncated: bool,
}

pub fn inspect_owned_byte_diff(
    family: NativeFileFamily,
    before: &[u8],
    after: &[u8],
    sample_limit: usize,
) -> OwnedByteDiffReport {
    let codec = descriptor(family);
    let before_remainder = before.len() % codec.record_bytes;
    let after_remainder = after.len() % codec.record_bytes;
    let same_length = before.len() == after.len();
    let record_geometry_compatible = same_length || (before_remainder == 0 && after_remainder == 0);
    let record_data_limit = if same_length {
        before.len() - before_remainder
    } else if record_geometry_compatible {
        before.len().max(after.len())
    } else {
        (before.len() - before_remainder).min(after.len() - after_remainder)
    };

    let mut changed_bytes = 0usize;
    let mut changed_records = BTreeSet::new();
    let mut canonical_unowned_append_bytes = 0usize;
    let mut unowned_change_count = 0usize;
    let mut unowned_change_offsets = Vec::new();
    for offset in 0..before.len().max(after.len()) {
        if before.get(offset) == after.get(offset) {
            continue;
        }
        changed_bytes += 1;

        let within_record_data = offset < record_data_limit;
        let within_record = offset % codec.record_bytes;
        let declared_owned = within_record_data
            && codec
                .owned_byte_ranges
                .iter()
                .any(|range| range.start <= within_record && within_record < range.end);
        if within_record_data {
            changed_records.insert(offset / codec.record_bytes);
        }
        let canonical_unowned_append = !declared_owned
            && offset >= before.len()
            && after.get(offset).copied() == codec.canonical_unowned_append_byte(within_record);
        if canonical_unowned_append {
            canonical_unowned_append_bytes += 1;
        } else if !declared_owned {
            unowned_change_count += 1;
            if unowned_change_offsets.len() < sample_limit {
                unowned_change_offsets.push(offset);
            }
        }
    }

    let changed_record_count = changed_records.len();
    let changed_records = changed_records
        .into_iter()
        .take(sample_limit)
        .collect::<Vec<_>>();
    let exact = changed_bytes == 0;
    let within_declared_ownership = record_geometry_compatible
        && unowned_change_count == 0
        && (exact || codec.compatibility_overlay != CompatibilityOverlayPolicy::PreserveOnly);

    OwnedByteDiffReport {
        family,
        native_path: codec.native_path,
        compatibility_overlay: codec.compatibility_overlay,
        record_bytes: codec.record_bytes,
        before_bytes: before.len(),
        after_bytes: after.len(),
        length_delta: after.len() as i128 - before.len() as i128,
        exact,
        record_geometry_compatible,
        within_declared_ownership,
        changed_bytes,
        changed_record_count,
        changed_records_truncated: changed_record_count > changed_records.len(),
        changed_records,
        canonical_unowned_append_bytes,
        unowned_change_count,
        unowned_change_offsets_truncated: unowned_change_count > unowned_change_offsets.len(),
        unowned_change_offsets,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_owned_rows_allow_narrow_edits_and_complete_appends() {
        let mut before = vec![0u8; 2 * 256];
        before[256 + 11] = 7;
        let mut after = before.clone();
        after[256 + 11] = 9;
        after.extend_from_slice(&[3u8; 256]);

        let report =
            inspect_owned_byte_diff(NativeFileFamily::ScenarioMessages, &before, &after, 16);

        assert!(report.record_geometry_compatible);
        assert!(report.within_declared_ownership);
        assert_eq!(report.changed_record_count, 2);
        assert_eq!(report.changed_records, [1, 2]);
        assert_eq!(report.unowned_change_count, 0);
    }

    #[test]
    fn partial_owned_rows_reject_spare_word_changes() {
        let before = vec![0u8; 340];
        let mut after = before.clone();
        after[74] = 1;

        let report = inspect_owned_byte_diff(NativeFileFamily::PlayerMaps, &before, &after, 16);

        assert!(!report.within_declared_ownership);
        assert_eq!(report.changed_records, [0]);
        assert_eq!(report.unowned_change_offsets, [74]);
    }

    #[test]
    fn random_level_append_requires_canonical_zero_for_its_unowned_padding_byte() {
        let before = vec![0u8; super::super::RANDOM_LEVEL_RECORD_BYTES];
        let mut after = before.clone();
        after.extend_from_slice(&vec![0u8; super::super::RANDOM_LEVEL_RECORD_BYTES]);

        let report =
            inspect_owned_byte_diff(NativeFileFamily::LandRandomLevels, &before, &after, 16);
        assert!(report.within_declared_ownership);
        assert_eq!(report.canonical_unowned_append_bytes, 1);
        assert_eq!(report.unowned_change_count, 0);

        after
            [super::super::RANDOM_LEVEL_RECORD_BYTES + super::super::RANDOM_LEVEL_PADDING_OFFSET] =
            1;
        let report =
            inspect_owned_byte_diff(NativeFileFamily::LandRandomLevels, &before, &after, 16);
        assert!(!report.within_declared_ownership);
        assert_eq!(report.canonical_unowned_append_bytes, 0);
        assert_eq!(report.unowned_change_count, 1);
    }

    #[test]
    fn compatibility_tail_changes_are_never_mistaken_for_an_authored_row() {
        let before = vec![0u8; 426 + 5];
        let mut after = before.clone();
        after[430] = 1;

        let report =
            inspect_owned_byte_diff(NativeFileFamily::SimpleEncounters, &before, &after, 16);

        assert!(report.record_geometry_compatible);
        assert!(!report.within_declared_ownership);
        assert_eq!(report.changed_record_count, 0);
        assert_eq!(report.unowned_change_offsets, [430]);
    }

    #[test]
    fn incompatible_tail_geometry_is_conservatively_refused() {
        let before = vec![0u8; 426 + 5];
        let mut after = before.clone();
        after.extend_from_slice(&[0u8; 426]);

        let report =
            inspect_owned_byte_diff(NativeFileFamily::SimpleEncounters, &before, &after, 16);

        assert!(!report.record_geometry_compatible);
        assert!(!report.within_declared_ownership);
    }

    #[test]
    fn preserve_only_sources_allow_only_exact_bytes() {
        let before = vec![0u8; 600];
        let exact =
            inspect_owned_byte_diff(NativeFileFamily::ScenarioSupport, &before, &before, 16);
        assert!(exact.exact);
        assert!(exact.within_declared_ownership);

        let mut changed = before.clone();
        changed[23] = 1;
        let changed =
            inspect_owned_byte_diff(NativeFileFamily::ScenarioSupport, &before, &changed, 16);
        assert!(!changed.within_declared_ownership);
        assert_eq!(changed.unowned_change_offsets, [23]);
    }
}
