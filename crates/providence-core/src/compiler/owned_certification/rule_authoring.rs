//! A new scenario table must exactly project its command-prepared native source.
use super::*;
use crate::codecs::{encode_caste_rules, encode_race_rules};

pub(super) fn allocate_tables(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    manifest: &NativeManifest,
    baseline: &mut BTreeMap<String, Vec<u8>>,
    transitions: &mut Vec<ClassicOwnedFileTransition>,
) -> Result<(), ClassicOwnedEditCertificationError> {
    for (path, current, explicit, encoded) in [
        (
            "Data Race",
            sources.current_data_race,
            snapshot.race_rules.len() == 30
                && snapshot
                    .race_rules
                    .iter()
                    .any(|r| r.source.starts_with("Scenario Data Race ")),
            encode_race_rules(&snapshot.race_rules, sources.current_data_race)
                .map_err(|e| e.to_string()),
        ),
        (
            "Data Caste",
            sources.current_data_caste,
            snapshot.caste_rules.len() == 30
                && snapshot
                    .caste_rules
                    .iter()
                    .any(|r| r.source.starts_with("Scenario Data Caste ")),
            encode_caste_rules(&snapshot.caste_rules, sources.current_data_caste)
                .map_err(|e| e.to_string()),
        ),
    ] {
        if baseline.contains_key(path) {
            continue;
        }
        let Some(output) = manifest.get(path) else {
            continue;
        };
        let valid = explicit
            && current.is_some()
            && encoded.as_ref().is_ok_and(|bytes| bytes == &output.bytes)
            && current.is_some_and(|bytes| bytes == output.bytes.as_slice());
        if !valid {
            return Err(
                ClassicOwnedEditCertificationError::OutsideDeclaredOwnership(vec![path.into()]),
            );
        }
        // Creation owns this exact prepared table, including its retained source residue.
        // Existing scenario tables still undergo the ordinary per-byte ownership comparison.
        baseline.insert(path.into(), output.bytes.clone());
        transitions.push(ClassicOwnedFileTransition {
            from_path: None,
            to_path: path.into(),
            before_bytes: 0,
            after_bytes: output.bytes.len(),
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codecs::decode_race_rules;
    use std::collections::BTreeMap;

    #[test]
    fn rule_authoring_new_table_requires_explicit_exact_prepared_source() {
        let bytes = vec![0; 408 * 30 + 7];
        let mut snapshot =
            ProjectSnapshot::new_authored(crate::model::StableId("rule-certification".into()));
        snapshot.race_rules = decode_race_rules(&bytes, None).rules;
        snapshot.race_rules[19].source = "Scenario Data Race record 20".into();
        let mut manifest = NativeManifest::default();
        manifest.insert_generated("Data Race", NativeFileFamily::RaceRules, bytes.clone());
        let sources = ClassicCompatibilitySources {
            current_data_race: Some(&bytes),
            ..Default::default()
        };
        let mut baseline = BTreeMap::new();
        let mut transitions = Vec::new();
        allocate_tables(
            &snapshot,
            sources,
            &manifest,
            &mut baseline,
            &mut transitions,
        )
        .unwrap();
        assert_eq!(baseline["Data Race"], bytes);
        assert_eq!(transitions[0].before_bytes, 0);
        assert!(
            allocate_tables(
                &snapshot,
                ClassicCompatibilitySources::default(),
                &manifest,
                &mut BTreeMap::new(),
                &mut Vec::new()
            )
            .is_err()
        );
        let mut changed = bytes.clone();
        changed[96] = 99;
        manifest.insert_generated("Data Race", NativeFileFamily::RaceRules, changed);
        assert!(
            allocate_tables(
                &snapshot,
                sources,
                &manifest,
                &mut BTreeMap::new(),
                &mut Vec::new()
            )
            .is_err()
        );
        snapshot.race_rules[19].source = "Application Data Race".into();
        manifest.insert_generated("Data Race", NativeFileFamily::RaceRules, bytes.clone());
        assert!(
            allocate_tables(
                &snapshot,
                sources,
                &manifest,
                &mut BTreeMap::new(),
                &mut Vec::new()
            )
            .is_err()
        );
    }
}
