use super::*;
use crate::{
    codecs::decode_monster_set,
    model::{BlobId, ProjectOrigin},
};

fn fixture() -> (ProjectSnapshot, Vec<Diagnostic>) {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("monster-tail".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId("source".into()),
    };
    let mut normal = decode_monster_set(&[0; 210 * 4], "Data MD", 0);
    normal.monsters[2].hit_dice = 255;
    let warnings = normal
        .monsters
        .iter()
        .map(|row| Diagnostic {
            code: "reference.icon.missing".into(),
            severity: Severity::Warning,
            message: "Missing icon".into(),
            entity: Some(row.identity.clone()),
            field: Some(FieldPath("icon".into())),
        })
        .collect();
    snapshot.monster_sets.push(normal);
    (snapshot, warnings)
}

#[test]
fn only_uncalled_imported_tail_warnings_are_details() {
    let (snapshot, warnings) = fixture();
    let before = snapshot.clone();
    let findings = Findings::derive(&snapshot, warnings.clone(), &[], None);
    assert_eq!(findings.view(false, None).unwrap().rows(), &warnings[..2]);
    assert_eq!(findings.view(true, None).unwrap().rows(), warnings);
    let all = findings.view(true, None).unwrap();
    assert!(all.row(&warnings[3]).preservation_reason.is_some());
    assert!(all.row(&warnings[0]).preservation_reason.is_none());
    assert_eq!(snapshot, before);
}

#[test]
fn hidden_marker_authored_rows_and_errors_remain_actionable() {
    let (mut snapshot, mut warnings) = fixture();
    snapshot.monster_sets[0].monsters[2].not_on_menu = true;
    assert_eq!(
        Findings::derive(&snapshot, warnings.clone(), &[], None)
            .view(false, None)
            .unwrap()
            .rows()
            .len(),
        4
    );
    snapshot.monster_sets[0].monsters[2].not_on_menu = false;
    snapshot.monster_sets[0].monsters[3].authored = true;
    warnings[2].severity = Severity::Error;
    assert_eq!(
        Findings::derive(&snapshot, warnings.clone(), &[], None)
            .view(false, None)
            .unwrap()
            .rows()
            .len(),
        4
    );
    snapshot.monster_sets[0].monsters[3].authored = false;
    snapshot.origin = ProjectOrigin::Authored;
    assert_eq!(
        Findings::derive(&snapshot, warnings, &[], None)
            .view(false, None)
            .unwrap()
            .rows()
            .len(),
        4
    );
}

#[test]
fn a_reference_to_any_difficulty_retains_the_native_id() {
    use crate::references::{ReferenceDescriptor, ResolutionState, TargetKind};
    let (snapshot, warnings) = fixture();
    for target in ["3", "monster:-1:3", "monster:0:3", "monster:1:3"] {
        let reference = ReferenceDescriptor {
            source: StableId("xap:dormant".into()),
            field: FieldPath("actions[0]".into()),
            target_kind: TargetKind::Monster,
            target_id: target.into(),
            required: true,
            stock_fallback: None,
            resolution: ResolutionState::Resolved,
            repair_actions: vec![],
            byte_provenance: None,
        };
        let findings = Findings::derive(&snapshot, warnings.clone(), &[reference], None);
        let rows = findings.view(false, None).unwrap();
        assert_eq!(rows.rows().len(), 3);
        assert_eq!(rows.rows()[2], warnings[3]);
    }
}
