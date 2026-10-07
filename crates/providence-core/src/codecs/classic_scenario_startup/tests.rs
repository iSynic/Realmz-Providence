use super::*;
use crate::model::StableId;

#[test]
fn decodes_start_and_restrictions_without_inventing_authored_guidance() {
    let mut startup = vec![0u8; SCENARIO_STARTUP_BYTES];
    startup[0..4].copy_from_slice(&54_i32.to_be_bytes());
    startup[4..8].copy_from_slice(&81_i32.to_be_bytes());
    startup[8..12].copy_from_slice(&2_i32.to_be_bytes());
    startup[12..16].copy_from_slice(&42_i32.to_be_bytes());
    startup[16..20].copy_from_slice(&71_i32.to_be_bytes());
    startup[60] = 9;
    startup[61..70].copy_from_slice(b"Fantasoft");
    let mut restrictions = vec![0u8; SCENARIO_RESTRICTIONS_BYTES];
    restrictions[0] = 4;
    restrictions[1..5].copy_from_slice(b"None");
    restrictions[258..260].copy_from_slice(&20_i16.to_be_bytes());
    restrictions[260] = 1;
    restrictions[319] = 1;

    let decoded =
        decode_scenario_startup("Half Truth", &startup, &restrictions).expect("decode startup");

    assert_eq!(decoded.campaign.name, "Half Truth");
    assert_eq!(decoded.campaign.author, "Fantasoft");
    assert_eq!(decoded.campaign.recommended_party_levels, 54);
    assert_eq!(decoded.campaign.maximum_party_levels, 81);
    assert!(!decoded.campaign.guidance_authored);
    assert_eq!(decoded.campaign.restrictions.max_party_size, 6);
    assert_eq!(decoded.campaign.restrictions.max_level, 20);
    assert_eq!(
        decoded.campaign.restrictions.banned_races,
        vec![StableId("classic.race.1".into())]
    );
    assert_eq!(
        decoded.campaign.restrictions.banned_castes,
        vec![StableId("classic.caste.30".into())]
    );
    assert_eq!(decoded.start_location.map.0, "land:2");
    assert_eq!(decoded.start_location.coordinate.x, 42);
    assert_eq!(decoded.start_location.coordinate.y, 71);
}

#[test]
fn rejects_invalid_geometry_and_classic_party_limits() {
    let mut startup = vec![0u8; SCENARIO_STARTUP_BYTES];
    startup[12..16].copy_from_slice(&90_i32.to_be_bytes());
    let restrictions = vec![0u8; SCENARIO_RESTRICTIONS_BYTES];
    assert!(matches!(
        decode_scenario_startup("Bad", &startup, &restrictions),
        Err(ScenarioStartupCodecError::StartCoordinateOutOfRange { .. })
    ));

    startup[12..16].copy_from_slice(&0_i32.to_be_bytes());
    let mut restrictions = restrictions;
    restrictions[256..258].copy_from_slice(&7_i16.to_be_bytes());
    assert!(matches!(
        decode_scenario_startup("Bad", &startup, &restrictions),
        Err(ScenarioStartupCodecError::PartySizeOutOfRange(7))
    ));
}

fn source_pair() -> (Vec<u8>, Vec<u8>) {
    let mut startup = vec![0x5a; SCENARIO_STARTUP_BYTES];
    startup[0..4].copy_from_slice(&4_i32.to_be_bytes());
    startup[4..8].copy_from_slice(&12_i32.to_be_bytes());
    startup[8..12].copy_from_slice(&2_i32.to_be_bytes());
    startup[12..16].copy_from_slice(&42_i32.to_be_bytes());
    startup[16..20].copy_from_slice(&71_i32.to_be_bytes());
    startup[60] = 5;
    startup[61..66].copy_from_slice(&[b'E', 0x8e, b'r', b'i', b'c']);
    let mut restrictions = vec![0; SCENARIO_RESTRICTIONS_BYTES];
    restrictions[0] = 4;
    restrictions[1..5].copy_from_slice(b"None");
    restrictions[5..256].fill(0xa5);
    restrictions[256..258].copy_from_slice(&0_i16.to_be_bytes());
    restrictions[258..260].copy_from_slice(&20_i16.to_be_bytes());
    restrictions[260] = 7;
    restrictions[289] = 0;
    restrictions[290] = 0;
    restrictions[319] = 9;
    (startup, restrictions)
}

#[test]
fn no_edit_round_trip_preserves_registration_bytes_pascal_slack_and_boolean_spelling() {
    let (startup, restrictions) = source_pair();
    let decoded = decode_scenario_startup("Half Truth", &startup, &restrictions).unwrap();

    let encoded = encode_scenario_startup(
        "Half Truth",
        &decoded.campaign,
        &decoded.start_location,
        Some(&startup),
        Some(&restrictions),
    )
    .unwrap();

    assert_eq!(encoded, (startup, restrictions));
}

#[test]
fn edits_overlay_only_their_owned_native_fields() {
    let (startup, restrictions) = source_pair();
    let mut decoded = decode_scenario_startup("Half Truth", &startup, &restrictions).unwrap();
    decoded.campaign.recommended_party_levels = 6;
    decoded.campaign.creator_user_check = "Zoë".into();
    decoded.campaign.restrictions.description = "No dragons".into();
    decoded.campaign.restrictions.max_party_size = 4;
    decoded
        .campaign
        .restrictions
        .banned_races
        .push(StableId("classic.race.30".into()));

    let (edited_startup, edited_restrictions) = encode_scenario_startup(
        "Half Truth",
        &decoded.campaign,
        &decoded.start_location,
        Some(&startup),
        Some(&restrictions),
    )
    .unwrap();
    let changed_startup = startup
        .iter()
        .zip(&edited_startup)
        .enumerate()
        .filter_map(|(index, (before, after))| (before != after).then_some(index))
        .collect::<Vec<_>>();
    let changed_restrictions = restrictions
        .iter()
        .zip(&edited_restrictions)
        .enumerate()
        .filter_map(|(index, (before, after))| (before != after).then_some(index))
        .collect::<Vec<_>>();

    assert!(
        changed_startup
            .iter()
            .all(|index| *index < 4 || *index >= 60)
    );
    assert!(
        changed_restrictions
            .iter()
            .all(|index| { *index < 256 || (256..258).contains(index) || *index == 289 })
    );
    assert_eq!(&edited_startup[20..60], &startup[20..60]);
    assert_eq!(edited_restrictions[260], 7);
    assert_eq!(edited_restrictions[289], 1);
    let reopened =
        decode_scenario_startup("Half Truth", &edited_startup, &edited_restrictions).unwrap();
    assert_eq!(reopened.campaign.creator_user_check, "Zoë");
    assert_eq!(reopened.campaign.restrictions.max_party_size, 4);
    assert_eq!(reopened.campaign.restrictions.banned_races.len(), 2);
}

#[test]
fn writer_refuses_partial_sources_splash_metadata_and_unrepresentable_text() {
    let (startup, restrictions) = source_pair();
    let mut decoded = decode_scenario_startup("Half Truth", &startup, &restrictions).unwrap();
    assert!(matches!(
        encode_scenario_startup(
            "Half Truth",
            &decoded.campaign,
            &decoded.start_location,
            None,
            Some(&restrictions),
        ),
        Err(ScenarioStartupCodecError::IncompleteSourcePair)
    ));

    decoded.campaign.splash_asset_id = "classic-resource:PICT:30128".into();
    assert!(matches!(
        encode_scenario_startup(
            "Half Truth",
            &decoded.campaign,
            &decoded.start_location,
            Some(&startup),
            Some(&restrictions),
        ),
        Err(ScenarioStartupCodecError::UnsupportedCampaignField(
            "splashAssetId"
        ))
    ));
    decoded.campaign.splash_asset_id.clear();
    decoded.campaign.creator_user_check = "Dragon 🐉".into();
    assert!(matches!(
        encode_scenario_startup(
            "Half Truth",
            &decoded.campaign,
            &decoded.start_location,
            Some(&startup),
            Some(&restrictions),
        ),
        Err(ScenarioStartupCodecError::UnencodableText {
            field: "creator user check"
        })
    ));
}

#[test]
fn startup_tail_is_compatibility_only_and_missing_restrictions_decode_neutrally() {
    let (mut startup, _) = source_pair();
    startup.extend_from_slice(&[0xde, 0xad, 0xbe, 0xef]);
    let neutral = [0_u8; SCENARIO_RESTRICTIONS_BYTES];
    let decoded = decode_scenario_startup("Half Truth", &startup, &neutral).unwrap();
    assert_eq!(decoded.campaign.restrictions.max_party_size, 6);
    assert_eq!(decoded.campaign.restrictions.max_level, 0);
    assert!(decoded.campaign.restrictions.banned_races.is_empty());
    assert!(decoded.campaign.restrictions.banned_castes.is_empty());

    let (encoded_startup, encoded_restrictions) = encode_scenario_startup(
        "Half Truth",
        &decoded.campaign,
        &decoded.start_location,
        Some(&startup),
        None,
    )
    .unwrap();
    assert_eq!(encoded_startup, startup);
    assert_eq!(encoded_restrictions, neutral);
}
