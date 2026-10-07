use super::*;
use crate::classic_compilation::compile_project_classic_slice;
use crate::demo::demo_snapshot;
use crate::dispatch_result;
use providence_core::codecs::MAPSTATS_REFERENCE_BYTES;
use providence_core::codecs::decode_custom_landlook_mapstats;
use providence_core::model::ClassicSourceBlob;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::json;

#[test]
fn map_runtime_and_terrain_commands_expose_deterministic_compiler_inputs() {
    let mut session = EditorSession::new(demo_snapshot());
    set_random_level_runtime(&mut session);
    for (index, (tile, boat)) in [(0, 0), (3, 0), (7, 0), (60, 2), (147, 1)]
        .into_iter()
        .enumerate()
    {
        dispatch_result(
            &mut session,
            "terrain-profile.upsert",
            json!({
                "expectedRevision": index + 1,
                "profile": terrain_profile_json(tile, boat)
            }),
        )
        .expect("upsert terrain profile");
    }

    let inputs = dispatch_result(
        &mut session,
        "project.inspect-rebuilt-map-inputs",
        json!({}),
    )
    .expect("inspect map inputs");
    assert_eq!(inputs["maps"][0]["metadata"]["landlook"], 0);
    assert_eq!(
        inputs["terrainSets"][0]["tiles"].as_array().unwrap().len(),
        5
    );
    let world = dispatch_result(&mut session, "project.inspect-rebuilt-world", json!({}))
        .expect("inspect bounded world artifact");
    assert_world_summary(&world);
    let classification =
        dispatch_result(&mut session, "compatibility.classify", json!({})).unwrap();
    let codes = classification[1]["blockers"]
        .as_array()
        .unwrap()
        .iter()
        .map(|blocker| blocker["code"].as_str().unwrap())
        .collect::<Vec<_>>();
    assert!(!codes.iter().any(|code| code.contains("terrain-catalog")));
    assert!(!codes.iter().any(|code| code.contains("map-topology")));
    assert_eq!(session.revision(), Revision(6));
}

#[test]
fn scenario_application_command_exposes_exact_rebuilt_document() {
    let mut snapshot = demo_snapshot();
    snapshot.world.action_points[0]
        .actions
        .iter_mut()
        .find(|action| action.opcode() == 1)
        .expect("demo message action")
        .target_native_id = 12;
    snapshot.extra_action_points[0]
        .actions
        .retain(|action| action.opcode() != 92);
    let mut session = EditorSession::new(snapshot);
    let changed = dispatch_result(
        &mut session,
        "scenario-application.set",
        json!({
            "expectedRevision": 0,
            "contract": {
                "hooks": {
                    "startGame": "trigger:Data DD:0:17",
                    "partyDeath": null,
                    "endAdventure": null,
                    "shop": null,
                    "temple": null
                }
            }
        }),
    )
    .expect("set application contract");
    assert_eq!(changed["changedEntities"], json!(["ashen-crown"]));
    assert!(changed.get("snapshot").is_none());

    let scenario = dispatch_result(&mut session, "project.inspect-rebuilt-scenario", json!({}))
        .expect("inspect Rebuilt scenario document");
    assert_eq!(scenario["kind"], "realmz2.scenario");
    assert_eq!(scenario["schemaVersion"], 3);
    assert_eq!(
        scenario["applicationHooks"]["startGame"],
        "trigger:Data DD:0:17"
    );
    assert_eq!(scenario["programs"].as_array().unwrap().len(), 6);
    assert!(
        scenario["programs"]
            .as_array()
            .unwrap()
            .iter()
            .any(|program| {
                program["id"] == "simple:3:result:0"
                    && program["ownerKind"] == "simple-encounter-result"
            })
    );
    assert_eq!(scenario["scenarioActions"], json!([]));
    assert_eq!(session.revision(), Revision(1));
}

#[test]
fn custom_landlook_base_and_range_commands_return_bounded_projections() {
    let mut bytes = vec![0u8; MAPSTATS_REFERENCE_BYTES];
    let base =
        providence_core::codecs::MAPSTATS_RECORD_BYTES * providence_core::codecs::MAPSTATS_RECORDS;
    bytes[base..base + 2].copy_from_slice(&156_i16.to_be_bytes());
    bytes[base + 2..base + 4].copy_from_slice(&1_i16.to_be_bytes());
    let decoded = decode_custom_landlook_mapstats(
        &bytes,
        6,
        providence_core::model::BlobId(format!("sha256:{}", "a".repeat(64))),
    )
    .unwrap();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("custom-landlook-adapter".into()));
    snapshot.landlook_catalogs.push(decoded.catalog);
    snapshot.terrain_catalog = decoded.profiles;
    let mut session = EditorSession::new(snapshot);

    let base_result = dispatch_result(
        &mut session,
        "landlook-base.set",
        json!({
            "expectedRevision": 0,
            "landlook": 6,
            "baseTile": 191,
            "baseScale": 4
        }),
    )
    .unwrap();
    assert_eq!(base_result["changedEntities"], json!(["landlook:6"]));
    assert!(base_result.get("snapshot").is_none());

    let range_result = dispatch_result(
        &mut session,
        "landlook-range.set",
        json!({
            "expectedRevision": 1,
            "landlook": 6,
            "slot": 0,
            "firstTile": 62,
            "lastTile": 85
        }),
    )
    .unwrap();
    assert_eq!(
        range_result["changedEntities"],
        json!(["landlook:6:range:0"])
    );
    assert!(range_result.get("snapshot").is_none());
    assert_eq!(session.revision(), Revision(2));
}

#[test]
fn classic_compile_refuses_inconsistent_custom_landlook_source_provenance() {
    let temporary = tempfile::tempdir().expect("temporary directory");
    let project_root = temporary.path().join("project");
    let mut snapshot = ProjectSnapshot::new_authored(StableId("custom-landlook-provenance".into()));
    let store = ProjectStore::create(&project_root, &snapshot).expect("create project store");

    let retained_bytes = vec![0u8; MAPSTATS_REFERENCE_BYTES];
    let retained_blob = store
        .put_blob(&retained_bytes)
        .expect("store retained source");
    let mut attributed_bytes = retained_bytes.clone();
    attributed_bytes[MAPSTATS_REFERENCE_BYTES - 1] = 1;
    let attributed_blob = store
        .put_blob(&attributed_bytes)
        .expect("store attributed source");
    let decoded = decode_custom_landlook_mapstats(&attributed_bytes, 6, attributed_blob)
        .expect("decode attributed custom landlook");

    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data Custom 1 BD".into(),
        blob: retained_blob,
        byte_length: MAPSTATS_REFERENCE_BYTES as u64,
    });
    snapshot.landlook_catalogs.push(decoded.catalog);
    snapshot.terrain_catalog = decoded.profiles;
    let session = EditorSession::new(snapshot);
    let output = temporary.path().join("output");

    let error = compile_project_classic_slice(&session, &store, json!({"directory": output}))
        .expect_err("mismatched source attribution must be refused");

    assert!(error.contains("inconsistent source provenance"));
    assert!(!temporary.path().join("output").exists());
}

fn assert_world_summary(world: &serde_json::Value) {
    assert_eq!(world["kind"], "realmz2.world");
    assert_eq!(world["schemaVersion"], 3);
    assert_eq!(world["counts"]["maps"], 1);
    assert_eq!(world["counts"]["cells"], 8_100);
    assert_eq!(world["counts"]["triggers"], 1);
    assert!(world["canonicalBytes"].as_u64().unwrap() > 0);
    assert_eq!(world["sha256"].as_str().unwrap().len(), 64);
    assert_eq!(world["intentionalEmptySections"], json!([]));
    assert!(world.get("maps").is_none());
}

fn set_random_level_runtime(session: &mut EditorSession) {
    dispatch_result(
        session,
        "map-runtime.set",
        json!({
            "expectedRevision": 0,
            "identity": "land:0",
            "metadata": {
                "source": "synthetic random-level fixture",
                "sourceBlob": null,
                "dark": false,
                "usesLos": true,
                "landlook": 0,
                "baseScale": 1,
                "tilesetId": "classic.landlook.0",
                "baseTile": 0,
                "randomRectangles": []
            }
        }),
    )
    .expect("set map runtime metadata");
}
