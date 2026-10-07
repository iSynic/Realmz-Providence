use super::*;

#[test]
fn certified_shop_suffix_is_never_reused_as_an_authoring_slot() {
    assert_shop_suffix_guard(
        "destroy-shop-tail-guard",
        "a5980db21b901800a9ef71c26d02e9d8a3c8c9cede7095f17ceb5742e2a27dc6",
        21,
    );
    assert_shop_suffix_guard(
        "griloch-shop-tail-guard",
        "9edc86d34039c26e4acae19a791c1e2eabe383345c7b05e353f62b726e657b8e",
        30,
    );
    assert_shop_suffix_guard(
        "trouble-shop-tail-guard",
        "1df7b58bb3f21383e62b6abc62216ef0cc8530cf409fe1b79a522eef1af28568",
        22,
    );
}

fn assert_shop_suffix_guard(project_id: &str, digest: &str, first_suffix_row: u32) {
    let mut snapshot = ProjectSnapshot::new_authored(StableId(project_id.into()));
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data SD".into(),
        blob: BlobId(digest.into()),
        byte_length: 114_076,
    });
    let mut session = EditorSession::new(snapshot);
    let error = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateShop {
                native_id: NativeRecordId(first_suffix_row),
            },
        })
        .expect_err("certified suffix cannot become a shop row");
    assert!(
        error
            .to_string()
            .contains("preserved compatibility payload")
    );
    assert_eq!(session.revision(), Revision(0));
    assert!(session.snapshot().shops.is_empty());
}

#[test]
fn certified_treasure_suffix_is_never_reused_as_an_authoring_slot() {
    let mut snapshot =
        ProjectSnapshot::new_authored(StableId("griloch-treasure-tail-guard".into()));
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data TD".into(),
        blob: BlobId("f69b43b524fb211e4f60f8bce858a45e96994b463de1c532b70376800da1fa72".into()),
        byte_length: 3_888,
    });
    let mut session = EditorSession::new(snapshot);
    let error = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateTreasure {
                native_id: NativeRecordId(80),
            },
        })
        .expect_err("certified Griloch suffix cannot become a treasure row");
    assert!(
        error
            .to_string()
            .contains("preserved compatibility payload")
    );
    assert_eq!(session.revision(), Revision(0));
    assert!(session.snapshot().treasures.is_empty());
}

#[test]
fn treasure_item_and_opcode_references_are_typed_repairable_and_byte_provenanced() {
    let snapshot = snapshot_with_treasure_links();
    let mut session = EditorSession::new(snapshot);
    let item = session
        .references()
        .into_iter()
        .find(|reference| reference.source.0 == "treasure:2")
        .unwrap();
    assert_eq!(item.target_kind, TargetKind::Item);
    assert_eq!(item.field.0, "itemIds[3]");
    assert_eq!(item.resolution, ResolutionState::Missing);
    let provenance = item.byte_provenance.unwrap();
    assert_eq!(provenance.native_path, "Data TD");
    assert_eq!(
        provenance.byte_start,
        (2 * TREASURE_RECORD_BYTES + 6) as u32
    );
    let target = session
        .references()
        .into_iter()
        .find(|reference| reference.source.0 == "extra-action-point:1")
        .unwrap();
    assert_eq!(target.target_kind, TargetKind::Treasure);
    assert_eq!(target.resolution, ResolutionState::Resolved);

    let delta = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetTreasureItem {
                source: StableId("treasure:2".into()),
                slot: 3,
                target_id: 8,
            },
        })
        .unwrap();
    assert_eq!(delta.changed_entities, [StableId("treasure:2".into())]);
    assert_eq!(session.snapshot().treasures[0].item_ids[3], 8);
    assert!(session.snapshot().treasures[0].authored);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot().treasures[0].item_ids[3], 7);
}

#[test]
fn shop_stock_and_program_references_are_typed_bounded_and_byte_provenanced() {
    let snapshot = snapshot_with_shop_links();
    let mut session = EditorSession::new(snapshot);

    assert_shop_link_provenance(&session);
    let delta = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetShopItem {
                source: StableId("shop:2".into()),
                slot: 0,
                target_id: 8,
            },
        })
        .unwrap();
    assert_eq!(delta.changed_entities, [StableId("shop:2".into())]);
    assert_eq!(session.snapshot().shops[0].item_ids[0], 8);
    assert!(session.snapshot().shops[0].authored);
    let rejected = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::RetargetShopItem {
                source: StableId("shop:2".into()),
                slot: 0,
                target_id: 16_236,
            },
        })
        .expect_err("shop repair cannot preserve an out-of-range item");
    assert!(matches!(
        rejected,
        SessionError::InvalidShopReference { .. }
    ));
    assert_eq!(session.revision(), Revision(1));
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot().shops[0].item_ids[0], 7);
}

#[test]
fn treasure_create_clear_and_history_preserve_identity_and_defaults() {
    let mut session = EditorSession::new(snapshot_with_treasure_links());
    let created = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateTreasure {
                native_id: NativeRecordId(0),
            },
        })
        .expect("create first free Treasure record");
    assert_eq!(created.changed_entities, [StableId("treasure:0".into())]);
    let fresh = &session.snapshot().treasures[0];
    assert_eq!(fresh.item_ids, vec![0; TREASURE_ITEM_SLOTS]);
    assert_eq!(
        (fresh.experience, fresh.gold, fresh.gems, fresh.jewelry),
        (0, 0, 0, 0)
    );
    assert!(fresh.authored);

    let cleared = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::ClearTreasure {
                native_id: NativeRecordId(2),
            },
        })
        .expect("clear existing Treasure record");
    assert_eq!(cleared.changed_entities, [StableId("treasure:2".into())]);
    let cleared_record = &session.snapshot().treasures[1];
    assert_eq!(cleared_record.identity, StableId("treasure:2".into()));
    assert_eq!(cleared_record.gold, 0);
    assert_eq!(cleared_record.item_ids, vec![0; TREASURE_ITEM_SLOTS]);
    assert!(session.references().iter().any(|reference| {
        reference.target_kind == TargetKind::Treasure && reference.target_id == "2"
    }));

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Undo,
        })
        .expect("undo Treasure clear");
    assert_eq!(session.snapshot().treasures[1].gold, 12);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(3),
            command: EditorCommand::Undo,
        })
        .expect("undo Treasure create");
    assert_eq!(session.snapshot().treasures.len(), 1);
}

#[test]
fn shop_create_clear_and_id_validation_are_revision_safe() {
    let mut session = EditorSession::new(snapshot_with_shop_links());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateShop {
                native_id: NativeRecordId(0),
            },
        })
        .expect("create first free Shop record");
    let fresh = &session.snapshot().shops[0];
    assert_eq!(fresh.item_ids, vec![0; SHOP_ITEM_SLOTS]);
    assert_eq!(fresh.quantities, vec![0; SHOP_ITEM_SLOTS]);
    assert_eq!(fresh.inflation, 0);
    assert!(fresh.authored);

    let duplicate = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::CreateShop {
                native_id: NativeRecordId(0),
            },
        })
        .expect_err("occupied Shop id must be rejected");
    assert!(matches!(duplicate, SessionError::InvalidShop { .. }));
    assert_eq!(session.revision(), Revision(1));

    let outside = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::CreateTreasure {
                native_id: NativeRecordId(i16::MAX as u32 + 1),
            },
        })
        .expect_err("out-of-range Treasure id must be rejected");
    assert!(matches!(outside, SessionError::InvalidTreasure { .. }));
    assert_eq!(session.revision(), Revision(1));

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::ClearShop {
                native_id: NativeRecordId(2),
            },
        })
        .expect("clear existing Shop record");
    let cleared = &session.snapshot().shops[1];
    assert_eq!(cleared.identity, StableId("shop:2".into()));
    assert_eq!(cleared.item_ids, vec![0; SHOP_ITEM_SLOTS]);
    assert_eq!(cleared.quantities, vec![0; SHOP_ITEM_SLOTS]);
    assert_eq!(cleared.inflation, 0);
}

fn snapshot_with_treasure_links() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("treasure-session".into()));
    let mut item_ids = vec![0; TREASURE_ITEM_SLOTS];
    item_ids[3] = 7;
    snapshot.treasures.push(TreasureRecord {
        identity: StableId("treasure:2".into()),
        native_id: NativeRecordId(2),
        item_ids,
        experience: 0,
        gold: 12,
        gems: 0,
        jewelry: 0,
        authored: false,
    });
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:1".into()),
        native_id: NativeRecordId(1),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![crate::model::ClassicAction {
            slot: 0,
            raw_opcode: 10,
            target_native_id: 2,
        }],
    });
    snapshot
}

fn snapshot_with_shop_links() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("shop-session".into()));
    let mut item_ids = vec![0; SHOP_ITEM_SLOTS];
    item_ids[0] = 7;
    item_ids[1] = -1;
    item_ids[2] = 99;
    snapshot.shops.push(ShopRecord {
        identity: StableId("shop:2".into()),
        native_id: NativeRecordId(2),
        item_ids,
        quantities: vec![0; SHOP_ITEM_SLOTS],
        inflation: 125,
        authored: false,
    });
    snapshot.extra_codes.extend([
        ExtraCodeRow {
            native_id: NativeRecordId(8),
            values: [2, 0, 0, 0, 0],
        },
        ExtraCodeRow {
            native_id: NativeRecordId(9),
            values: [-2, 0, 0, 0, 0],
        },
    ]);
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:1".into()),
        native_id: NativeRecordId(1),
        classic_door_id: 0,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: vec![
            ClassicAction {
                slot: 0,
                raw_opcode: 6,
                target_native_id: -2,
            },
            ClassicAction {
                slot: 1,
                raw_opcode: 51,
                target_native_id: 8,
            },
            ClassicAction {
                slot: 2,
                raw_opcode: 73,
                target_native_id: 9,
            },
        ],
    });
    snapshot
}

#[test]
fn excluded_shop_preserves_callers_and_cannot_be_reused_for_creation() {
    let mut snapshot = snapshot_with_shop_links();
    snapshot.shops.clear();
    snapshot.origin = crate::model::ProjectOrigin::Imported {
        compatibility_annex: BlobId("source".into()),
    };
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data SD".into(),
        blob: BlobId("source".into()),
        byte_length: (3 * SHOP_RECORD_BYTES) as u64,
    });
    let mut session = EditorSession::new(snapshot);
    let callers = session
        .references()
        .into_iter()
        .filter(|reference| reference.target_kind == TargetKind::Shop)
        .collect::<Vec<_>>();
    assert_eq!(callers.len(), 3);
    assert!(
        callers.iter().all(|reference| reference.target_id == "2"
            && reference.resolution == ResolutionState::Missing)
    );
    assert_eq!(
        session
            .diagnostics()
            .iter()
            .filter(|finding| finding.code == "reference.shop.missing")
            .count(),
        3
    );
    assert_eq!(
        session
            .diagnostics()
            .iter()
            .filter(|finding| finding.code == "source.shop-records.quarantined")
            .count(),
        1
    );
    let before = session.snapshot().clone();
    assert!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(0),
                command: EditorCommand::CreateShop {
                    native_id: NativeRecordId(2)
                }
            })
            .is_err()
    );
    assert_eq!(session.snapshot(), &before);
}

fn assert_shop_link_provenance(session: &EditorSession) {
    let references = session.references();
    let stock = references
        .iter()
        .filter(|reference| reference.source.0 == "shop:2")
        .collect::<Vec<_>>();
    assert_eq!(
        stock.len(),
        1,
        "negative terminator hides later category slots"
    );
    assert_eq!(stock[0].field.0, "itemIds[0]");
    assert_eq!(stock[0].target_kind, TargetKind::Item);
    assert_eq!(stock[0].resolution, ResolutionState::Missing);
    assert_eq!(
        stock[0].byte_provenance,
        Some(ByteProvenance {
            native_path: "Data SD".into(),
            record_index: 2,
            byte_start: (2 * SHOP_RECORD_BYTES) as u32,
            byte_end: (2 * SHOP_RECORD_BYTES + 2) as u32,
        })
    );
    let shop_targets = references
        .iter()
        .filter(|reference| reference.target_kind == TargetKind::Shop)
        .collect::<Vec<_>>();
    assert_eq!(shop_targets.len(), 3);
    assert!(shop_targets.iter().all(|reference| {
        reference.target_id == "2" && reference.resolution == ResolutionState::Resolved
    }));
    assert!(shop_targets.iter().any(|reference| {
        reference.field.0 == "actions[1].extraCode.shop"
            && reference
                .byte_provenance
                .as_ref()
                .is_some_and(|provenance| {
                    provenance.native_path == "Data EDCD"
                        && provenance.byte_start
                            == 8 * crate::codecs::EXTRA_CODE_RECORD_BYTES as u32
                })
    }));
}
