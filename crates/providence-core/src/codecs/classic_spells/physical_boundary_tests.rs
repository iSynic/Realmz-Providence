use super::*;
use crate::{
    action_authoring::*,
    model::*,
    references::{ResolutionState, TargetKind},
    session::EditorSession,
};

fn physical_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("physical-spells".into()));
    let blob = BlobId(format!("sha256:{}", "a".repeat(64)));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: blob.clone(),
    };
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data Spell".into(),
        blob: blob.clone(),
        byte_length: 9016,
    });
    snapshot.scenario_spells = decode_scenario_spells(&vec![0; 9016], Some(blob)).spells;
    snapshot
}

#[test]
fn physical_overflow_never_becomes_an_action_target_or_fresh_spell_bank() {
    let snapshot = physical_snapshot();
    for id in [5801, 6101] {
        let page = list_targets(
            &snapshot,
            &ActionTargetQuery {
                kind: ActionTargetKind::Spell,
                search: id.to_string(),
                cursor: None,
                limit: 128,
                context: Default::default(),
            },
        )
        .unwrap();
        assert_eq!(page.total, 0);
    }
    assert_eq!(
        crate::rebuilt::project_rebuilt_v3_spell_catalog(&snapshot)
            .unwrap()
            .len(),
        105
    );
    let mut fresh = snapshot;
    fresh.origin = ProjectOrigin::Authored;
    assert!(crate::rebuilt::project_rebuilt_v3_spell_catalog(&fresh).is_err());
    assert!(encode_scenario_spells(&fresh.scenario_spells, None).is_err());
}

#[test]
fn overflow_spell_references_are_missing_and_invalid_packed_ids_have_no_stock_fallback() {
    let mut snapshot = physical_snapshot();
    let mut monster = vec![0; crate::codecs::MONSTER_RECORD_BYTES];
    monster[0] = 1;
    for (index, id) in [5801_i16, 6101, 1101, 5101].into_iter().enumerate() {
        monster[64 + index * 2..66 + index * 2].copy_from_slice(&id.to_be_bytes());
    }
    snapshot
        .monster_sets
        .push(crate::codecs::decode_monster_set(&monster, "Data MD", 0));
    let mut item = crate::codecs::new_scenario_item_definition(100).unwrap();
    item.special[1] = 5801;
    snapshot.scenario_item_rules.push(SourcedScenarioItemRule {
        record_index: 100,
        source: "controlled item".into(),
        source_blob: BlobId("binary".into()),
        text_source_blob: None,
        definition: item,
    });
    let references = EditorSession::new(snapshot).references();
    for field in ["spells[0]", "spells[1]", "special[1]"] {
        let row = references
            .iter()
            .find(|r| r.target_kind == TargetKind::Spell && r.field.0 == field)
            .unwrap();
        assert_eq!(row.resolution, ResolutionState::Missing);
        assert!(row.stock_fallback.is_none());
    }
    let stock = references
        .iter()
        .find(|r| r.field.0 == "spells[2]")
        .unwrap();
    assert_eq!(stock.resolution, ResolutionState::StockFallback);
    let native = references
        .iter()
        .find(|r| r.field.0 == "spells[3]")
        .unwrap();
    assert_eq!(native.resolution, ResolutionState::Resolved);
}
