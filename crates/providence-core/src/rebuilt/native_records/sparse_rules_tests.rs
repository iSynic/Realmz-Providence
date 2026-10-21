use super::*;
use crate::{codecs::*, model::*, rebuilt::*};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

fn fixture(
    race_bytes: Vec<u8>,
    caste_bytes: Vec<u8>,
    menu: u16,
) -> (
    ProjectSnapshot,
    BTreeMap<String, Vec<u8>>,
    RebuiltV3RuleCatalog,
) {
    let stock = crate::rebuilt::rules::tests::complete_rule_snapshot();
    let application = project_rebuilt_v3_rule_catalog(&stock).unwrap();
    let mut snapshot = stock;
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    let bytes: BTreeMap<String, Vec<u8>> = BTreeMap::from([
        ("Data Race".into(), race_bytes),
        ("Data Caste".into(), caste_bytes),
    ]);
    snapshot.classic_sources = bytes
        .iter()
        .map(|(path, bytes)| ClassicSourceBlob {
            native_path: path.clone(),
            byte_length: bytes.len() as u64,
            blob: BlobId(format!("sha256:{:x}", Sha256::digest(bytes))),
        })
        .collect();
    snapshot.race_rules = decode_race_rules(
        &bytes["Data Race"],
        Some(snapshot.classic_sources[1].blob.clone()),
    )
    .rules;
    snapshot.caste_rules = decode_caste_rules(
        &bytes["Data Caste"],
        Some(snapshot.classic_sources[0].blob.clone()),
    )
    .rules;
    snapshot.race_rules.truncate(30);
    snapshot.caste_rules.truncate(30);
    derive_available_caste_eligibility(&snapshot.race_rules, &mut snapshot.caste_rules).unwrap();
    snapshot.classic_rule_selection = Some(ClassicRuleSelectionContextV1 {
        record_version: 1,
        project_id: snapshot.project_id.clone(),
        captured_source_set_sha256: classic_source_set_sha256(&snapshot).unwrap(),
        native_menu_selection: menu,
        evidence_origin: ClassicRuleSelectionEvidence::OwnerConfigured,
    });
    (snapshot, bytes, application)
}

fn selected(
    snapshot: &ProjectSnapshot,
    application: &RebuiltV3RuleCatalog,
) -> ResolvedClassicRules {
    resolve_classic_rules(
        snapshot,
        application,
        &ClassicRuleNameOverrides {
            races: None,
            castes: None,
        },
    )
    .unwrap()
}

#[test]
fn sparse_native_families_bind_all_slots_without_substituting_stock_or_dropping_zero_rows() {
    for (race_count, race_tail, caste_count, caste_tail) in
        [(0, 0, 0, 0), (0, 37, 1, 0), (2, 56, 0, 13), (30, 0, 30, 0)]
    {
        let (snapshot, bytes, app) = fixture(
            vec![0; race_count * 408 + race_tail],
            vec![0; caste_count * 576 + caste_tail],
            20,
        );
        let selection = selected(&snapshot, &app);
        assert_eq!(selection.effective_snapshot.race_rules.len(), race_count);
        assert_eq!(selection.runtime_overrides.castes.len(), caste_count);
        let facts = project_rebuilt_v7_rule_selection(&snapshot, &selection).unwrap();
        for (family, rows, complete) in [
            ("race", facts.projected_rules.races, race_count),
            ("caste", facts.projected_rules.castes, caste_count),
        ] {
            assert_eq!(rows.len(), 30);
            for (index, row) in rows.iter().enumerate() {
                assert_eq!(row.id, format!("classic.{family}.{}", index + 1));
                assert_eq!(row.sha256.is_some(), index < complete);
            }
        }
        let raw = project_rebuilt_v7_effective_records(&snapshot, &bytes).unwrap();
        assert_eq!(
            (raw.races.len(), raw.castes.len()),
            (race_count, caste_count)
        );
        assert!(raw.sources.iter().all(|source| source.edits.is_empty()));
        super::rules::validate_selection(&raw, &selection).unwrap();
        if race_count > 0 {
            assert_eq!(raw.races[0].maximum_age, 0);
            assert_eq!(raw.races[0].name, "");
        }
        let mut legacy = selection.effective_snapshot.clone();
        legacy.origin = ProjectOrigin::Authored;
        assert!(project_rebuilt_rule_catalog(&legacy).is_err());
        assert!(project_rebuilt_v3_rule_catalog(&selection.effective_snapshot).is_err());
    }
}

#[test]
fn application_selection_keeps_raw_native_rows_independent_of_effective_rules() {
    let (snapshot, bytes, app) = fixture(vec![0; 2 * 408 + 56], vec![0; 576 + 13], 10);
    let selection = selected(&snapshot, &app);
    assert_eq!(selection.effective_snapshot.race_rules.len(), 30);
    assert_ne!(
        selection.effective_snapshot.race_rules[0]
            .definition
            .maximum_age,
        0
    );
    let raw = project_rebuilt_v7_effective_records(&snapshot, &bytes).unwrap();
    assert_eq!((raw.races.len(), raw.castes.len()), (2, 1));
    assert_eq!(raw.races[0].maximum_age, 0);
    assert_eq!(raw.castes[0].name, "");
    let facts = project_rebuilt_v7_rule_selection(&snapshot, &selection).unwrap();
    assert!(
        facts
            .projected_rules
            .races
            .iter()
            .all(|row| row.sha256.is_some())
    );
}

#[test]
fn native_rule_edits_use_original_preimages_and_refresh_raw_facts_without_extending_tables() {
    let (mut snapshot, bytes, app) = fixture(vec![0; 2 * 408 + 56], vec![0; 576 + 13], 20);
    snapshot.race_rules[0].definition.maximum_age = -7;
    snapshot.caste_rules[0].definition.start_money = -12345;
    let raw = project_rebuilt_v7_effective_records(&snapshot, &bytes).unwrap();
    assert_eq!(raw.races[0].maximum_age, -7);
    assert_eq!(raw.castes[0].start_money, -12345);
    for source in &raw.sources {
        assert_eq!(source.byte_length, source.effective_byte_length);
        assert_ne!(source.sha256, source.effective_sha256);
        let mut effective = bytes[&source.native_path].clone();
        for edit in &source.edits {
            assert_eq!(
                effective[edit.offset..edit.offset + edit.before.len()],
                edit.before
            );
            effective.splice(
                edit.offset..edit.offset + edit.before.len(),
                edit.after.clone(),
            );
        }
        assert_eq!(
            format!("{:x}", Sha256::digest(&effective)),
            source.effective_sha256
        );
        assert_eq!(
            &effective[effective.len() - source.layouts[0].trailing_bytes..],
            &bytes[&source.native_path][effective.len() - source.layouts[0].trailing_bytes..]
        );
    }
    super::rules::validate_selection(&raw, &selected(&snapshot, &app)).unwrap();
}

#[test]
fn incomplete_slots_cannot_hide_complete_rows_substituted_sources_or_forged_mechanics() {
    let (snapshot, bytes, app) = fixture(vec![0; 2 * 408 + 56], vec![0; 576], 20);
    let selection = selected(&snapshot, &app);
    let raw = project_rebuilt_v7_effective_records(&snapshot, &bytes).unwrap();
    let mut erased = selected(&snapshot, &app);
    erased.effective_snapshot.race_rules.pop();
    assert!(project_rebuilt_v7_rule_selection(&snapshot, &erased).is_err());
    for defect in ["extent", "mechanics", "identity"] {
        let mut forged = raw.clone();
        match defect {
            "extent" => {
                forged.races.pop();
            }
            "mechanics" => forged.races[0].base_movement = 12,
            _ => forged.castes[0].classic_id = 2,
        }
        assert!(
            super::rules::validate_selection(&forged, &selection).is_err(),
            "{defect}"
        );
    }
    let mut lost = snapshot.clone();
    lost.race_rules.pop();
    assert!(project_rebuilt_v7_effective_records(&lost, &bytes).is_err());
    let mut substituted = snapshot.clone();
    substituted.race_rules[0].source_blob = Some(BlobId(format!("sha256:{}", "f".repeat(64))));
    assert!(
        resolve_classic_rules(
            &substituted,
            &app,
            &ClassicRuleNameOverrides {
                races: None,
                castes: None
            }
        )
        .is_err()
    );
    assert!(project_rebuilt_v7_effective_records(&substituted, &bytes).is_err());
}

#[test]
fn eligibility_to_missing_native_slots_is_retained_and_source_identified() {
    let (mut snapshot, _, app) = fixture(vec![0; 408], vec![0; 576], 20);
    snapshot.race_rules[0].definition.eligible_caste_ids =
        vec![StableId("classic.caste.30".into())];
    let selection = selected(&snapshot, &app);
    assert_eq!(
        selection.effective_snapshot.race_rules[0]
            .definition
            .eligible_caste_ids[0]
            .0,
        "classic.caste.30"
    );
    assert!(
        selection.effective_snapshot.caste_rules[0]
            .definition
            .eligible_race_ids
            .is_empty()
    );
    let diagnostics = imported_rule_diagnostics(&selection.effective_snapshot);
    assert!(
        diagnostics
            .iter()
            .any(|row| row.source.0 == "classic.race.1"
                && row.field == "eligibleCasteIds"
                && row.target_id == "classic.caste.30")
    );
    assert!(
        diagnostics
            .iter()
            .any(|row| row.source.0 == "classic-source:Data Race"
                && row.target_id == "classic.race.2")
    );
}

#[test]
fn prepared_native_only_controls_require_exact_blobs_preserve_source_extent_and_unowned_bytes() {
    let (mut snapshot, bytes, app) = fixture(vec![0; 2 * 408 + 56], vec![0; 576 + 13], 20);
    let fields = CasteNativeFields {
        starting_items: std::array::from_fn(|slot| {
            (slot == 7).then(|| StableId("classic.item.-12".into()))
        }),
        maximum_spells_per_round: -3,
    };
    let prepared = patch_caste_native_fields(&bytes["Data Caste"], 1, &fields).unwrap();
    let blob = BlobId(format!("sha256:{:x}", Sha256::digest(&prepared)));
    snapshot.caste_rules = decode_caste_rules(&prepared, Some(blob)).rules;
    snapshot.caste_rules[0].source = "Scenario Data Caste record 0".into();
    assert!(project_rebuilt_v7_effective_records(&snapshot, &bytes).is_err());
    let current = BTreeMap::from([("Data Caste".into(), prepared.clone())]);
    let raw = project_rebuilt_v7_effective_records_with_rule_sources(&snapshot, &bytes, &current)
        .unwrap();
    super::rules::validate_selection(&raw, &selected(&snapshot, &app)).unwrap();
    let source = raw
        .sources
        .iter()
        .find(|row| row.native_path == "Data Caste")
        .unwrap();
    let mut effective = bytes["Data Caste"].clone();
    for edit in &source.edits {
        effective.splice(
            edit.offset..edit.offset + edit.before.len(),
            edit.after.clone(),
        );
    }
    assert_eq!(read_caste_native_fields(&effective, 1).unwrap(), fields);
    for defect in ["hash", "unowned", "extent"] {
        let mut forged = prepared.clone();
        match defect {
            "hash" => forged[0] = 1,
            "unowned" => forged[240] = 1,
            _ => forged.push(1),
        }
        let mut changed = snapshot.clone();
        if defect != "hash" {
            changed.caste_rules[0].source_blob =
                Some(BlobId(format!("sha256:{:x}", Sha256::digest(&forged))));
        }
        let current = BTreeMap::from([("Data Caste".into(), forged)]);
        assert!(
            project_rebuilt_v7_effective_records_with_rule_sources(&changed, &bytes, &current)
                .is_err(),
            "{defect}"
        );
    }
}
