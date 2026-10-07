use super::*;

#[test]
fn scenario_bootstrap_compiles_with_owned_overlays_and_reimports_semantics() {
    let mut startup = vec![0x55; crate::codecs::SCENARIO_STARTUP_BYTES];
    startup[0..4].copy_from_slice(&4_i32.to_be_bytes());
    startup[4..8].copy_from_slice(&12_i32.to_be_bytes());
    startup[8..12].copy_from_slice(&0_i32.to_be_bytes());
    startup[12..16].copy_from_slice(&2_i32.to_be_bytes());
    startup[16..20].copy_from_slice(&3_i32.to_be_bytes());
    startup[60] = 5;
    startup[61..66].copy_from_slice(b"Jared");
    let mut restrictions = vec![0; crate::codecs::SCENARIO_RESTRICTIONS_BYTES];
    restrictions[0] = 4;
    restrictions[1..5].copy_from_slice(b"None");
    restrictions[258..260].copy_from_slice(&20_i16.to_be_bytes());
    let decoded =
        crate::codecs::decode_scenario_startup("Compiler Scenario", &startup, &restrictions)
            .unwrap();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("startup-compile".into()));
    snapshot.campaign = Some(decoded.campaign.clone());
    snapshot.start_location = Some(decoded.start_location.clone());
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Compiler Map".into(),
        tiles: vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: None,
    });
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:0".into()),
        native_id: NativeRecordId(0),
        text: "Compiler anchor".into(),
        authored: true,
    });
    let sources = ClassicCompatibilitySources {
        scenario_startup: Some(NamedCompatibilitySource {
            native_path: "Compiler Scenario",
            bytes: &startup,
        }),
        data_ri: Some(&restrictions),
        ..Default::default()
    };

    let manifest = compile_classic_slice(&snapshot, sources).unwrap();

    assert_eq!(manifest.get("Compiler Scenario").unwrap().bytes, startup);
    assert_eq!(manifest.get("Data RI").unwrap().bytes, restrictions);
    assert_eq!(
        manifest.get("Compiler Scenario").unwrap().source,
        ManifestSource::Generated {
            family: NativeFileFamily::ScenarioStartup,
        }
    );
    let reopened = reimport_classic_slice(&manifest);
    assert_eq!(reopened.campaign, snapshot.campaign);
    assert_eq!(reopened.start_location, snapshot.start_location);
}

#[test]
fn imported_startup_tail_round_trips_without_inventing_optional_restrictions() {
    let mut startup = vec![0; crate::codecs::SCENARIO_STARTUP_BYTES];
    startup[0..4].copy_from_slice(&1_i32.to_be_bytes());
    startup[4..8].copy_from_slice(&10_i32.to_be_bytes());
    startup[12..16].copy_from_slice(&2_i32.to_be_bytes());
    startup[16..20].copy_from_slice(&3_i32.to_be_bytes());
    startup.extend_from_slice(&[0xde, 0xad, 0xbe, 0xef]);
    let neutral = vec![0; crate::codecs::SCENARIO_RESTRICTIONS_BYTES];
    let decoded =
        crate::codecs::decode_scenario_startup("Tail Scenario", &startup, &neutral).unwrap();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("tail-startup".into()));
    snapshot.campaign = Some(decoded.campaign);
    snapshot.start_location = Some(decoded.start_location);
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Tail Map".into(),
        tiles: vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: None,
    });
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:0".into()),
        native_id: NativeRecordId(0),
        text: "Tail anchor".into(),
        authored: true,
    });

    let manifest = compile_classic_slice(
        &snapshot,
        ClassicCompatibilitySources {
            scenario_startup: Some(NamedCompatibilitySource {
                native_path: "Tail Scenario",
                bytes: &startup,
            }),
            data_ri: None,
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(manifest.get("Tail Scenario").unwrap().bytes, startup);
    assert!(manifest.get("Data RI").is_none());
}

#[test]
fn scenario_contact_compile_preserves_unowned_slots_and_reimports_owned_semantics() {
    let (mut snapshot, startup, restrictions, contact_source) = bootstrap_fixtures::contact();

    let compile = |snapshot: &ProjectSnapshot| {
        compile_classic_slice(
            snapshot,
            ClassicCompatibilitySources {
                scenario_startup: Some(NamedCompatibilitySource {
                    native_path: "Scenario Folder",
                    bytes: &startup,
                }),
                data_ri: Some(&restrictions),
                data_ci: Some(&contact_source),
                ..Default::default()
            },
        )
        .unwrap()
    };

    let unchanged = compile(&snapshot);
    assert_eq!(unchanged.get("Data CI").unwrap().bytes, contact_source);

    let campaign = snapshot.campaign.as_mut().unwrap();
    campaign.contact.email = "new@example.test".into();
    campaign.contact_provenance = crate::model::CampaignContactProvenance::Authored;
    let edited = compile(&snapshot);
    let contact = &edited.get("Data CI").unwrap().bytes;
    assert_eq!(&contact[..4 * 256], &contact_source[..4 * 256]);
    assert_eq!(&contact[5 * 256..], &contact_source[5 * 256..]);
    assert_eq!(
        &contact[7 * 256..17 * 256],
        &contact_source[7 * 256..17 * 256]
    );
    assert_eq!(
        edited.get("Data CI").unwrap().source,
        ManifestSource::Generated {
            family: NativeFileFamily::ScenarioContactInfo,
        }
    );

    let reopened = reimport_classic_slice(&edited);
    let reopened_campaign = reopened.campaign.expect("reimported campaign");
    assert_eq!(reopened_campaign.contact.email, "new@example.test");
    assert_eq!(reopened_campaign.contact.title, "xyz");
    assert_eq!(reopened_campaign.creator_user_check, "Jared");
}

#[test]
fn imported_scenario_support_is_preserved_as_annex_truth_only() {
    let mut bytes = vec![0xa5; crate::codecs::SCENARIO_SUPPORT_BYTES];
    bytes[23] = 7;
    bytes[38..40].copy_from_slice(&311_i16.to_be_bytes());
    let blob = BlobId(format!("sha256:{}", "e".repeat(64)));
    let mut snapshot = ProjectSnapshot::new_authored(StableId("scenario-support".into()));
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:0".into()),
        native_id: NativeRecordId(0),
        text: "Preserve-only support anchor".into(),
        authored: true,
    });

    let manifest = compile_classic_slice(
        &snapshot,
        ClassicCompatibilitySources {
            scenario_support: Some(PreservedCompatibilitySource {
                blob: &blob,
                bytes: &bytes,
            }),
            ..Default::default()
        },
    )
    .expect("preserve imported Scenario support data");

    let entry = manifest.get("Scenario").expect("Scenario support output");
    assert_eq!(entry.bytes, bytes);
    assert_eq!(
        entry.source,
        ManifestSource::CompatibilityAnnex { blob: blob.clone() }
    );
    assert!(
        compile_classic_slice(&snapshot, ClassicCompatibilitySources::default())
            .expect("fresh compile without support annex")
            .get("Scenario")
            .is_none()
    );

    let truncated = vec![0; crate::codecs::SCENARIO_SUPPORT_BYTES - 1];
    assert!(matches!(
        compile_classic_slice(
            &snapshot,
            ClassicCompatibilitySources {
                scenario_support: Some(PreservedCompatibilitySource {
                    blob: &blob,
                    bytes: &truncated,
                }),
                ..Default::default()
            }
        ),
        Err(ClassicSliceCompileError::ScenarioSupport(
            ScenarioSupportCodecError::WrongLength { actual: 599 }
        ))
    ));
}
