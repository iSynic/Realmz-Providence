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
        .project(Revision(1), &json!({"query":"tiles[199]"}))
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
