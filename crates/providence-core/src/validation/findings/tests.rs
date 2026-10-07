use super::*;
use crate::{
    model::{ClassicAction, ExtraActionPoint, NativeRecordId, ProjectSnapshot, StableId},
    session::EditorSession,
};

fn derive(session: &EditorSession) -> Findings {
    Findings::derive(
        session.snapshot(),
        session.diagnostics(),
        &session.references(),
        None,
    )
}

#[test]
fn preserved_item_restriction_stays_available_without_actionable_noise() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("preserved-restriction".into()));
    snapshot.origin = crate::model::ProjectOrigin::Imported {
        compatibility_annex: crate::model::BlobId("annex".into()),
    };
    let mut data = vec![0; 20_000];
    data[50..52].copy_from_slice(&i16::MIN.to_be_bytes());
    snapshot.scenario_item_rules = crate::codecs::decode_scenario_item_rules(
        &data,
        None,
        crate::model::BlobId("source".into()),
        None,
    )
    .unwrap()
    .rules;
    let session = EditorSession::new(snapshot);
    let findings = derive(&session);
    assert!(findings.view(false, None).unwrap().rows().is_empty());
    let all = findings.view(true, None).unwrap();
    assert_eq!(all.rows().len(), 1);
    assert_eq!(
        all.row(&all.rows()[0]).target_impact,
        FindingImpact::PreservationDetail
    );
}

#[test]
fn an_empty_battle_becomes_actionable_when_an_instruction_calls_it() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("battle-use".into()));
    snapshot.battles =
        crate::codecs::decode_battles(&vec![0; 2 * crate::codecs::BATTLE_RECORD_BYTES]).records;
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("xap:1".into()),
        native_id: NativeRecordId(1),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![ClassicAction {
            slot: 0,
            raw_opcode: 2,
            target_native_id: 1,
        }],
    });
    snapshot.extra_codes.push(crate::model::ExtraCodeRow {
        native_id: NativeRecordId(1),
        values: [1, 1, 0, 0, 0],
    });
    let session = EditorSession::new(snapshot);
    let findings = derive(&session);
    let active = findings.view(false, None).unwrap();
    assert_eq!(active.rows().len(), 1);
    assert_eq!(active.rows()[0].entity, Some(StableId("battle:1".into())));
    let all = findings.view(true, None).unwrap();
    assert_eq!(all.rows().len(), 2);
    assert_eq!(
        all.row(&all.rows()[0]).target_impact,
        FindingImpact::PreservationDetail
    );
    assert_eq!(
        all.row(&all.rows()[1]).target_impact,
        FindingImpact::AuthoringRuntimeWarning
    );
}
