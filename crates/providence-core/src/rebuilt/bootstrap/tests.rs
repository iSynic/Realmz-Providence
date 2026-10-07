use super::*;
use crate::model::{CampaignContact, MapCoordinate};
#[test]
fn bootstrap_projection_matches_the_pinned_schema_v3_field_shape() {
    let snapshot = configured_snapshot();

    let projection = project_rebuilt_v3_bootstrap(&snapshot).expect("configured bootstrap");
    let first = serde_json::to_string(&projection).expect("serialize projection");
    let second =
        serde_json::to_string(&project_rebuilt_v3_bootstrap(&snapshot).expect("repeat projection"))
            .expect("serialize repeated projection");
    assert_eq!(first, second);
    let value = serde_json::to_value(&projection).expect("projection JSON");
    assert_eq!(value["campaign"]["id"], "ashen-crown");
    assert_eq!(value["campaign"]["recommendedPartyLevels"], 4);
    assert_eq!(value["campaign"]["restrictions"]["maxPartySize"], 6);
    assert_eq!(value["start"]["mapId"], "land:0");
    assert_eq!(value["start"]["x"], 18);
    assert_eq!(value["start"]["y"], 23);

    let reopened: RebuiltV3Bootstrap = serde_json::from_str(&first).expect("reimport");
    assert_eq!(reopened, projection);
}

#[test]
fn campaign_projection_remains_available_without_a_complete_startup() {
    let mut snapshot = configured_snapshot();
    snapshot.start_location = None;
    assert!(project_rebuilt_v3_bootstrap(&snapshot).is_none());
    assert!(project_rebuilt_v3_campaign(&snapshot).is_some());
    let mut snapshot = configured_snapshot();
    snapshot.campaign = None;
    assert!(project_rebuilt_v3_bootstrap(&snapshot).is_none());
    assert!(project_rebuilt_v3_campaign(&snapshot).is_none());
}

fn configured_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("ashen-crown".into()));
    snapshot.campaign = Some(CampaignMetadata {
        name: "The Ashen Crown".into(),
        version: "1.0".into(),
        author: "A. Cartographer".into(),
        creator_user_check: String::new(),
        contact: CampaignContact {
            title: "The Ashen Crown".into(),
            email: "keeper@example.invalid".into(),
            web: String::new(),
            date: "2026-09-01".into(),
            fee: String::new(),
        },
        contact_provenance: crate::model::CampaignContactProvenance::Authored,
        description: "Hold the western coast.".into(),
        splash_asset_id: String::new(),
        recommended_party_levels: 4,
        maximum_party_levels: 8,
        guidance_authored: true,
        restrictions: CampaignRestrictions {
            description: "No evil-aligned castes.".into(),
            max_party_size: 6,
            max_level: 8,
            banned_races: vec![StableId("classic.race.12".into())],
            banned_castes: Vec::new(),
        },
    });
    snapshot.start_location = Some(StartLocation {
        map: StableId("land:0".into()),
        coordinate: MapCoordinate { x: 18, y: 23 },
    });

    snapshot
}
