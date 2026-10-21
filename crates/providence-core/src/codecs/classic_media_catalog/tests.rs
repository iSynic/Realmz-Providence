use super::*;
use crate::codecs::{
    ResourceEntry, compile_scenario_icon_resource_fork, encode_scenario_icon_cicn,
    encode_scenario_picture_pict, encode_scenario_sound_snd,
    parse_resource_entries_preserving_duplicates, write_resource_fork_preserving_duplicates,
};
use crate::model::{AssetDescriptor, BlobId, StableId};

#[test]
fn catalog_derivation_is_deterministic_and_keeps_native_and_runtime_payloads_separate() {
    let rgba = vec![255; 32 * 32 * 4];
    let pict = encode_scenario_picture_pict(&rgba, 32, 32, false).unwrap();
    let cicn = encode_scenario_icon_cicn(&rgba, 32, 32).unwrap();
    let snd = encode_scenario_sound_snd(&[0, 64, 128, 255], 11_025, 1).unwrap();
    let fork = write_resource_fork_preserving_duplicates(&[
        ResourceEntry {
            resource_type: *b"snd ",
            id: 200,
            name: "Gate Opens".into(),
            attributes: 4,
            data: snd.clone(),
        },
        ResourceEntry {
            resource_type: *b"PICT",
            id: 30_000,
            name: "Moon Gate".into(),
            attributes: 0,
            data: pict.clone(),
        },
        ResourceEntry {
            resource_type: *b"cicn",
            id: -91,
            name: "Special Moon Gate".into(),
            attributes: 2,
            data: cicn.clone(),
        },
    ])
    .unwrap();

    let first = derive_classic_media_catalog(&fork).unwrap();
    let second = derive_classic_media_catalog(&fork).unwrap();
    assert_eq!(first, second);
    assert!(first.ambiguous_resources.is_empty());
    assert!(first.failures.is_empty());
    assert_eq!(first.assets.len(), 3);
    let picture = first
        .assets
        .iter()
        .find(|asset| asset.resource.resource_type == "PICT")
        .unwrap();
    assert_eq!(picture.classic_payload, pict);
    assert_eq!(&picture.runtime_payload[..8], b"\x89PNG\r\n\x1a\n");
    let icon = first
        .assets
        .iter()
        .find(|asset| asset.resource.resource_type == "cicn")
        .unwrap();
    assert_eq!(icon.kind, "special-land-tile");
    assert_eq!(icon.attributes, 2);
    let sound = first
        .assets
        .iter()
        .find(|asset| asset.resource.resource_type == "snd ")
        .unwrap();
    assert_eq!(sound.classic_payload, snd);
    assert_eq!(&sound.runtime_payload[..12], b"RIFF(\0\0\0WAVE");
    assert_eq!(sound.sample_rate, Some(11_025));
}

#[test]
fn exact_landlook_pict_geometry_gets_the_runtime_tileset_role() {
    let landlook =
        encode_scenario_picture_pict(&vec![127; 640 * 320 * 4], 640, 320, false).unwrap();
    let ordinary_picture =
        encode_scenario_picture_pict(&vec![127; 320 * 320 * 4], 320, 320, false).unwrap();
    let fork = write_resource_fork_preserving_duplicates(&[
        ResourceEntry {
            resource_type: *b"PICT",
            id: 306,
            name: "Moonlit Vale Landlook".into(),
            attributes: 0,
            data: landlook,
        },
        ResourceEntry {
            resource_type: *b"PICT",
            id: 307,
            name: "Player Map 307".into(),
            attributes: 0,
            data: ordinary_picture,
        },
    ])
    .unwrap();

    let catalog = derive_classic_media_catalog(&fork).unwrap();
    let landlook = catalog
        .assets
        .iter()
        .find(|asset| asset.resource.resource_id == 306)
        .unwrap();
    let ordinary = catalog
        .assets
        .iter()
        .find(|asset| asset.resource.resource_id == 307)
        .unwrap();
    assert_eq!(landlook.kind, "tileset");
    assert_eq!(classic_landlook_for_media_asset(landlook), Some(6));
    assert_eq!(
        classic_media_asset_identity(landlook),
        StableId("classic.landlook.6".into())
    );
    assert_eq!(ordinary.kind, "picture");
    assert_eq!(classic_landlook_for_media_asset(ordinary), None);
}

#[test]
fn shared_pict_keeps_every_pixel_instead_of_only_the_dungeon_crop() {
    let mut source = vec![255_u8; 640 * 640 * 4];
    for (x, y) in [(0, 0), (639, 639), (576, 320), (639, 383), (31, 511)] {
        let offset = (y * 640 + x) * 4;
        source[offset..offset + 4].copy_from_slice(&[12, 34, 56, 255]);
    }
    let pict = encode_scenario_picture_pict(&source, 640, 640, false).unwrap();
    let decoded = decode_classic_pict(&pict).unwrap();
    let asset = derive_asset(
        ClassicResourceKey {
            resource_type: "PICT".into(),
            resource_id: 302,
        },
        "Shared map artwork".into(),
        0,
        &pict,
    )
    .unwrap();
    assert_eq!((asset.width, asset.height), (Some(640), Some(640)));
    assert_eq!(asset.classic_payload, pict);
    assert_eq!(
        asset.runtime_payload,
        encode_runtime_rgba_png(&decoded.rgba, 640, 640).unwrap()
    );
    assert_eq!(
        classic_media_asset_identity(&asset),
        StableId("dungeon-top-down-302".into())
    );
}

#[test]
fn duplicate_native_media_selects_first_occurrence_and_retains_inventory() {
    let entries = duplicate_native_entries();
    let fork = write_resource_fork_preserving_duplicates(&entries).unwrap();
    let catalog = derive_classic_media_catalog(&fork).unwrap();
    assert_eq!(catalog.assets.len(), 1);
    assert_eq!(catalog.assets[0].label, "First");
    assert_eq!(catalog.assets[0].classic_payload, entries[0].data);
    assert_eq!(
        parse_resource_entries_preserving_duplicates(&fork).unwrap(),
        entries
    );
    assert!(catalog.failures.is_empty());
    assert_eq!(
        catalog.ambiguous_resources,
        vec![ClassicMediaAmbiguity {
            resource: ClassicResourceKey {
                resource_type: "cicn".into(),
                resource_id: 451
            },
            occurrences: 2,
        }]
    );
}

#[test]
fn undecodable_first_duplicate_does_not_fall_through_to_later_artwork() {
    let mut entries = duplicate_native_entries();
    entries[0].data = vec![0];
    let fork = write_resource_fork_preserving_duplicates(&entries).unwrap();
    let catalog = derive_classic_media_catalog(&fork).unwrap();
    assert!(catalog.assets.is_empty());
    assert_eq!(catalog.failures.len(), 1);
    assert_eq!(catalog.failures[0].label, "First");
    assert_eq!(catalog.ambiguous_resources[0].occurrences, 2);
    assert_eq!(
        parse_resource_entries_preserving_duplicates(&fork).unwrap(),
        entries
    );
}

fn duplicate_native_entries() -> Vec<ResourceEntry> {
    [255, 0]
        .into_iter()
        .enumerate()
        .map(|(index, pixel)| ResourceEntry {
            resource_type: *b"cicn",
            id: 451,
            name: if index == 0 { "First" } else { "Second" }.into(),
            attributes: 0,
            data: encode_scenario_icon_cicn(&vec![pixel; 32 * 32 * 4], 32, 32).unwrap(),
        })
        .collect()
}

#[test]
fn appearance_ids_receive_reference_compatible_kinds() {
    let rgba = vec![255; 32 * 32 * 4];
    let cicn = encode_scenario_icon_cicn(&rgba, 32, 32).unwrap();
    let fork = write_resource_fork_preserving_duplicates(&[
        ResourceEntry {
            resource_type: *b"cicn",
            id: 257,
            name: String::new(),
            attributes: 0,
            data: cicn.clone(),
        },
        ResourceEntry {
            resource_type: *b"cicn",
            id: 9000,
            name: String::new(),
            attributes: 0,
            data: cicn,
        },
    ])
    .unwrap();

    let catalog = derive_classic_media_catalog(&fork).unwrap();
    assert_eq!(catalog.assets[0].kind, "portrait");
    assert_eq!(catalog.assets[1].kind, "combat-icon");
}

#[test]
fn unowned_duplicate_resources_survive_exact_and_edited_catalog_compiles() {
    let rgba = vec![255; 32 * 32 * 4];
    let cicn = encode_scenario_icon_cicn(&rgba, 32, 32).unwrap();
    let fork = write_resource_fork_preserving_duplicates(&[
        ResourceEntry {
            resource_type: *b"cicn",
            id: 451,
            name: "First duplicate".into(),
            attributes: 1,
            data: cicn.clone(),
        },
        ResourceEntry {
            resource_type: *b"cicn",
            id: 451,
            name: "Second duplicate".into(),
            attributes: 2,
            data: cicn.clone(),
        },
        ResourceEntry {
            resource_type: *b"cicn",
            id: 257,
            name: "Captain Maelis".into(),
            attributes: 8,
            data: cicn.clone(),
        },
    ])
    .unwrap();
    let blob = BlobId(format!("sha256:{}", "a".repeat(64)));
    let asset = AssetDescriptor {
        identity: StableId("portrait:257".into()),
        label: "Captain Maelis".into(),
        kind: "portrait".into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: 257,
        }),
        scenario_music_slot: None,
        blob: BlobId(format!("sha256:{}", "b".repeat(64))),
        byte_length: 1,
        classic_payload_blob: Some(blob.clone()),
        classic_payload_byte_length: Some(cicn.len() as u64),
        extension: Some("png".into()),
        width: Some(32),
        height: Some(32),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: CLASSIC_SCENARIO_RESOURCE_SOURCE.into(),
    };
    let exact = compile_scenario_icon_resource_fork(
        std::slice::from_ref(&asset),
        &BTreeMap::from([(blob.0.clone(), cicn.clone())]),
        Some(&fork),
    )
    .unwrap();
    assert_eq!(exact, fork);

    let edited_cicn = encode_scenario_icon_cicn(&vec![0; 32 * 32 * 4], 32, 32).unwrap();
    let edited = compile_scenario_icon_resource_fork(
        &[AssetDescriptor {
            classic_payload_byte_length: Some(edited_cicn.len() as u64),
            ..asset
        }],
        &BTreeMap::from([(blob.0, edited_cicn.clone())]),
        Some(&fork),
    )
    .unwrap();
    let entries = parse_resource_entries_preserving_duplicates(&edited).unwrap();
    assert_eq!(
        entries
            .iter()
            .filter(|entry| entry.resource_type == *b"cicn" && entry.id == 451)
            .count(),
        2
    );
    let updated = entries
        .iter()
        .find(|entry| entry.resource_type == *b"cicn" && entry.id == 257)
        .unwrap();
    assert_eq!(updated.data, edited_cicn);
    assert_eq!(updated.attributes, 8);
}
