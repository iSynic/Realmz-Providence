use super::*;
use crate::{
    model::{BlobId, ProjectOrigin, ShopRecord},
    references::{ReferenceDescriptor, ResolutionState, TargetKind},
};

fn fixture() -> (ProjectSnapshot, Vec<Diagnostic>) {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("uncalled".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId("source".into()),
    };
    snapshot.shops.push(ShopRecord {
        identity: StableId("shop:21".into()),
        native_id: NativeRecordId(21),
        item_ids: vec![29557, 26215],
        quantities: vec![1, 1],
        inflation: 478,
        authored: false,
    });
    let warnings = (0..2)
        .map(|slot| Diagnostic {
            code: "reference.item.missing".into(),
            severity: Severity::Warning,
            message: "Missing item".into(),
            entity: Some(StableId("shop:21".into())),
            field: Some(FieldPath(format!("itemIds[{slot}]"))),
        })
        .collect();
    (snapshot, warnings)
}

#[test]
fn uncalled_imported_warnings_remain_available_with_exact_fields() {
    let (snapshot, warnings) = fixture();
    let before = snapshot.clone();
    let findings = Findings::derive(&snapshot, warnings.clone(), &[], None);
    assert!(findings.view(false, None).unwrap().rows().is_empty());
    assert_eq!(findings.hidden_detail_count(), 2);
    let all = findings.view(true, None).unwrap();
    assert_eq!(all.rows(), warnings);
    assert_eq!(all.occurrence_counts().total, [0, 2, 0]);
    for warning in all.rows() {
        assert_eq!(
            all.row(warning).target_impact,
            FindingImpact::PreservationDetail
        );
    }
    assert_eq!(snapshot, before);
}

#[test]
fn any_numeric_or_canonical_caller_keeps_imported_warnings_actionable() {
    let (snapshot, warnings) = fixture();
    for target in ["21", "shop:21"] {
        let reference = ReferenceDescriptor {
            source: StableId("xap:dormant".into()),
            field: FieldPath("actions[3]".into()),
            target_kind: TargetKind::Shop,
            target_id: target.into(),
            required: true,
            stock_fallback: None,
            resolution: ResolutionState::Resolved,
            repair_actions: vec![],
            byte_provenance: None,
        };
        let findings = Findings::derive(&snapshot, warnings.clone(), &[reference], None);
        let view = findings.view(false, None).unwrap();
        assert_eq!(view.rows().len(), 2);
        assert_eq!(findings.hidden_detail_count(), 0);
        assert_eq!(
            view.row(&view.rows()[0]).target_impact,
            FindingImpact::AuthoringRuntimeWarning
        );
    }
}

#[test]
fn authored_edits_fresh_projects_and_errors_are_not_hidden() {
    let (mut snapshot, mut warnings) = fixture();
    snapshot.shops[0].authored = true;
    assert_eq!(
        Findings::derive(&snapshot, warnings.clone(), &[], None)
            .view(false, None)
            .unwrap()
            .rows()
            .len(),
        2
    );
    snapshot.shops[0].authored = false;
    snapshot.origin = ProjectOrigin::Authored;
    assert_eq!(
        Findings::derive(&snapshot, warnings.clone(), &[], None)
            .view(false, None)
            .unwrap()
            .rows()
            .len(),
        2
    );
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId("source".into()),
    };
    warnings[0].severity = Severity::Error;
    let findings = Findings::derive(&snapshot, warnings, &[], None);
    let view = findings.view(false, None).unwrap();
    assert_eq!(view.rows().len(), 1);
    assert_eq!(
        view.row(&view.rows()[0]).target_impact,
        FindingImpact::ExportBlocker
    );
}

#[test]
fn root_owned_warnings_are_not_hidden() {
    let (snapshot, warnings) = fixture();
    for owner in ["monster:normal:0", "land:0", "timed:0", "xap:0"] {
        let mut warning = warnings[0].clone();
        warning.entity = Some(StableId(owner.into()));
        let findings = Findings::derive(&snapshot, vec![warning], &[], None);
        assert_eq!(findings.view(false, None).unwrap().rows().len(), 1);
    }
}
