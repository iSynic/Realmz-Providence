use super::*;
use providence_core::{
    model::{ProjectSnapshot, StableId},
    references::{FieldPath, ReferenceDescriptor, ResolutionState, TargetKind},
    validation::{Diagnostic, Severity},
};

#[test]
fn grouped_artwork_keeps_complete_membership_and_searches_every_cell() {
    let (raw, findings) = artwork_fixture();
    let page = findings
        .project(
            Revision(1),
            &json!({"query":"tiles[199]"}),
            &Default::default(),
        )
        .unwrap();
    assert_eq!(page["total"], 1);
    assert_eq!(page["occurrenceCounts"]["warnings"], 200);
    assert_eq!(page["groups"][0]["occurrenceTotal"], 200);
    let identity = page["items"][0]["groupIdentity"].clone();
    let received = group_fields(&findings, identity);
    assert_eq!(
        received,
        raw.iter()
            .map(|row| row.field.as_ref().unwrap().0.clone())
            .collect::<Vec<_>>()
    );
}

fn group_fields(findings: &Findings, identity: Value) -> Vec<String> {
    let mut received = Vec::new();
    for offset in [0, 128] {
        let page = findings
            .project(
                Revision(1),
                &json!({"groupIdentity":identity, "offset":offset, "limit":128}),
                &Default::default(),
            )
            .unwrap();
        received.extend(
            page["items"]
                .as_array()
                .unwrap()
                .iter()
                .map(|row| row["field"].as_str().unwrap().to_string()),
        );
        assert!(
            page["items"]
                .as_array()
                .unwrap()
                .iter()
                .all(|row| row["occurrenceCount"] == 1)
        );
    }
    received
}

fn artwork_fixture() -> (Vec<Diagnostic>, Findings) {
    let raw = (0..200)
        .map(|id| Diagnostic {
            code: "reference.picture.missing".into(),
            severity: Severity::Warning,
            message: "Missing artwork".into(),
            entity: Some(StableId("land:0".into())),
            field: Some(FieldPath(format!("tiles[{id}]"))),
        })
        .collect::<Vec<_>>();
    let references = raw
        .iter()
        .map(|row| ReferenceDescriptor {
            source: row.entity.clone().unwrap(),
            field: row.field.clone().unwrap(),
            target_kind: TargetKind::Picture,
            target_id: "PICT:13000".into(),
            required: true,
            stock_fallback: None,
            resolution: ResolutionState::Missing,
            repair_actions: Vec::new(),
            byte_provenance: None,
        })
        .collect::<Vec<_>>();
    let snapshot = ProjectSnapshot::new_authored(StableId("artwork".into()));
    let findings = Findings(FindingIndex::derive(
        &snapshot,
        raw.clone(),
        &references,
        None,
    ));
    (raw, findings)
}

#[test]
fn optional_caller_filter_spans_families_preserves_errors_and_original_counts() {
    use providence_core::{codecs, model::NativeRecordId};
    let mut snapshot = ProjectSnapshot::new_authored(StableId("caller-filter".into()));
    snapshot.battles = codecs::decode_battles(&vec![0; 2 * codecs::BATTLE_RECORD_BYTES]).records;
    snapshot.shops = codecs::decode_shops(&vec![0; 2 * codecs::SHOP_RECORD_BYTES]).records;
    let reference = ReferenceDescriptor {
        source: StableId("shop:0".into()),
        field: FieldPath("battle".into()),
        target_kind: TargetKind::Battle,
        target_id: NativeRecordId(1).0.to_string(),
        required: true,
        stock_fallback: None,
        resolution: ResolutionState::Resolved,
        repair_actions: vec![],
        byte_provenance: None,
    };
    let rows = [
        ("battle:0", Severity::Warning),
        ("shop:0", Severity::Warning),
        ("battle:1", Severity::Warning),
        ("battle:0", Severity::Error),
        ("unknown:0", Severity::Warning),
        ("shop:0", Severity::Information),
    ]
    .into_iter()
    .enumerate()
    .map(|(i, (id, severity))| Diagnostic {
        code: "test.caller-filter".into(),
        severity,
        message: "Finding".into(),
        entity: Some(StableId(id.into())),
        field: Some(FieldPath(format!("field{i}"))),
    })
    .collect();
    let index = providence_core::discovery::DiscoveryIndex::build(
        &snapshot,
        std::slice::from_ref(&reference),
    );
    let uncalled = providence_core::validation::findings::callers::records_without_callers(&index);
    assert!(uncalled.contains(&StableId("shop:0".into())));
    assert!(!uncalled.contains(&StableId("battle:1".into())));
    let findings = Findings(FindingIndex::derive(&snapshot, rows, &[reference], None));
    let params = json!({"showAll": true, "hideUncalledWarnings": true, "limit": 2});
    let page = findings.project(Revision(1), &params, &uncalled).unwrap();
    assert_eq!(page["total"], 4);
    assert_eq!(page["items"].as_array().unwrap().len(), 2);
    assert_eq!(page["unfilteredCounts"]["warnings"], 4);
    assert_eq!(page["temporaryHiddenCount"], 2);
    let restored = findings
        .project(Revision(1), &json!({"showAll":true}), &uncalled)
        .unwrap();
    assert_eq!(restored["total"], 6);
    assert!(
        findings
            .project(
                Revision(1),
                &json!({"hideUncalledWarnings":"yes"}),
                &uncalled
            )
            .is_err()
    );
}
