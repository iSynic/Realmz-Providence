use super::*;
use crate::model::{ProjectSnapshot, StableId};
use crate::{
    codecs::{MONSTER_RECORD_BYTES, decode_monster_set},
    model::{BlobId, ExtraActionPoint, MonsterDescription, NativeRecordId, ProjectOrigin},
};
use std::collections::BTreeSet;

fn catalog_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("monster-catalog".into()));
    let mut normal = decode_monster_set(&vec![0; MONSTER_RECORD_BYTES * 2], "Data MD", 0);
    let monster = &mut normal.monsters[1];
    monster.display_name = "Ash Drake".into();
    monster.name_id = 42;
    monster.traitor = -1;
    monster.attack_count = 1;
    monster.attacks[0] = vec![2, 8, 11, -4];
    monster.spells[0] = 1201;
    monster.spells[2] = 1100;
    monster.items[0] = -12;
    monster.items[2] = 800;
    monster.weapon = -2;
    monster.magic_to_hit = 7;
    monster.death_macro = -6;
    snapshot.monster_sets.push(normal);
    let mut mega = decode_monster_set(&vec![0; MONSTER_RECORD_BYTES], "Data MD-1", -1);
    mega.monsters[0].display_name.clear();
    snapshot.monster_sets.push(mega);
    snapshot.monster_descriptions.push(MonsterDescription {
        identity: StableId("monster-description:1".into()),
        native_id: NativeRecordId(1),
        text: "A cinder-winged sentinel.".into(),
        authored: true,
    });
    snapshot.extra_action_points.push(ExtraActionPoint {
        identity: StableId("extra-action-point:6".into()),
        native_id: NativeRecordId(6),
        classic_door_id: 6,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions: Vec::new(),
    });
    snapshot
}

#[test]
fn selection_keeps_distinct_preflight_error_order() {
    let mut snapshot = catalog_snapshot();
    snapshot.monster_sets.retain(|set| set.set_id == 0);
    snapshot.monster_descriptions[0].identity = StableId("invalid-description".into());
    snapshot.monster_sets[0].native_path = "invalid-set".into();
    let selected = BTreeSet::from([1]);
    assert_eq!(
        project_rebuilt_v3_normal_monsters_by_classic_ids(&snapshot, &selected),
        Err(RebuiltV3MonsterError::MissingSelectedClassicId(1))
    );
    assert!(matches!(
        project_rebuilt_v3_monsters_by_classic_ids(&snapshot, &selected),
        Err(RebuiltV3MonsterError::InvalidDescriptionIdentity { .. })
    ));
    snapshot.monster_descriptions[0].identity = StableId("monster-description:1".into());
    assert_eq!(
        project_rebuilt_v3_monsters_by_classic_ids(&snapshot, &selected),
        Err(RebuiltV3MonsterError::InvalidSet {
            set_id: 0,
            native_path: "invalid-set".into()
        })
    );
}

#[test]
fn projection_preserves_fixed_slots_signs_and_descriptions() {
    let snapshot = catalog_snapshot();
    let projection = project_rebuilt_v3_monster_catalog(&snapshot).expect("projection");
    let encoded = serde_json::to_string(&projection).expect("serialize");
    assert_eq!(
        encoded,
        serde_json::to_string(&project_rebuilt_v3_monster_catalog(&snapshot).unwrap()).unwrap()
    );
    assert_eq!(projection.monsters[1].id.0, "classic.monster.1");
    assert_eq!(projection.monsters[1].classic_name_id, 42);
    assert_eq!(
        projection.monsters[1].description,
        "A cinder-winged sentinel."
    );
    assert!(projection.monsters[1].traitor);
    assert_eq!(projection.monsters[1].attacks[0].special, -4);
    assert_eq!(projection.monsters[1].spell_ids.len(), 10);
    assert_eq!(projection.monsters[1].spell_ids[0], "classic.spell.1201");
    assert_eq!(projection.monsters[1].spell_ids[2], "");
    assert_eq!(projection.monsters[1].item_ids.len(), 6);
    assert_eq!(projection.monsters[1].item_ids[0], "classic.item.12");
    assert_eq!(projection.monsters[1].item_ids[2], "classic.item.800");
    assert_eq!(projection.monsters[1].weapon_id, "");
    assert_eq!(projection.monsters[1].random_weapon_table, 2);
    assert_eq!(projection.monsters[1].death_macro, -6);
    let value = serde_json::to_value(&projection).expect("schema shape");
    assert_eq!(value["monsters"][1]["classicNameId"], 42);
    assert_eq!(value["monsters"][1]["movementMaximum"], 0);
    assert!(value["monsters"][1].get("movementMax").is_none());
    assert_eq!(projection.monster_sets[0].set_id, -1);
    assert_eq!(projection.monster_sets[0].name, "Mega Monsters");
    assert_eq!(
        projection.monster_sets[0].monsters[0].id.0,
        "classic.monster-set.-1.0"
    );
    assert_eq!(projection.monster_sets[0].monsters[0].name, "Monster 0");
    assert!(
        projection.monster_sets[0].monsters[0]
            .description
            .is_empty()
    );
    let reopened: RebuiltV3MonsterCatalog = serde_json::from_str(&encoded).expect("reimport");
    assert_eq!(reopened, projection);
}

#[test]
fn imported_selected_projection_preserves_raw_attack_count_without_relaxing_authored_rules() {
    let mut snapshot = catalog_snapshot();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    snapshot.monster_sets[1] =
        decode_monster_set(&vec![0; MONSTER_RECORD_BYTES * 2], "Data MD-1", -1);
    for set in &mut snapshot.monster_sets {
        set.monsters[1].attack_count = -7;
    }

    let selection = project_rebuilt_v3_monsters_by_classic_ids(&snapshot, &BTreeSet::from([1]))
        .expect("imported raw attack count remains package data");
    assert_eq!(selection.monsters[0].attack_count, -7);
    assert_eq!(selection.monster_sets[0].monsters[0].attack_count, -7);

    snapshot.origin = ProjectOrigin::Authored;
    assert!(matches!(
        project_rebuilt_v3_monsters_by_classic_ids(&snapshot, &BTreeSet::from([1])),
        Err(RebuiltV3MonsterError::InvalidRecord { .. })
    ));
}

#[test]
fn imported_v4_monsters_preserve_signed_native_values_without_widening_v3() {
    let mut snapshot = catalog_snapshot();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    snapshot.monster_sets[0].monsters[1].magic_to_hit = i8::MIN;
    snapshot.monster_sets[0].monsters[1].weapon = i16::MIN;

    let v4 = project_rebuilt_v4_imported_monster_catalog(&snapshot)
        .expect("v4 accepts imported values representable by Classic storage");
    assert_eq!(v4.monsters[1].magic_to_hit, i8::MIN);
    assert_eq!(v4.monsters[1].random_weapon_table, 32_768);
    assert!(project_rebuilt_v3_monster_catalog(&snapshot).is_err());

    snapshot.origin = ProjectOrigin::Authored;
    assert!(project_rebuilt_v4_imported_monster_catalog(&snapshot).is_err());
}

#[test]
fn imported_selected_projection_preserves_out_of_catalog_monster_item_ids() {
    let mut snapshot = catalog_snapshot();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    snapshot.monster_sets[0].monsters[0].items[0] = 1139;
    snapshot.monster_sets[1].monsters[0].items[0] = 1139;
    snapshot.monster_sets[0].monsters[0].weapon = 1139;
    snapshot.monster_sets[1].monsters[0].weapon = 1139;

    let selection = project_rebuilt_v3_monsters_by_classic_ids(&snapshot, &BTreeSet::from([0]))
        .expect("imported raw item references remain package data");
    assert_eq!(selection.monsters[0].item_ids[0], "classic.item.1139");
    assert_eq!(selection.monsters[0].weapon_id, "classic.item.1139");
    assert_eq!(
        selection.monster_sets[0].monsters[0].item_ids[0],
        "classic.item.1139"
    );
    assert_eq!(
        selection.monster_sets[0].monsters[0].weapon_id,
        "classic.item.1139"
    );

    snapshot.origin = ProjectOrigin::Authored;
    assert!(matches!(
        project_rebuilt_v3_monsters_by_classic_ids(&snapshot, &BTreeSet::from([0])),
        Err(RebuiltV3MonsterError::InvalidRecord { .. })
    ));
}

#[test]
fn imported_selected_projection_keeps_missing_monster_ids_for_battle_references() {
    let mut snapshot = catalog_snapshot();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    snapshot.monster_sets[0].monsters.clear();
    snapshot.monster_sets[1].monsters.clear();

    let selection = project_rebuilt_v3_monsters_by_classic_ids(&snapshot, &BTreeSet::from([7]))
        .expect("missing imported reference is deferred to encounter use");
    assert!(selection.monsters.is_empty());
    assert!(
        selection
            .monster_sets
            .iter()
            .all(|set| set.monsters.is_empty())
    );

    snapshot.origin = ProjectOrigin::Authored;
    assert!(matches!(
        project_rebuilt_v3_monsters_by_classic_ids(&snapshot, &BTreeSet::from([7])),
        Err(RebuiltV3MonsterError::MissingSelectedClassicId(7))
    ));
}

#[test]
fn package_projection_names_only_unrepresentable_imported_rows() {
    let mut snapshot = catalog_snapshot();
    snapshot.monster_sets[1] =
        decode_monster_set(&vec![0; MONSTER_RECORD_BYTES * 2], "Data MD-1", -1);
    snapshot.monster_sets[0].monsters[0].attack_count = 88;
    snapshot.monster_sets[1].monsters[0].attack_count = 88;

    let (catalog, omissions) =
        project_rebuilt_v3_package_monster_catalog(&snapshot, &BTreeSet::new())
            .expect("unreferenced imported rows");
    assert_eq!(catalog.monsters.len(), 1);
    assert_eq!(catalog.monster_sets.len(), 1);
    assert_eq!(catalog.monster_sets[0].monsters.len(), 1);
    assert_eq!(omissions.len(), 2);
    assert_eq!(omissions[0].native_path, "Data MD-1");
    assert_eq!(omissions[1].native_path, "Data MD");
    assert_eq!(snapshot.monster_sets[0].monsters.len(), 2);
    assert!(project_rebuilt_v3_monster_catalog(&snapshot).is_err());

    assert!(matches!(
        project_rebuilt_v3_package_monster_catalog(&snapshot, &BTreeSet::from([0])),
        Err(RebuiltV3MonsterError::InvalidRecord { .. })
    ));
    snapshot.monster_sets[0].monsters[0].authored = true;
    assert!(matches!(
        project_rebuilt_v3_package_monster_catalog(&snapshot, &BTreeSet::new()),
        Err(RebuiltV3MonsterError::InvalidRecord { .. })
    ));
}

#[test]
fn package_set_alignment_quarantines_an_unreferenced_missing_counterpart() {
    let snapshot = catalog_snapshot();
    let (catalog, omissions) =
        project_rebuilt_v3_package_monster_catalog(&snapshot, &BTreeSet::new())
            .expect("unreferenced incomplete set row is quarantined");
    assert_eq!(catalog.monsters.len(), 1);
    assert_eq!(catalog.monster_sets[0].monsters.len(), 1);
    assert_eq!(omissions.len(), 1);
    assert_eq!(omissions[0].set_id, 0);
    assert_eq!(omissions[0].native_id, 1);
    assert!(omissions[0].reason.contains("counterpart"));

    assert!(matches!(
        project_rebuilt_v3_package_monster_catalog(&snapshot, &BTreeSet::from([1])),
        Err(RebuiltV3MonsterError::IncompleteSetCoverage {
            set_id: 0,
            classic_id: 1
        })
    ));

    let mut complete = snapshot;
    complete.monster_sets[1] =
        decode_monster_set(&vec![0; MONSTER_RECORD_BYTES * 2], "Data MD-1", -1);
    complete.monster_sets[0].monsters[1].attack_count = 88;
    let (catalog, omissions) =
        project_rebuilt_v3_package_monster_catalog(&complete, &BTreeSet::new())
            .expect("physically present but unprojectable counterpart");
    assert_eq!(catalog.monsters.len(), 1);
    assert_eq!(catalog.monster_sets[0].monsters.len(), 1);
    assert_eq!(omissions.len(), 2);
    assert_eq!(omissions[0].native_path, "Data MD");
    assert_eq!(omissions[1].native_path, "Data MD-1");
    assert!(omissions[1].reason.contains("counterpart"));
}

#[test]
fn projection_rejects_dropped_or_runtime_invalid_content() {
    let mut snapshot = catalog_snapshot();
    snapshot.extra_action_points.clear();
    assert!(matches!(
        project_rebuilt_v3_monster_catalog(&snapshot),
        Err(RebuiltV3MonsterError::MissingDeathMacro { macro_id: 6, .. })
    ));

    let mut imported = catalog_snapshot();
    imported.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    imported.extra_action_points.clear();
    imported.monster_sets[0].monsters[0].death_macro = 6;
    imported.monster_sets[1].monsters[0].death_macro = 6;
    let selected = project_rebuilt_v3_monsters_by_classic_ids(&imported, &BTreeSet::from([0]))
        .expect("imported death macro operands remain in selected runtime monsters");
    assert_eq!(selected.monsters[0].death_macro, 6);
    assert_eq!(selected.monster_sets[0].monsters[0].death_macro, 6);
    let (packaged, omissions) =
        project_rebuilt_v3_package_monster_catalog(&imported, &BTreeSet::from([0]))
            .expect("imported death macro operands remain in the final package catalog");
    assert_eq!(packaged.monsters[0].death_macro, 6);
    assert_eq!(packaged.monster_sets[0].monsters[0].death_macro, 6);
    assert!(omissions.iter().all(|row| row.native_id != 0));

    let mut snapshot = catalog_snapshot();
    snapshot.monster_descriptions[0].native_id = NativeRecordId(9);
    snapshot.monster_descriptions[0].identity = StableId("monster-description:9".into());
    let projection = project_rebuilt_v3_monster_catalog(&snapshot).expect("orphan preserved");
    assert_eq!(projection.monster_descriptions[0].id, 9);
    assert_eq!(
        projection.monster_descriptions[0].text,
        "A cinder-winged sentinel."
    );

    let mut snapshot = catalog_snapshot();
    snapshot.monster_sets[0].monsters[1].magic_to_hit = -1;
    assert!(matches!(
        project_rebuilt_v3_monster_catalog(&snapshot),
        Err(RebuiltV3MonsterError::InvalidRecord { .. })
    ));

    let mut snapshot = catalog_snapshot();
    snapshot.monster_sets.push(snapshot.monster_sets[0].clone());
    assert_eq!(
        project_rebuilt_v3_monster_catalog(&snapshot),
        Err(RebuiltV3MonsterError::DuplicateSet(0))
    );

    let mut snapshot = catalog_snapshot();
    snapshot
        .monster_descriptions
        .push(snapshot.monster_descriptions[0].clone());
    assert_eq!(
        project_rebuilt_v3_monster_catalog(&snapshot),
        Err(RebuiltV3MonsterError::DuplicateDescription(1))
    );
}

#[test]
fn selected_normal_projection_validates_only_the_requested_runtime_rows() {
    let mut snapshot = catalog_snapshot();
    snapshot.monster_sets[0].monsters[0].magic_to_hit = -1;
    let selection =
        project_rebuilt_v3_normal_monsters_by_classic_ids(&snapshot, &BTreeSet::from([1]))
            .expect("unselected invalid row remains outside the projection");
    assert_eq!(selection.monsters.len(), 1);
    assert_eq!(selection.monsters[0].classic_id, 1);
    assert_eq!(selection.monster_descriptions.len(), 1);
    assert_eq!(selection.monster_descriptions[0].id, 1);
    assert!(project_rebuilt_v3_monster_catalog(&snapshot).is_err());

    assert_eq!(
        project_rebuilt_v3_normal_monsters_by_classic_ids(&snapshot, &BTreeSet::from([99])),
        Err(RebuiltV3MonsterError::MissingSelectedClassicId(99))
    );

    let duplicate = snapshot.monster_sets[0].monsters[1].clone();
    snapshot.monster_sets[0].monsters.push(duplicate);
    assert_eq!(
        project_rebuilt_v3_normal_monsters_by_classic_ids(&snapshot, &BTreeSet::from([1])),
        Err(RebuiltV3MonsterError::DuplicateClassicId {
            set_id: 0,
            classic_id: 1,
        })
    );
}
