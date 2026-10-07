use super::super::{ResourceEntry, parse_resource_entries, write_resource_fork};
use super::*;
use crate::model::{AssetDescriptor, BlobId, ClassicResourceKey};
use std::collections::BTreeMap;

fn icon(blob: &str, bytes: usize) -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId("icon:30126".into()),
        label: "Ashen Gate Sigil With A Very Long Corpus Name".into(),
        kind: "icon".into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: i32::from(SCENARIO_ICON_DEFAULT_ID),
        }),
        scenario_music_slot: None,
        blob: BlobId(format!("sha256:{}", "a".repeat(64))),
        byte_length: 16,
        classic_payload_blob: Some(BlobId(blob.into())),
        classic_payload_byte_length: Some(bytes as u64),
        extension: Some("png".into()),
        width: Some(SCENARIO_ICON_WIDTH),
        height: Some(SCENARIO_ICON_HEIGHT),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: "controlled RGBA fixture".into(),
    }
}

#[test]
fn no_edit_resource_merge_preserves_the_container_byte_for_byte() {
    let payload = vec![1, 2, 3, 4];
    let source = write_resource_fork(&[ResourceEntry {
        resource_type: *b"cicn",
        id: SCENARIO_ICON_DEFAULT_ID,
        name: "Ashen Gate Sigil With A Very Long Corpus Name".into(),
        attributes: 0,
        data: payload.clone(),
    }])
    .unwrap();
    let blob = format!("sha256:{}", "b".repeat(64));
    let output = compile_scenario_icon_resource_fork(
        &[icon(&blob, payload.len())],
        &BTreeMap::from([(blob, payload)]),
        Some(&source),
    )
    .unwrap();
    assert_eq!(output, source);
}

#[test]
fn edited_icon_preserves_other_resource_families_and_negative_cicn() {
    let source = mixed_resource_fork();
    let blob = format!("sha256:{}", "c".repeat(64));
    let mut authored = icon(&blob, 3);
    authored.label = "Tremordred Skull Shield — vNext Certified Inverse".into();
    let output = compile_scenario_icon_resource_fork(
        &[authored],
        &BTreeMap::from([(blob, vec![4, 5, 6])]),
        Some(&source),
    )
    .unwrap();
    let entries = parse_resource_entries(&output).unwrap();
    assert!(
        entries
            .iter()
            .any(|entry| entry.resource_type == *b"PICT" && entry.data == [1])
    );
    assert!(
        entries
            .iter()
            .any(|entry| entry.resource_type == *b"snd " && entry.data == [2])
    );
    assert!(
        entries
            .iter()
            .any(|entry| entry.resource_type == *b"cicn" && entry.id == -1 && entry.data == [3])
    );
    let edited = entries
        .iter()
        .find(|entry| entry.resource_type == *b"cicn" && entry.id == SCENARIO_ICON_DEFAULT_ID)
        .unwrap();
    assert_eq!(
        edited.name,
        "Tremordred Skull Shield — vNext Certified Inverse"
    );
    assert_eq!(edited.attributes, 5);
    assert_eq!(edited.data, [4, 5, 6]);
}

#[test]
fn duplicate_icon_ids_are_rejected_before_resource_assembly() {
    let blob = format!("sha256:{}", "d".repeat(64));
    let mut duplicate = icon(&blob, 3);
    duplicate.identity = StableId("icon:duplicate".into());
    let error = compile_scenario_icon_resource_fork(
        &[icon(&blob, 3), duplicate],
        &BTreeMap::from([(blob, vec![4, 5, 6])]),
        None,
    )
    .unwrap_err();
    assert_eq!(error, ScenarioIconCodecError::DuplicateResourceId(30_126));
}

fn mixed_resource_fork() -> Vec<u8> {
    write_resource_fork(&[
        ResourceEntry {
            resource_type: *b"PICT",
            id: 30_000,
            name: "Picture".into(),
            attributes: 1,
            data: vec![1],
        },
        ResourceEntry {
            resource_type: *b"snd ",
            id: 200,
            name: "Sound".into(),
            attributes: 2,
            data: vec![2],
        },
        ResourceEntry {
            resource_type: *b"cicn",
            id: -1,
            name: "Special land".into(),
            attributes: 3,
            data: vec![3],
        },
        ResourceEntry {
            resource_type: *b"cicn",
            id: SCENARIO_ICON_DEFAULT_ID,
            name: "Old icon name".into(),
            attributes: 5,
            data: vec![4],
        },
    ])
    .unwrap()
}
