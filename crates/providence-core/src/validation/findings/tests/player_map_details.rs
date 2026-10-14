use super::*;
use crate::{
    codecs::{PLAYER_MAP_RECORD_BYTES, decode_player_maps, encode_player_maps},
    model::{BlobId, PlayerMapNameCatalog, ProjectOrigin},
    references::{ReferenceDescriptor, ResolutionState, TargetKind},
};

fn fixture() -> (ProjectSnapshot, Vec<u8>) {
    // Controlled native geometry: plausible map zero followed by retained text.
    let mut source = vec![0; PLAYER_MAP_RECORD_BYTES];
    source[68..70].copy_from_slice(&32_i16.to_be_bytes());
    source.extend(vec![b' '; PLAYER_MAP_RECORD_BYTES]);
    source.extend([0xde, 0xad]);
    let mut snapshot = ProjectSnapshot::new_authored(StableId("player-map-details".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId("source".into()),
    };
    snapshot.world.player_maps = decode_player_maps(&source).records;
    snapshot.player_map_names = Some(PlayerMapNameCatalog {
        source_blob: Some(BlobId("names".into())),
        available_names: vec!["Town map".into(), "--------------------".into()],
        unavailable_names: vec!["Town map".into(), "--------------------".into()],
    });
    (snapshot, source)
}

fn findings(snapshot: &ProjectSnapshot, references: &[ReferenceDescriptor]) -> Findings {
    let session = EditorSession::new(snapshot.clone());
    let mut all = session.references();
    all.extend_from_slice(references);
    Findings::derive(snapshot, session.diagnostics(), &all, None)
}

#[test]
fn unnamed_uncalled_imported_text_rows_are_details_and_round_trip_exactly() {
    let (snapshot, source) = fixture();
    let before = snapshot.clone();
    let findings = findings(&snapshot, &[]);
    let visible = findings.view(false, None).unwrap();
    assert!(
        visible
            .rows()
            .iter()
            .all(|row| row.entity != Some(StableId("player-map:1".into())))
    );
    let all = findings.view(true, None).unwrap();
    let rows = all
        .rows()
        .iter()
        .filter(|row| row.entity == Some(StableId("player-map:1".into())))
        .collect::<Vec<_>>();
    assert_eq!(rows.len(), 3);
    for row in rows {
        assert_eq!(
            all.row(row).target_impact,
            FindingImpact::PreservationDetail
        );
        assert!(
            all.row(row)
                .preservation_reason
                .unwrap()
                .contains("Unused imported Player Map")
        );
    }
    assert_eq!(
        encode_player_maps(&snapshot.world.player_maps, Some(&source)).unwrap(),
        source
    );
    assert_eq!(snapshot, before);
}

#[test]
fn callers_names_edits_and_unknown_name_context_restore_warnings() {
    let (original, _) = fixture();
    for case in [
        "canonical-caller",
        "numeric-caller",
        "named",
        "unavailable-name",
        "authored",
        "fresh",
        "missing-names",
        "incomplete-names",
    ] {
        let mut snapshot = original.clone();
        change_context(&mut snapshot, case);
        let reference = match case {
            "canonical-caller" => Some(caller("player-map:1")),
            "numeric-caller" => Some(caller("1")),
            _ => None,
        };
        let findings = findings(&snapshot, &reference.into_iter().collect::<Vec<_>>());
        let visible = findings.view(false, None).unwrap();
        assert_eq!(
            visible
                .rows()
                .iter()
                .filter(|row| row.entity == Some(StableId("player-map:1".into())))
                .count(),
            3,
            "{case}"
        );
    }
}

fn change_context(snapshot: &mut ProjectSnapshot, case: &str) {
    match case {
        "named" => snapshot.player_map_names.as_mut().unwrap().available_names[1] = "Map".into(),
        "unavailable-name" => {
            snapshot
                .player_map_names
                .as_mut()
                .unwrap()
                .unavailable_names[1] = "Lost map".into()
        }
        "authored" => snapshot.world.player_maps[1].authored = true,
        "fresh" => snapshot.origin = ProjectOrigin::Authored,
        "missing-names" => snapshot.player_map_names = None,
        "incomplete-names" => {
            snapshot
                .player_map_names
                .as_mut()
                .unwrap()
                .available_names
                .truncate(1);
        }
        _ => {}
    }
}

fn caller(target: &str) -> ReferenceDescriptor {
    ReferenceDescriptor {
        source: StableId("xap:dormant".into()),
        field: FieldPath("actions[0].target".into()),
        target_kind: TargetKind::PlayerMap,
        target_id: target.into(),
        required: true,
        stock_fallback: None,
        resolution: ResolutionState::Resolved,
        repair_actions: vec![],
        byte_provenance: None,
    }
}

#[test]
fn outside_menu_rows_are_details_but_errors_and_explicit_uses_stay_visible() {
    let (mut snapshot, _) = fixture();
    snapshot.world.player_maps[1].native_id = NativeRecordId(20);
    snapshot.world.player_maps[1].identity = StableId("player-map:20".into());
    snapshot.player_map_names = None;
    let warning = Diagnostic {
        code: "reference.map.missing".into(),
        severity: Severity::Warning,
        message: "Missing map".into(),
        entity: Some(StableId("player-map:20".into())),
        field: Some(FieldPath("level".into())),
    };
    let hidden = Findings::derive(&snapshot, vec![warning.clone()], &[], None);
    assert!(hidden.view(false, None).unwrap().rows().is_empty());
    let called = Findings::derive(&snapshot, vec![warning.clone()], &[caller("20")], None);
    assert_eq!(called.view(false, None).unwrap().rows().len(), 1);
    let error = Diagnostic {
        severity: Severity::Error,
        ..warning
    };
    let strict = Findings::derive(&snapshot, vec![error], &[], None);
    assert_eq!(strict.view(false, None).unwrap().rows().len(), 1);
}
