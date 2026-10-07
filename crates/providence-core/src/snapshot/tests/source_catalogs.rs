use super::super::*;
use crate::model::{NativeRecordId, StableId};

#[test]
fn version_eleven_preserves_classic_sources_and_invents_no_extra_action_points() {
    let mut current = ProjectSnapshot::new_authored(StableId("v11".into()));
    current
        .classic_sources
        .push(crate::model::ClassicSourceBlob {
            native_path: "Data SD2".into(),
            blob: crate::model::BlobId(format!("sha256:{}", "a".repeat(64))),
            byte_length: 256,
        });
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(11));
    object.remove("extraActionPoints");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v11");

    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert_eq!(migrated.classic_sources.len(), 1);
    assert!(migrated.extra_action_points.is_empty());
}

#[test]
fn version_twelve_preserves_extra_action_points_and_adds_no_picture_payload_claim() {
    let mut current = ProjectSnapshot::new_authored(StableId("v12".into()));
    current
        .extra_action_points
        .push(crate::model::ExtraActionPoint {
            identity: StableId("extra-action-point:1".into()),
            native_id: NativeRecordId(1),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: Vec::new(),
        });
    current.assets.push(crate::model::AssetDescriptor {
        identity: StableId("legacy-picture".into()),
        label: "Legacy picture".into(),
        kind: "picture".into(),
        mime_type: Some("image/png".into()),
        classic_resource: None,
        scenario_music_slot: None,
        blob: crate::model::BlobId(format!("sha256:{}", "a".repeat(64))),
        byte_length: 4,
        classic_payload_blob: None,
        classic_payload_byte_length: None,
        extension: Some("png".into()),
        width: Some(1),
        height: Some(1),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: "legacy asset".into(),
    });
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(12));
    object["assets"][0]
        .as_object_mut()
        .unwrap()
        .remove("classicPayloadBlob");
    object["assets"][0]
        .as_object_mut()
        .unwrap()
        .remove("classicPayloadByteLength");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v12");

    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert_eq!(migrated.extra_action_points.len(), 1);
    assert!(migrated.assets[0].classic_payload_blob.is_none());
    assert!(migrated.assets[0].classic_payload_byte_length.is_none());
}

#[test]
fn version_thirteen_invents_no_monster_catalog() {
    let current = ProjectSnapshot::new_authored(StableId("v13".into()));
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(13));
    object.remove("monsterSets");
    object.remove("monsterDescriptions");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v13");

    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert!(migrated.monster_sets.is_empty());
    assert!(migrated.monster_descriptions.is_empty());
}

#[test]
fn version_fourteen_preserves_monsters_and_invents_no_battles() {
    let mut current = ProjectSnapshot::new_authored(StableId("v14".into()));
    current.monster_sets.push(crate::model::MonsterSet {
        set_id: 0,
        native_path: "Data MD".into(),
        monsters: Vec::new(),
    });
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(14));
    object.remove("battles");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v14");

    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert_eq!(migrated.monster_sets.len(), 1);
    assert!(migrated.battles.is_empty());
}

#[test]
fn version_fifteen_preserves_battles_and_invents_no_complex_encounters() {
    let mut current = ProjectSnapshot::new_authored(StableId("v15".into()));
    current.battles.push(crate::model::BattleRecord {
        identity: StableId("battle:0".into()),
        native_id: NativeRecordId(0),
        grid: vec![0; crate::codecs::BATTLE_GRID_SLOTS],
        distance: 3,
        message_before: 0,
        message_after: 0,
        battle_macro: 0,
        authored: true,
    });
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(15));
    object.remove("complexEncounters");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v15");

    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert_eq!(migrated.battles.len(), 1);
    assert!(migrated.complex_encounters.is_empty());
}

#[test]
fn version_sixteen_preserves_complex_encounters_and_invents_no_rogue_encounters() {
    let mut current = ProjectSnapshot::new_authored(StableId("v16".into()));
    let mut complex = crate::codecs::decode_complex_encounters(&vec![
        0;
        crate::codecs::COMPLEX_ENCOUNTER_RECORD_BYTES
    ])
    .records
    .remove(0);
    complex.authored = true;
    current.complex_encounters.push(complex);
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(16));
    object.remove("rogueEncounters");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v16");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert_eq!(migrated.complex_encounters.len(), 1);
    assert!(migrated.rogue_encounters.is_empty());
}

#[test]
fn version_seventeen_preserves_rogue_encounters_and_invents_no_timed_encounters() {
    let mut current = ProjectSnapshot::new_authored(StableId("v17".into()));
    let mut rogue =
        crate::codecs::decode_rogue_encounters(&[0; crate::codecs::ROGUE_ENCOUNTER_RECORD_BYTES])
            .records
            .remove(0);
    rogue.authored = true;
    current.rogue_encounters.push(rogue);
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(17));
    object.remove("timedEncounters");
    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v17");
    assert_eq!(migrated.rogue_encounters.len(), 1);
    assert!(migrated.timed_encounters.is_empty());
}

#[test]
fn version_eighteen_preserves_timed_encounters_and_invents_no_spells() {
    let mut current = ProjectSnapshot::new_authored(StableId("v18".into()));
    let mut timed =
        crate::codecs::decode_timed_encounters(&[0; crate::codecs::TIMED_ENCOUNTER_RECORD_BYTES])
            .records
            .remove(0);
    timed.authored = true;
    current.timed_encounters.push(timed);
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    let object = value.as_object_mut().expect("snapshot object");
    object.insert("formatVersion".into(), serde_json::json!(18));
    object.remove("scenarioSpells");

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v18");
    assert_eq!(migrated.format_version, SNAPSHOT_FORMAT_VERSION);
    assert_eq!(migrated.timed_encounters.len(), 1);
    assert!(migrated.scenario_spells.is_empty());
}
