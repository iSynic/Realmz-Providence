use super::*;
use providence_core::model::ProjectSnapshot;

fn session() -> EditorSession {
    EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "encounter-authoring-test".into(),
    )))
}

#[test]
fn preparation_is_read_only_and_reconciliation_does_not_replay_a_command() {
    let mut session = session();
    let prepared = dispatch(
        &mut session,
        "encounter.prepare-create",
        json!({"kind": "rogue"}),
    )
    .unwrap();
    assert_eq!(session.revision().0, 0);
    assert!(session.snapshot().rogue_encounters.is_empty());
    let created = dispatch(
        &mut session,
        "encounter.create-rogue",
        json!({"expectedRevision": 0}),
    )
    .unwrap();
    let mut draft = created["document"]["encounter"].clone();
    draft["modifiers"][0] = json!(15);
    dispatch(
        &mut session,
        "encounter.apply-rogue-draft",
        json!({"expectedRevision": 1, "draft": draft}),
    )
    .unwrap();
    let result = dispatch(
        &mut session,
        "encounter.reconcile-draft",
        json!({"kind": "rogue", "identity": prepared["identity"], "draft": draft}),
    )
    .unwrap();
    assert_eq!(result["outcome"], "matches-draft");
    assert_eq!(result["projection"]["revision"], 2);
    assert_eq!(session.revision().0, 2);
    draft["modifiers"][0] = json!(16);
    let different = dispatch(
        &mut session,
        "encounter.reconcile-draft",
        json!({"kind": "rogue", "identity": prepared["identity"], "draft": draft}),
    )
    .unwrap();
    assert_eq!(different["outcome"], "different");
    assert_eq!(session.snapshot().rogue_encounters[0].modifiers[0], 15);
}

#[test]
fn catalog_search_precedes_paging_and_copy_keeps_distinct_identity() {
    let mut session = session();
    let mut snapshot = session.snapshot().clone();
    snapshot.rogue_encounters =
        providence_core::codecs::decode_rogue_encounters(&vec![0; 118 * 140]).records;
    snapshot.rogue_encounters[139].type_flags[9] = true;
    session = EditorSession::new(snapshot);
    let page = super::super::encounter_catalog::encounter_list_rogue(
        &mut session,
        json!({"query": "139", "limit": 128}),
    )
    .unwrap();
    assert_eq!(page["total"], 1);
    assert_eq!(page["items"][0]["nativeId"], 139);
    let content = super::super::encounter_catalog::encounter_list_rogue(
        &mut session,
        json!({"query": "trapped", "limit": 128}),
    )
    .unwrap();
    assert_eq!(content["total"], 1);
    assert_eq!(content["items"][0]["nativeId"], 139);
    assert!(
        dispatch(
            &mut session,
            "encounter.create-rogue",
            json!({"expectedRevision": 0})
        )
        .is_err()
    );
    let mut fresh = self::session();
    dispatch(
        &mut fresh,
        "encounter.create-rogue",
        json!({"expectedRevision": 0}),
    )
    .unwrap();
    let copied = dispatch(
        &mut fresh,
        "encounter.copy-rogue",
        json!({"expectedRevision": 1, "source": "rogue-encounter:0"}),
    )
    .unwrap();
    assert_eq!(copied["document"]["encounter"]["nativeId"], 1);
    assert_eq!(fresh.snapshot().rogue_encounters[0].native_id.0, 0);
}
