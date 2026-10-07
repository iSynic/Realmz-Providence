use super::*;

#[test]
fn mithril_xap_410_failed_item_charge_branch_is_not_a_continue_sentinel() {
    // Independently decoded Mithril Vault Data ED3 record 410 / slot 0: 67 -> 806.
    // EDCD row 806 is [851, 0, 12, 411, -1]. Failure calls loaddoor2(-1), not continue.
    let mut snapshot = action_step_fixtures::placed_snapshot();
    snapshot.world.action_points[0].actions = vec![ClassicAction {
        slot: 0,
        raw_opcode: 67,
        target_native_id: 806,
    }];
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(806),
        values: [851, 0, 12, 411, -1],
    });
    let original = snapshot.clone();
    let session = EditorSession::new(snapshot);
    assert!(session.references().iter().any(|reference| {
        reference.source.0 == "action-point:land:0:0"
            && reference.field.0.ends_with("failureTarget")
            && reference.target_kind == TargetKind::ExtraActionPoint
            && reference.target_id == "-1"
            && reference.resolution == ResolutionState::Missing
    }));
    assert_eq!(session.snapshot(), &original);
}

#[test]
fn negative_settings_ids_do_not_borrow_positive_rows() {
    // misc.c:316 seeks the signed EDCD id; only the stored content uses abs().
    let mut snapshot = action_step_fixtures::placed_snapshot();
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(5),
        values: [2, 0, 0, 7, 8],
    });
    let owner = &mut snapshot.world.action_points[0];
    owner.actions = [3, 51, 73]
        .into_iter()
        .enumerate()
        .map(|(slot, opcode)| ClassicAction {
            slot: slot as u8,
            raw_opcode: opcode,
            target_native_id: 5,
        })
        .collect();
    assert_eq!(
        super::super::economy_references::shop_program_references(&snapshot).len(),
        2
    );
    assert_eq!(
        super::super::economy_references::option_label_program_references(&snapshot).len(),
        2
    );
    for action in &mut snapshot.world.action_points[0].actions {
        action.target_native_id = -5;
    }
    let original = snapshot.clone();
    let session = EditorSession::new(snapshot);
    assert!(
        session
            .references()
            .iter()
            .filter(|reference| reference.source.0 == "action-point:land:0:0")
            .all(|reference| {
                !matches!(
                    reference.target_kind,
                    TargetKind::Message | TargetKind::OptionLabel | TargetKind::Shop
                )
            })
    );
    assert_eq!(session.snapshot(), &original);
}

#[test]
fn sound_arguments_use_magnitude_but_resource_keys_remain_exact() {
    // misc.c:1892 requests GetResource('snd ', abs(id)), never abs(resource.id).
    let mut snapshot = ProjectSnapshot::new_authored(StableId("sound-keys".into()));
    snapshot.assets.push(sound_asset(-33));
    for argument in [33, -33] {
        let reference = sound_use(&snapshot, argument);
        assert_eq!(reference.resolution, ResolutionState::StockFallback);
        assert_ne!(reference.target_id, "sound:-33");
    }
    snapshot.assets.push(sound_asset(33));
    let original = snapshot.clone();
    for argument in [33, -33] {
        let reference = sound_use(&snapshot, argument);
        assert_eq!(reference.resolution, ResolutionState::Resolved);
        assert_eq!(reference.target_id, "sound:33");
    }
    assert_eq!(snapshot, original);
}

fn sound_use(snapshot: &ProjectSnapshot, argument: i16) -> crate::references::ReferenceDescriptor {
    super::super::reference_targets::sound_reference(
        snapshot,
        StableId("action-point:land:0:0".into()),
        "actions[0].target".into(),
        argument,
        "Data DD",
        0,
        24,
    )
}

#[test]
fn unresolved_scenario_sound_keys_do_not_claim_a_resolved_asset_or_stock_fallback() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("sound-role".into()));
    let mut wrong = sound_asset(33);
    wrong.kind = "picture".into();
    snapshot.assets.push(wrong);
    let reference = sound_use(&snapshot, 33);
    assert_eq!(reference.resolution, ResolutionState::Missing);
    assert!(reference.stock_fallback.is_none());
    snapshot.assets.push(sound_asset(33));
    for value in [33, -33] {
        let reference = sound_use(&snapshot, value);
        assert_eq!(reference.resolution, ResolutionState::Ambiguous);
        assert!(reference.stock_fallback.is_none());
        assert_ne!(reference.target_id, "sound:33");
        snapshot.assets.reverse();
    }
}

fn sound_asset(id: i32) -> AssetDescriptor {
    serde_json::from_value(serde_json::json!({
        "identity": format!("sound:{id}"), "label": format!("Sound {id}"),
        "kind": "sound", "classicResource": {"resourceType": "snd ", "resourceId": id},
        "blob": "fixture", "byteLength": 0, "source": "Data Sounds",
    }))
    .unwrap()
}

#[test]
fn current_shop_and_negative_shop_modes_do_not_create_shop_zero_uses() {
    let mut snapshot = action_step_fixtures::placed_snapshot();
    snapshot.world.action_points[0].actions = vec![ClassicAction {
        slot: 0,
        raw_opcode: 51,
        target_native_id: 5,
    }];
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(5),
        values: [0; 5],
    });
    for (shop, expected) in [(0, None), (-33, None), (33, Some("33"))] {
        snapshot.extra_codes[0].values[0] = shop;
        let references = super::super::economy_references::shop_program_references(&snapshot);
        assert_eq!(
            references
                .first()
                .map(|reference| reference.target_id.as_str()),
            expected
        );
    }
}
