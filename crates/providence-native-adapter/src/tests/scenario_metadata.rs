use super::*;

#[test]
fn campaign_and_start_commands_retire_only_their_rebuilt_readiness_gaps() {
    let mut session = EditorSession::new(demo_snapshot());
    dispatch_result(
        &mut session,
        "campaign.set",
        json!({
            "expectedRevision": 0,
            "metadata": {
                "name": "The Ashen Crown",
                "version": "1.0",
                "author": "A. Cartographer",
                "contact": { "email": "", "web": "", "date": "", "fee": "" },
                "description": "Hold the western coast.",
                "splashAssetId": "",
                "recommendedPartyLevels": 4,
                "maximumPartyLevels": 8,
                "guidanceAuthored": true,
                "restrictions": {
                    "description": "",
                    "maxPartySize": 6,
                    "maxLevel": 8,
                    "bannedRaces": [],
                    "bannedCastes": []
                }
            }
        }),
    )
    .expect("set campaign");
    dispatch_result(
        &mut session,
        "start-location.set",
        json!({
            "expectedRevision": 1,
            "location": { "map": "land:0", "coordinate": { "x": 18, "y": 23 } }
        }),
    )
    .expect("set start location");

    let classification = dispatch_result(&mut session, "compatibility.classify", json!({}))
        .expect("classify configured inputs");
    let codes = classification[1]["blockers"]
        .as_array()
        .unwrap()
        .iter()
        .map(|blocker| blocker["code"].as_str().unwrap())
        .collect::<Vec<_>>();
    assert!(!codes.contains(&"rebuilt.campaign-metadata.missing"));
    assert!(!codes.contains(&"rebuilt.start-location.missing"));
    assert!(codes.contains(&"rebuilt.terrain-catalog.unavailable"));
    let bootstrap = dispatch_result(&mut session, "project.inspect-rebuilt-bootstrap", json!({}))
        .expect("inspect typed Rebuilt bootstrap");
    assert_eq!(bootstrap["campaign"]["id"], "ashen-crown");
    assert_eq!(bootstrap["start"]["mapId"], "land:0");
    assert_eq!(session.revision(), Revision(2));
}

#[test]
fn scenario_contact_commands_use_bounded_revisioned_projections() {
    let mut session = EditorSession::new(demo_snapshot());
    dispatch_result(
        &mut session,
        "campaign.set",
        json!({
            "expectedRevision": 0,
            "metadata": contact_campaign_metadata()
        }),
    )
    .expect("initialize campaign");

    let opened = dispatch_result_with_application(
        &mut session,
        None,
        None,
        "scenario-contact.open",
        json!({}),
    )
    .expect("open scenario contact");
    assert_eq!(opened["revision"], 1);
    assert_eq!(opened["contact"]["version"], "1.0");
    assert_eq!(opened["provenance"], "authored");
    assert_eq!(opened["sourcePresent"], false);

    let updated = dispatch_result(
        &mut session,
        "scenario-contact.update",
        json!({
            "expectedRevision": 1,
            "contact": {
                "title": "The Display Title",
                "version": "1.1",
                "date": "September 1998",
                "author": "Scenario Author",
                "email": "author@example.test",
                "web": "https://example.test",
                "fee": "Free",
                "description": "Updated description"
            }
        }),
    )
    .expect("update scenario contact");
    assert_eq!(updated["revision"], 2);
    assert_eq!(updated["changedEntitiesTotal"], 1);
    assert!(updated.get("snapshot").is_none());
    assert!(updated.get("project").is_none());

    let reopened = dispatch_result_with_application(
        &mut session,
        None,
        None,
        "scenario-contact.open",
        json!({}),
    )
    .expect("reopen scenario contact");
    assert_eq!(reopened["contact"]["title"], "The Display Title");
    assert_eq!(reopened["contact"]["email"], "author@example.test");
    assert_eq!(reopened["provenance"], "authored");
}

#[test]
fn scenario_metadata_routes_are_bounded_and_share_revisioned_canonical_truth() {
    let mut session = EditorSession::new(demo_snapshot());
    dispatch_result(
        &mut session,
        "campaign.set",
        json!({
            "expectedRevision": 0,
            "metadata": restricted_campaign_metadata()
        }),
    )
    .expect("initialize campaign");
    dispatch_result(
        &mut session,
        "start-location.set",
        json!({
            "expectedRevision": 1,
            "location": { "map": "land:0", "coordinate": { "x": 18, "y": 23 } }
        }),
    )
    .expect("set start location");

    let startup = assert_startup_route(&mut session);
    let restrictions = dispatch_result_with_application(
        &mut session,
        None,
        None,
        "scenario-restrictions.open",
        json!({}),
    )
    .expect("open restrictions route");
    assert_eq!(restrictions["revision"], 2);
    assert_eq!(restrictions["restrictions"]["maxPartySize"], 5);
    assert_eq!(
        restrictions["restrictions"]["bannedCastes"][0],
        "classic.caste.12"
    );
    assert!(restrictions["source"].is_null());

    let security = dispatch_result_with_application(
        &mut session,
        None,
        None,
        "scenario-security.open",
        json!({}),
    )
    .expect("open authored security route");
    assert_eq!(security["revision"], 2);
    assert_eq!(security["policy"], "explicit-authoring");
    assert_eq!(security["editable"], true);
    assert_eq!(security["decodingAvailable"], true);
    assert_eq!(security["segment1"], "");

    for projection in [&startup, &restrictions, &security] {
        assert!(projection.get("snapshot").is_none());
        assert!(projection.get("project").is_none());
    }
    assert_eq!(session.revision(), Revision(2));
}

#[test]
fn scenario_security_route_retains_unknown_segments_without_guessing_plaintext() {
    let temporary = tempdir().expect("temporary root");
    let root = temporary.path().join("project");
    let mut snapshot = ProjectSnapshot::new_authored(StableId("security-evidence".into()));
    snapshot.campaign = Some(CampaignMetadata {
        name: "Scenario Folder".into(),
        version: "1.0".into(),
        author: "Registered User".into(),
        creator_user_check: "Registered User".into(),
        contact: providence_core::model::CampaignContact::default(),
        contact_provenance: CampaignContactProvenance::Absent,
        description: String::new(),
        splash_asset_id: String::new(),
        recommended_party_levels: 1,
        maximum_party_levels: 10,
        guidance_authored: false,
        restrictions: providence_core::model::CampaignRestrictions {
            description: String::new(),
            max_party_size: 6,
            max_level: 10,
            banned_races: Vec::new(),
            banned_castes: Vec::new(),
        },
    });
    let store = ProjectStore::create(&root, &snapshot).expect("create store");
    let mut startup = vec![0_u8; providence_core::codecs::SCENARIO_STARTUP_BYTES];
    startup[20..25].copy_from_slice(&[2, 4, 6, 8, 10]);
    let blob = store.put_blob(&startup).expect("store startup source");
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Scenario Folder".into(),
        blob,
        byte_length: startup.len() as u64,
    });
    let mut session = EditorSession::new(snapshot);

    let opened = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "scenario-security.open",
        json!({}),
    )
    .expect("inspect security evidence");
    assert_eq!(opened["runtimeTitle"], "Scenario Folder");
    assert_eq!(opened["decodingAvailable"], false);
    assert_eq!(opened["segment1"], "");
    assert_eq!(opened["segment2"], "");
    assert!(opened["reason"].as_str().unwrap().contains("Data CS"));
    assert_eq!(
        store
            .read_blob(&session.snapshot().classic_sources[0].blob)
            .unwrap(),
        startup
    );
    assert!(opened.get("bytes").is_none());
    assert!(opened.get("blob").is_none());
    assert_eq!(session.revision(), Revision(0));
}

#[test]
fn legacy_scenario_contact_open_hydrates_only_its_retained_data_ci_blob() {
    let temporary = tempdir().expect("temporary root");
    let root = temporary.path().join("project");
    let mut snapshot = ProjectSnapshot::new_authored(StableId("legacy-contact".into()));
    snapshot.campaign = Some(CampaignMetadata {
        name: "Scenario Folder".into(),
        version: String::new(),
        author: "Registered User".into(),
        creator_user_check: "Registered User".into(),
        contact: providence_core::model::CampaignContact::default(),
        contact_provenance: CampaignContactProvenance::LegacyUnhydrated,
        description: String::new(),
        splash_asset_id: String::new(),
        recommended_party_levels: 1,
        maximum_party_levels: 10,
        guidance_authored: false,
        restrictions: providence_core::model::CampaignRestrictions {
            description: String::new(),
            max_party_size: 6,
            max_level: 10,
            banned_races: Vec::new(),
            banned_castes: Vec::new(),
        },
    });
    let store = ProjectStore::create(&root, &snapshot).expect("create store");
    let bytes = legacy_contact_bytes();
    let blob = store.put_blob(&bytes).expect("store Data CI");
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data CI".into(),
        blob,
        byte_length: bytes.len() as u64,
    });
    let mut session = EditorSession::new(snapshot);

    let opened = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "scenario-contact.open",
        json!({}),
    )
    .expect("hydrate legacy contact projection");
    assert_eq!(opened["contact"]["title"], "Source Display Title");
    assert_eq!(opened["contact"]["author"], "Source Author");
    assert_eq!(opened["contact"]["description"], "Source description");
    assert_eq!(opened["provenance"], "legacy-unhydrated");
    assert_eq!(opened["sourcePresent"], true);
    assert_eq!(session.revision(), Revision(0));
}
use crate::demo::demo_snapshot;
use crate::dispatch_result;
use crate::dispatch_result_with_application;
use crate::dispatch_result_with_store;
use providence_core::model::CampaignContactProvenance;
use providence_core::model::CampaignMetadata;
use providence_core::model::ClassicSourceBlob;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::json;

fn contact_campaign_metadata() -> serde_json::Value {
    json!({
        "name": "Scenario Folder",
        "version": "1.0",
        "author": "Registered User",
        "contact": { "email": "", "web": "", "date": "", "fee": "" },
        "description": "Original description",
        "splashAssetId": "",
        "recommendedPartyLevels": 1,
        "maximumPartyLevels": 10,
        "guidanceAuthored": false,
        "restrictions": {
            "description": "",
            "maxPartySize": 6,
            "maxLevel": 10,
            "bannedRaces": [],
            "bannedCastes": []
        }
    })
}

fn restricted_campaign_metadata() -> serde_json::Value {
    json!({
        "name": "Scenario Folder",
        "version": "1.0",
        "author": "Registered User",
        "creatorUserCheck": "Registered User",
        "contact": { "email": "", "web": "", "date": "", "fee": "" },
        "description": "Original description",
        "splashAssetId": "",
        "recommendedPartyLevels": 3,
        "maximumPartyLevels": 12,
        "guidanceAuthored": true,
        "restrictions": {
            "description": "No necromancers beyond the west gate.",
            "maxPartySize": 5,
            "maxLevel": 9,
            "bannedRaces": ["classic.race.7"],
            "bannedCastes": ["classic.caste.12"]
        }
    })
}

fn legacy_contact_bytes() -> Vec<u8> {
    let mut bytes = vec![0_u8; providence_core::codecs::SCENARIO_CONTACT_INFO_BYTES];
    for (slot, value) in [
        (0, "Source Display Title"),
        (1, "2.4"),
        (2, "October 1999"),
        (3, "Source Author"),
        (4, "source@example.test"),
        (5, "https://example.test"),
        (6, "Free"),
        (17, "Source description"),
    ] {
        let encoded = value.as_bytes();
        let start = slot * 256;
        bytes[start] = encoded.len() as u8;
        bytes[start + 1..start + 1 + encoded.len()].copy_from_slice(encoded);
    }
    bytes
}

fn assert_startup_route(session: &mut EditorSession) -> serde_json::Value {
    let startup =
        dispatch_result_with_application(session, None, None, "scenario-startup.open", json!({}))
            .expect("open startup route");
    assert_eq!(startup["revision"], 2);
    assert_eq!(startup["startup"]["name"], "Scenario Folder");
    assert_eq!(startup["startup"]["recommendedPartyLevels"], 3);
    assert_eq!(startup["startLocation"]["map"], "land:0");
    assert_eq!(startup["startMapResolves"], true);
    assert!(startup["source"].is_null());
    startup
}
