use super::*;

#[test]
fn scenario_caste_table_joins_the_manifest_exactly_and_reimports() {
    let (snapshot, source) = catalogs_fixtures::caste_table();

    let manifest = compile_classic_slice(
        &snapshot,
        ClassicCompatibilitySources {
            data_caste: Some(&source),
            ..Default::default()
        },
    )
    .expect("compile complete Data Caste");

    let entry = manifest.get("Data Caste").expect("Data Caste output");
    assert_eq!(entry.bytes, source);
    assert_eq!(
        entry.source,
        ManifestSource::Generated {
            family: NativeFileFamily::CasteRules,
        }
    );
    let reimported = reimport_classic_slice(&manifest);
    assert_eq!(reimported.caste_rules.len(), 30);
    assert_eq!(
        reimported.caste_rules[0].definition,
        snapshot.caste_rules[0].definition
    );
}

#[test]
fn caste_fallback_only_exports_an_authored_override_and_requires_complete_records() {
    let (mut snapshot, source) = catalogs_fixtures::caste_table();
    snapshot.classic_sources.clear();
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:0".into()),
        native_id: NativeRecordId(0),
        text: "Caste fallback anchor".into(),
        authored: true,
    });
    let fallback = compile_classic_slice(
        &snapshot,
        ClassicCompatibilitySources {
            application_data_caste: Some(&source),
            ..Default::default()
        },
    )
    .expect("compile with unchanged application fallback");
    assert!(fallback.get("Data Caste").is_none());
    snapshot.caste_rules[0].definition.movement_bonus = 4;
    let override_manifest = compile_classic_slice(
        &snapshot,
        ClassicCompatibilitySources {
            application_data_caste: Some(&source),
            ..Default::default()
        },
    )
    .expect("compile edited fallback as a scenario override");
    assert_eq!(
        override_manifest
            .get("Data Caste")
            .expect("scenario caste override")
            .bytes[252..254],
        4_i16.to_be_bytes()
    );

    snapshot.caste_rules.truncate(29);
    assert!(matches!(
        compile_classic_slice(
            &snapshot,
            ClassicCompatibilitySources {
                data_caste: Some(&source),
                ..Default::default()
            }
        ),
        Err(ClassicSliceCompileError::Compatibility(codes))
            if codes == vec!["classic.caste.record-count"]
    ));
}

#[test]
fn scenario_spells_compile_deterministically_and_preserve_unedited_source_bytes() {
    let mut source = vec![0u8; crate::codecs::SCENARIO_SPELL_BYTES + 3];
    source[28] = 7;
    source[29] = 255;
    source[crate::codecs::SCENARIO_SPELL_BYTES..].copy_from_slice(&[0xaa, 0xbb, 0xcc]);
    let source_blob = BlobId("sha256:spell-source".into());
    let mut decoded = crate::codecs::decode_scenario_spells(&source, Some(source_blob));
    decoded.spells[20].definition.cost = 33;
    decoded.spells[20].definition.authored = true;
    let mut snapshot = ProjectSnapshot::new_authored(StableId("spell-certification".into()));
    snapshot.scenario_spells = decoded.spells;
    let inputs = ClassicCompatibilitySources {
        data_spell: Some(&source),
        ..Default::default()
    };

    let first = compile_classic_slice(&snapshot, inputs).expect("compile Data Spell");
    let second = compile_classic_slice(&snapshot, inputs).expect("repeat Data Spell compile");
    assert_eq!(first.deterministic_sha256(), second.deterministic_sha256());
    let output = &first.get("Data Spell").expect("Data Spell entry").bytes;
    assert_eq!(output.len(), source.len());
    assert_eq!(output[20 * 30 + 10], 33);
    assert_eq!(&output[..30], &source[..30]);
    assert_eq!(
        &output[crate::codecs::SCENARIO_SPELL_BYTES..],
        &[0xaa, 0xbb, 0xcc]
    );
}

#[test]
fn scenario_item_catalog_joins_the_full_classic_manifest_and_reimports() {
    let source = vec![0; crate::codecs::ITEM_RECORD_BYTES * 200];
    let source_blob = BlobId(format!("sha256:{}", "d".repeat(64)));
    let mut snapshot = ProjectSnapshot::new_authored(StableId("scenario-items".into()));
    snapshot.scenario_item_rules =
        crate::codecs::decode_scenario_item_rules(&source, None, source_blob, None)
            .expect("controlled Data NI")
            .rules;

    let manifest = compile_classic_slice(
        &snapshot,
        ClassicCompatibilitySources {
            data_ni: Some(&source),
            ..Default::default()
        },
    )
    .expect("compile Data NI into complete manifest");

    assert_eq!(manifest.files().len(), 1);
    assert_eq!(manifest.get("Data NI").expect("Data NI").bytes, source);
    let reimported = reimport_classic_slice(&manifest);
    assert_eq!(reimported.scenario_item_rules.len(), 200);
    assert_eq!(
        reimported.scenario_item_rules[199].definition.classic_id,
        999
    );

    snapshot.scenario_item_rules[0].definition.name = "Providence Blade".into();
    let with_text = compile_classic_slice(
        &snapshot,
        ClassicCompatibilitySources {
            data_ni: Some(&source),
            ..Default::default()
        },
    )
    .expect("compile authored scenario item text");
    assert!(with_text.get("Scenario.rsrc").is_none());
    assert!(with_text.get("Data NI.rsrc").is_some());
    assert_eq!(
        reimport_classic_slice(&with_text).scenario_item_rules[0]
            .definition
            .name,
        "Providence Blade"
    );
}

#[test]
fn scenario_item_text_in_scenario_fork_round_trips_without_a_duplicate_fork() {
    let items = vec![0; crate::codecs::ITEM_RECORD_BYTES * 200];
    let mut snapshot = ProjectSnapshot::new_authored(StableId("scenario-item-fork".into()));
    snapshot.scenario_item_rules = crate::codecs::decode_scenario_item_rules(
        &items,
        None,
        BlobId("sha256:scenario-item-binary".into()),
        None,
    )
    .unwrap()
    .rules;
    snapshot.scenario_item_rules[0].definition.name = "Source Torch".into();
    let resources =
        crate::codecs::encode_scenario_item_text_resources(&snapshot.scenario_item_rules, None)
            .unwrap();
    snapshot.scenario_item_rules = crate::codecs::decode_scenario_item_rules(
        &items,
        Some(&resources),
        BlobId("sha256:scenario-item-binary".into()),
        Some(BlobId("sha256:scenario-resource-fork".into())),
    )
    .unwrap()
    .rules;
    let sources = ClassicCompatibilitySources {
        data_ni: Some(&items),
        data_ni_text: Some(NamedCompatibilitySource {
            native_path: "Scenario.rsrc",
            bytes: &resources,
        }),
        scenario_resources: Some(&resources),
        ..Default::default()
    };

    let unchanged = compile_classic_slice(&snapshot, sources).unwrap();
    assert!(unchanged.get("Data NI.rsrc").is_none());
    assert_eq!(unchanged.get("Scenario.rsrc").unwrap().bytes, resources);
    assert_eq!(
        reimport_classic_slice(&unchanged).scenario_item_rules[0]
            .definition
            .name,
        "Source Torch"
    );

    snapshot.scenario_item_rules[0].definition.name = "Edited Torch".into();
    let edited = compile_classic_slice(&snapshot, sources).unwrap();
    assert!(edited.get("Data NI.rsrc").is_none());
    assert_ne!(edited.get("Scenario.rsrc").unwrap().bytes, resources);
    assert_eq!(
        reimport_classic_slice(&edited).scenario_item_rules[0]
            .definition
            .name,
        "Edited Torch"
    );
}

#[test]
fn treasure_compile_preserves_untouched_rows_and_reimports_semantics() {
    let mut source = vec![0xa5; crate::codecs::TREASURE_RECORD_BYTES * 2];
    source.extend_from_slice(&[0xde, 0xad]);
    let mut records = crate::codecs::decode_treasures(&source).records;
    records[1].authored = true;
    records[1].item_ids = vec![0; crate::codecs::TREASURE_ITEM_SLOTS];
    records[1].item_ids[0] = -7;
    records[1].gold = 321;
    let mut snapshot = ProjectSnapshot::new_authored(StableId("treasure-certification".into()));
    snapshot.treasures = records;
    let sources = ClassicCompatibilitySources {
        data_td: Some(&source),
        ..Default::default()
    };
    let first = compile_classic_slice(&snapshot, sources).expect("compile treasure catalog");
    let second = compile_classic_slice(&snapshot, sources).expect("repeat treasure compile");
    assert_eq!(first, second);
    let output = &first.get("Data TD").unwrap().bytes;
    assert_eq!(
        &output[..crate::codecs::TREASURE_RECORD_BYTES],
        &source[..crate::codecs::TREASURE_RECORD_BYTES]
    );
    assert_eq!(
        &output[2 * crate::codecs::TREASURE_RECORD_BYTES..],
        &[0xde, 0xad]
    );
    let reopened = reimport_classic_slice(&first);
    assert_eq!(reopened.treasures[1].item_ids[0], -7);
    assert_eq!(reopened.treasures[1].gold, 321);
}

#[test]
fn shop_compile_preserves_untouched_rows_and_reimports_semantics() {
    let mut first = crate::codecs::decode_shops(
        &crate::codecs::encode_shops(
            &[ShopRecord {
                identity: StableId("shop:0".into()),
                native_id: NativeRecordId(0),
                item_ids: vec![-1; crate::codecs::SHOP_ITEM_SLOTS],
                quantities: vec![0; crate::codecs::SHOP_ITEM_SLOTS],
                inflation: 100,
                authored: true,
            }],
            None,
        )
        .unwrap(),
    )
    .records;
    first[0].authored = false;
    let source = crate::codecs::encode_shops(&first, None).unwrap_err();
    assert!(matches!(
        source,
        crate::codecs::ShopCodecError::MissingCompatibilitySource(_)
    ));
    let mut source = vec![0; crate::codecs::SHOP_RECORD_BYTES * 2];
    source.extend_from_slice(&[0xde]);
    let mut records = crate::codecs::decode_shops(&source).records;
    records[1].authored = true;
    records[1].item_ids.fill(-1);
    records[1].inflation = 135;
    let mut snapshot = ProjectSnapshot::new_authored(StableId("shop-certification".into()));
    snapshot.shops = records;
    let sources = ClassicCompatibilitySources {
        data_sd: Some(&source),
        ..Default::default()
    };
    let first = compile_classic_slice(&snapshot, sources).expect("compile shops");
    let second = compile_classic_slice(&snapshot, sources).expect("repeat shop compile");
    assert_eq!(first, second);
    let output = &first.get("Data SD").unwrap().bytes;
    assert_eq!(
        &output[..crate::codecs::SHOP_RECORD_BYTES],
        &source[..crate::codecs::SHOP_RECORD_BYTES]
    );
    assert_eq!(&output[2 * crate::codecs::SHOP_RECORD_BYTES..], &[0xde]);
    assert_eq!(reimport_classic_slice(&first).shops[1].inflation, 135);
}

#[test]
fn option_label_compile_preserves_untouched_rows_and_reimports_semantics() {
    let mut source = vec![0xa5; crate::codecs::OPTION_LABEL_RECORD_BYTES * 2];
    source[0] = 2;
    source[1..3].copy_from_slice(b"Go");
    source.extend_from_slice(&[0xde]);
    let mut labels = crate::codecs::decode_option_labels(&source).records;
    labels[1].authored = true;
    labels[1].text = "Withdraw".into();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("option-label-certification".into()));
    snapshot.option_labels = labels;
    let sources = ClassicCompatibilitySources {
        data_od: Some(&source),
        ..Default::default()
    };
    let first = compile_classic_slice(&snapshot, sources).expect("compile option labels");
    let second = compile_classic_slice(&snapshot, sources).expect("repeat option-label compile");
    assert_eq!(first, second);
    let output = &first.get("Data OD").unwrap().bytes;
    assert_eq!(
        &output[..crate::codecs::OPTION_LABEL_RECORD_BYTES],
        &source[..crate::codecs::OPTION_LABEL_RECORD_BYTES]
    );
    assert_eq!(
        &output[2 * crate::codecs::OPTION_LABEL_RECORD_BYTES..],
        &[0xde]
    );
    assert_eq!(
        reimport_classic_slice(&first).option_labels[1].text,
        "Withdraw"
    );
}
