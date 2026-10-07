use providence_core::{
    codecs,
    model::{ProjectSnapshot, StableId},
    session::EditorSession,
};
use serde_json::json;

#[test]
fn unused_spell_filter_keeps_named_populated_authored_and_called_definitions() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("spell-filter".into()));
    snapshot.standard_spells =
        codecs::decode_standard_spells(&[0; codecs::STANDARD_SPELL_BYTES], None).spells;
    snapshot.standard_spells[4].definition.name = "Named placeholder".into();
    snapshot.standard_spells[5].definition.cost = 1;
    snapshot.standard_spells[6].definition.authored = true;
    let mut monster = [0; 210];
    monster[0] = 1;
    monster[64..66].copy_from_slice(&1114i16.to_be_bytes());
    snapshot.monster_sets = vec![codecs::decode_monster_set(&monster, "Data MD", 0)];
    let session = EditorSession::new(snapshot);
    let page = crate::spell_catalog::dispatch(
        &session,
        None,
        "spell.catalog",
        &json!({"class":1,"level":1}),
    )
    .unwrap();
    assert_eq!(page["total"], 4);
    let ids: Vec<_> = page["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["classicId"].as_i64().unwrap())
        .collect();
    assert_eq!(ids, [1105, 1106, 1107, 1114]);
    let all = crate::spell_catalog::dispatch(
        &session,
        None,
        "spell.catalog",
        &json!({"class":1,"level":1,"showUnused":true}),
    )
    .unwrap();
    assert_eq!(all["total"], 15);
    assert_eq!(all["items"][0]["unused"], true);
    let searched =
        crate::spell_catalog::dispatch(&session, None, "spell.catalog", &json!({"query":"1113"}))
            .unwrap();
    assert_eq!(searched["total"], 0);
    let shown = crate::spell_catalog::dispatch(
        &session,
        None,
        "spell.catalog",
        &json!({"query":"1113","showUnused":true}),
    )
    .unwrap();
    assert_eq!(shown["total"], 1);
    assert_eq!(session.revision(), providence_core::session::Revision(0));
    assert_eq!(session.snapshot().standard_spells.len(), 420);
}
