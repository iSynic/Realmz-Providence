use super::*;
use providence_core::{
    model::{
        CampaignContact, CampaignMetadata, CampaignRestrictions, MapCoordinate, ProjectSnapshot,
        StableId, StartLocation,
    },
    rebuilt::{RebuiltV3CompilerIdentity, RebuiltV3ManifestArtifact, compile_rebuilt_v3_manifest},
};
use serde_json::json;

pub(super) fn snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("archive-fixture".into()));
    snapshot.campaign = Some(CampaignMetadata {
        name: "Archive Fixture".into(),
        version: "1.0".into(),
        author: "Providence".into(),
        creator_user_check: String::new(),
        contact: CampaignContact::default(),
        contact_provenance: providence_core::model::CampaignContactProvenance::Authored,
        description: String::new(),
        splash_asset_id: String::new(),
        recommended_party_levels: 1,
        maximum_party_levels: 1,
        guidance_authored: true,
        restrictions: CampaignRestrictions {
            description: String::new(),
            max_party_size: 6,
            max_level: 1,
            banned_races: Vec::new(),
            banned_castes: Vec::new(),
        },
    });
    snapshot.start_location = Some(StartLocation {
        map: StableId("land:0".into()),
        coordinate: MapCoordinate { x: 0, y: 0 },
    });
    snapshot
}

pub(super) fn files<'a>(documents: &'a [(&'a str, &'a [u8]); 4]) -> Vec<RebuiltV3FileInput<'a>> {
    documents
        .iter()
        .map(|(path, bytes)| RebuiltV3FileInput { path, bytes })
        .collect()
}

pub(super) fn fixture_manifest(files: &[RebuiltV3FileInput<'_>]) -> RebuiltV3ManifestArtifact {
    compile_rebuilt_v3_manifest(
        &snapshot(),
        &RebuiltV3CompilerIdentity {
            version: "0.1.0".into(),
            commit: "controlled-commit".into(),
            minimum_engine_version: "0.1.0".into(),
        },
        &["realmz.world.topology-v2".into()],
        files,
    )
    .expect("manifest")
}

pub(super) fn compiler() -> RebuiltV3CompilerIdentity {
    RebuiltV3CompilerIdentity {
        version: "0.1.0".into(),
        commit: "controlled-commit".into(),
        minimum_engine_version: "0.1.0".into(),
    }
}

pub(super) fn reimportable_documents() -> Vec<(String, Vec<u8>)> {
    let content = content_document();
    let world = world_document();
    let scenario = scenario_document();
    let assets = assets_document();
    [
        ("content.json", content),
        ("world.json", world),
        ("scenario.json", scenario),
        ("assets/index.json", assets),
    ]
    .into_iter()
    .map(|(path, value)| (path.into(), serde_json::to_vec(&value).unwrap()))
    .collect()
}

pub(super) fn borrowed_files(documents: &[(String, Vec<u8>)]) -> Vec<RebuiltV3FileInput<'_>> {
    documents
        .iter()
        .map(|(path, bytes)| RebuiltV3FileInput { path, bytes })
        .collect()
}

fn campaign() -> Value {
    json!({
        "id": "archive-fixture",
        "name": "Archive Fixture",
        "version": "1.0",
        "author": "Providence",
        "contact": { "email": "", "web": "", "date": "", "fee": "" },
        "description": "",
        "splashAssetId": "",
        "recommendedPartyLevels": 1,
        "maximumPartyLevels": 1,
        "guidanceAuthored": true,
        "restrictions": {
            "description": "",
            "maxPartySize": 6,
            "maxLevel": 1,
            "bannedRaces": [],
            "bannedCastes": []
        }
    })
}

fn content_document() -> Value {
    json!({
        "kind": "realmz2.content",
        "schemaVersion": 3,
        "campaign": campaign(),
        "messages": [],
        "optionLabels": [],
        "battles": [],
        "monsters": [],
        "monsterSets": [],
        "monsterDescriptions": [],
        "items": [],
        "itemTexts": [],
        "treasures": [],
        "shops": [],
        "simpleEncounters": [],
        "complexEncounters": [],
        "thiefEncounters": [],
        "timedEncounters": [],
        "spells": [],
        "races": [],
        "castes": []
    })
}

fn world_document() -> Value {
    json!({
        "kind": "realmz2.world",
        "schemaVersion": 3,
        "battleTerrainSets": [],
        "maps": [{
            "id": "land:0",
            "name": "Archive Map",
            "levelType": "land",
            "levelIndex": 0,
            "width": 1,
            "height": 1,
            "metadata": {
                "dark": false,
                "usesLos": false,
                "landlook": 0,
                "baseScale": 1,
                "battleTerrainSetId": null
            },
            "topologyFormat": "realmz2.compact-cell-rows.v2",
            "cells": [],
            "boatReplacementProfiles": null,
            "randomRectangles": []
        }],
        "playerMaps": [],
        "triggers": [],
        "transitions": [],
        "landLayout": null,
        "timedEncounters": []
    })
}

fn scenario_document() -> Value {
    json!({
        "kind": "realmz2.scenario",
        "schemaVersion": 3,
        "applicationHooks": {
            "startGame": null,
            "partyDeath": null,
            "endAdventure": null,
            "shop": null,
            "temple": null
        },
        "programs": [],
        "scenarioActions": [],
        "stateDefinitions": [],
        "migrations": []
    })
}

fn assets_document() -> Value {
    json!({
        "kind": "realmz2.assets",
        "schemaVersion": 3,
        "assets": []
    })
}
