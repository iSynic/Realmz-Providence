use super::*;

#[test]
fn custom_landlook_compiles_exactly_and_reimports_canonical_semantics() {
    let mut bytes = vec![0u8; crate::codecs::MAPSTATS_REFERENCE_BYTES];
    bytes[7] = 0xff;
    bytes[18..20].copy_from_slice(&0x1234_i16.to_be_bytes());
    bytes[38..40].copy_from_slice(&(-91_i16).to_be_bytes());
    let base = crate::codecs::MAPSTATS_RECORD_BYTES * crate::codecs::MAPSTATS_RECORDS;
    bytes[base..base + 2].copy_from_slice(&156_i16.to_be_bytes());
    bytes[base + 2..base + 4].copy_from_slice(&1_i16.to_be_bytes());
    bytes[crate::codecs::MAPSTATS_CORE_BYTES..crate::codecs::MAPSTATS_CORE_BYTES + 2]
        .copy_from_slice(&62_i16.to_be_bytes());
    bytes[crate::codecs::MAPSTATS_CORE_BYTES + 2..crate::codecs::MAPSTATS_CORE_BYTES + 4]
        .copy_from_slice(&85_i16.to_be_bytes());
    bytes[crate::codecs::MAPSTATS_CORE_BYTES + 4..crate::codecs::MAPSTATS_CORE_BYTES + 6]
        .copy_from_slice(&0x4567_i16.to_be_bytes());
    let decoded =
        decode_custom_landlook_mapstats(&bytes, 6, BlobId(format!("sha256:{}", "a".repeat(64))))
            .unwrap();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("custom-landlook".into()));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:0".into()),
        native_id: NativeRecordId(0),
        text: "Custom landlook compiler anchor".into(),
        authored: true,
    });
    snapshot.landlook_catalogs.push(decoded.catalog.clone());
    snapshot.terrain_catalog = decoded.profiles.clone();

    let manifest = compile_classic_slice(
        &snapshot,
        ClassicCompatibilitySources {
            data_custom_1_bd: Some(&bytes),
            ..Default::default()
        },
    )
    .unwrap();

    let entry = manifest.get("Data Custom 1 BD").unwrap();
    assert_eq!(entry.bytes, bytes);
    assert_eq!(
        entry.source,
        ManifestSource::Generated {
            family: NativeFileFamily::CustomLandlookMetadata,
        }
    );
    let reopened = reimport_classic_slice(&manifest);
    assert_eq!(reopened.landlook_catalogs.len(), 1);
    assert_eq!(reopened.landlook_catalogs[0].landlook, 6);
    assert_eq!(reopened.landlook_catalogs[0].base_tile, 156);
    assert_eq!(reopened.landlook_catalogs[0].range_slots[0].first_tile, 62);
    assert_eq!(
        reopened.terrain_catalog.len(),
        crate::codecs::MAPSTATS_RECORDS
    );
    assert!(reopened.terrain_catalog[0].shore);
}

#[test]
fn data_solids_compiles_exactly_and_reimports_into_canonical_semantics() {
    let mut source = vec![0; crate::codecs::SPECIAL_LAND_SOLIDITY_BYTES];
    source[13] = 0xff;
    source[88] = 2;
    let mut snapshot = ProjectSnapshot::new_authored(StableId("solidity-compile".into()));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:0".into()),
        native_id: NativeRecordId(0),
        text: "Data Solids compiler anchor".into(),
        authored: true,
    });
    snapshot.world.special_land_solidity = Some(crate::model::SpecialLandSolidityCatalog {
        source: "Data Solids".into(),
        source_blob: BlobId(format!("sha256:{}", "a".repeat(64))),
        solid: crate::codecs::decode_special_land_solidity(&source).unwrap(),
    });
    let sources = ClassicCompatibilitySources {
        data_solids: Some(&source),
        ..Default::default()
    };

    let first = compile_classic_slice(&snapshot, sources).expect("compile Data Solids");
    let second = compile_classic_slice(&snapshot, sources).expect("repeat Data Solids");

    assert_eq!(first, second);
    let entry = first.get("Data Solids").expect("Data Solids output");
    assert_eq!(entry.bytes, source);
    assert_eq!(
        entry.source,
        ManifestSource::Generated {
            family: NativeFileFamily::SpecialLandSolidity,
        }
    );
    assert_eq!(
        reimport_classic_slice(&first).special_land_solidity,
        snapshot
            .world
            .special_land_solidity
            .as_ref()
            .map(|catalog| catalog.solid.clone())
    );
}

#[test]
fn certification_slice_compiles_deterministically_and_reimports_semantics() {
    let snapshot = world_fixtures::certification();

    let first = compile_classic_slice(&snapshot, ClassicCompatibilitySources::default())
        .expect("compile certification slice");
    let second = compile_classic_slice(&snapshot, ClassicCompatibilitySources::default())
        .expect("repeat compile");
    assert_eq!(first, second);
    assert_eq!(
        first.files().map(|(path, _)| path).collect::<Vec<_>>(),
        [
            "Data DD",
            "Data ED",
            "Data ED3",
            "Data EDCD",
            "Data LD",
            "Data SD2",
            "Global"
        ]
    );
    let reimported = reimport_classic_slice(&first);
    assert_eq!(reimported.maps[0].identity, snapshot.world.maps[0].identity);
    assert_eq!(
        reimported.maps[0].native_index,
        snapshot.world.maps[0].native_index
    );
    assert_eq!(reimported.maps[0].tiles, snapshot.world.maps[0].tiles);
    assert_eq!(reimported.action_points, snapshot.world.action_points);
    assert_eq!(reimported.extra_action_points, snapshot.extra_action_points);
    assert_eq!(
        reimported
            .messages
            .iter()
            .map(|message| (message.native_id, message.text.as_str()))
            .collect::<Vec<_>>(),
        vec![(NativeRecordId(47), "The reliquary is empty.")]
    );
    assert_eq!(reimported.simple_encounters[0].native_id, NativeRecordId(3));
    assert_eq!(reimported.simple_encounters[0].prompt_message_native_id, 47);
    assert_eq!(reimported.extra_codes.len(), 48);
    assert!(
        reimported.extra_codes[..47]
            .iter()
            .all(|row| row.values == [0; 5])
    );
    assert_eq!(reimported.extra_codes[47], snapshot.extra_codes[0]);
    assert_eq!(
        reimported.scenario_application,
        snapshot.scenario_application
    );
    assert_eq!(
        reimported.simple_encounters[0].actions[0].target_native_id,
        47
    );
}

#[test]
fn land_random_levels_compile_and_reimport_without_normalizing_source_bytes() {
    let data_ld = vec![0u8; crate::codecs::MAP_LEVEL_BYTES];
    let data_dd = vec![0u8; crate::codecs::ACTION_POINT_LEVEL_BYTES];
    let mut layout = vec![0u8; crate::codecs::LAND_LAYOUT_BYTES + 256];
    layout[0..2].copy_from_slice(&(-1_i16).to_be_bytes());
    layout[crate::codecs::LAND_LAYOUT_BYTES..].fill(0xa5);
    let mut data_rd = vec![0u8; crate::codecs::RANDOM_LEVEL_RECORD_BYTES];
    data_rd[8..10].copy_from_slice(&3_i16.to_be_bytes());
    data_rd[10..12].copy_from_slice(&4_i16.to_be_bytes());
    data_rd[12..14].copy_from_slice(&8_i16.to_be_bytes());
    data_rd[14..16].copy_from_slice(&9_i16.to_be_bytes());
    data_rd[162..164].copy_from_slice(&200_i16.to_be_bytes());
    data_rd[520] = 5;
    data_rd[521] = 0xa5;
    data_rd[522] = 0x80;
    data_rd[523 + 1] = 0xfe;
    data_rd[563] = 0x5a;
    let mut maps = decode_land_maps(&data_ld).records;
    maps[0].runtime = Some(
        decode_land_random_levels(&data_rd)
            .records
            .remove(0)
            .runtime,
    );
    let mut snapshot = ProjectSnapshot::new_authored(StableId("land-runtime".into()));
    snapshot.world.maps = maps;
    snapshot.world.land_layout = Some(decode_land_layout(&layout).expect("decode Layout"));
    let sources = ClassicCompatibilitySources {
        data_ld: Some(&data_ld),
        layout: Some(&layout),
        data_rd: Some(&data_rd),
        data_dd: Some(&data_dd),
        ..Default::default()
    };

    let first = compile_classic_slice(&snapshot, sources).expect("compile Data RD land slice");
    let second = compile_classic_slice(&snapshot, sources).expect("repeat Data RD compile");

    assert_eq!(first, second);
    assert_eq!(first.get("Data LD").unwrap().bytes, data_ld);
    assert_eq!(first.get("Data DD").unwrap().bytes, data_dd);
    assert_eq!(first.get("Data RD").unwrap().bytes, data_rd);
    assert_eq!(first.get("Layout").unwrap().bytes, layout);
    let reimported = reimport_classic_slice(&first);
    assert_eq!(reimported.maps, snapshot.world.maps);
    assert_eq!(reimported.land_layout, snapshot.world.land_layout);
}

#[test]
fn player_maps_compile_deterministically_with_owned_byte_overlay_and_reimport() {
    let world_fixtures::PlayerMapFixture {
        mut snapshot,
        data_md2,
        scenario_resources,
        asset_payloads,
    } = world_fixtures::player_maps();
    let second_row = crate::codecs::PLAYER_MAP_RECORD_BYTES;

    let sources = ClassicCompatibilitySources {
        data_md2: Some(&data_md2),
        scenario_resources: Some(&scenario_resources),
        ..Default::default()
    };

    let exact = compile_classic_slice_with_asset_payloads(&snapshot, sources, &asset_payloads)
        .expect("compile exact Data MD2");
    assert_eq!(exact.get("Data MD2").unwrap().bytes, data_md2);
    assert_eq!(
        exact.get("Scenario.rsrc").unwrap().bytes,
        scenario_resources
    );

    snapshot.world.player_maps[1].authored = true;
    snapshot.world.player_maps[1].note = "The broken bridge is unsafe.".into();
    snapshot.world.player_maps[1].icon_size = 16;
    snapshot.player_map_names.as_mut().unwrap().available_names[1] = "Broken Bridge".into();
    let first = compile_classic_slice_with_asset_payloads(&snapshot, sources, &asset_payloads)
        .expect("compile edited Data MD2");
    let second = compile_classic_slice_with_asset_payloads(&snapshot, sources, &asset_payloads)
        .expect("repeat Data MD2 compile");
    assert_eq!(first, second);
    let bytes = &first.get("Data MD2").unwrap().bytes;
    assert_eq!(
        &bytes[..crate::codecs::PLAYER_MAP_RECORD_BYTES],
        &data_md2[..crate::codecs::PLAYER_MAP_RECORD_BYTES]
    );
    assert_eq!(&bytes[second_row + 74..second_row + 76], &[0xba, 0xbe]);
    assert_eq!(
        &bytes[2 * crate::codecs::PLAYER_MAP_RECORD_BYTES..],
        &[0xde, 0xad]
    );
    let reimported = reimport_classic_slice(&first);
    assert_eq!(
        reimported.player_maps[1].note,
        "The broken bridge is unsafe."
    );
    assert_eq!(
        reimported
            .player_map_names
            .as_ref()
            .unwrap()
            .available_names[1],
        "Broken Bridge"
    );
}

#[test]
fn dungeon_source_trio_compiles_deterministically_and_reimports_semantics() {
    let snapshot = world_fixtures::dungeon();

    let first = compile_classic_slice(&snapshot, ClassicCompatibilitySources::default())
        .expect("compile dungeon source trio");
    let second = compile_classic_slice(&snapshot, ClassicCompatibilitySources::default())
        .expect("repeat dungeon source trio compile");

    assert_eq!(first, second);
    assert_eq!(
        first.files().map(|(path, _)| path).collect::<Vec<_>>(),
        ["Data BD", "Data DDD", "Data DL", "Data ED3", "Data RDD"]
    );
    assert_eq!(
        first.get("Data BD").unwrap().bytes.len(),
        13 * crate::codecs::BATTLE_RECORD_BYTES
    );
    assert_eq!(first.get("Data DL").unwrap().bytes.len(), 90 * 90 * 2);
    assert_eq!(first.get("Data DDD").unwrap().bytes.len(), 100 * 40);
    assert_eq!(first.get("Data RDD").unwrap().bytes.len(), 644);
    assert_eq!(first.get("Data ED3").unwrap().bytes.len(), 4 * 40);
    assert!(first.get("Data LD").is_none());
    assert!(first.get("Data DD").is_none());

    let reimported = reimport_classic_slice(&first);
    assert_eq!(reimported.maps[0].identity, snapshot.world.maps[0].identity);
    assert_eq!(
        reimported.maps[0].native_index,
        snapshot.world.maps[0].native_index
    );
    assert_eq!(reimported.maps[0].tiles, snapshot.world.maps[0].tiles);
    assert_eq!(reimported.maps[0].runtime, snapshot.world.maps[0].runtime);
    assert_eq!(reimported.action_points, snapshot.world.action_points);
}
