use super::super::canonical::canonical_json_bytes;
use super::integrity::sha256_hex;
use super::*;
use crate::model::{
    BlobId, CampaignContact, CampaignMetadata, CampaignRestrictions, MapCoordinate, StableId,
    StartLocation,
};

mod failures;

const CONTENT: &[u8] = br#"{"kind":"realmz2.content"}"#;
const WORLD: &[u8] = br#"{"kind":"realmz2.world"}"#;
const SCENARIO: &[u8] = br#"{"kind":"realmz2.scenario"}"#;
const ASSETS: &[u8] = br#"{"kind":"realmz2.assets"}"#;

fn snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("manifest-fixture".into()));
    // Keep the hash vector independent of subsequent portable snapshot migrations.
    snapshot.format_version = 35;
    snapshot.campaign = Some(CampaignMetadata {
        name: "The Ashen Crown".into(),
        version: "1.0".into(),
        author: "A. Cartographer".into(),
        creator_user_check: String::new(),
        contact: CampaignContact::default(),
        contact_provenance: crate::model::CampaignContactProvenance::Authored,
        description: String::new(),
        splash_asset_id: String::new(),
        recommended_party_levels: 4,
        maximum_party_levels: 8,
        guidance_authored: true,
        restrictions: CampaignRestrictions {
            description: String::new(),
            max_party_size: 6,
            max_level: 20,
            banned_races: Vec::new(),
            banned_castes: Vec::new(),
        },
    });
    snapshot.start_location = Some(StartLocation {
        map: StableId("land-0".into()),
        coordinate: MapCoordinate { x: 2, y: 3 },
    });
    snapshot
}

fn compiler() -> RebuiltV3CompilerIdentity {
    RebuiltV3CompilerIdentity {
        version: "0.1.0".into(),
        commit: "controlled-commit".into(),
        minimum_engine_version: "0.1.0".into(),
    }
}

fn documents() -> Vec<RebuiltV3FileInput<'static>> {
    vec![
        RebuiltV3FileInput {
            path: "scenario.json",
            bytes: SCENARIO,
        },
        RebuiltV3FileInput {
            path: "assets/index.json",
            bytes: ASSETS,
        },
        RebuiltV3FileInput {
            path: "content.json",
            bytes: CONTENT,
        },
        RebuiltV3FileInput {
            path: "world.json",
            bytes: WORLD,
        },
    ]
}

#[test]
fn manifest_matches_runtime_hash_contract_and_is_input_order_independent() {
    let capabilities = vec![
        "realmz.world.topology-v2".into(),
        "realmz.core.classic-rules-v1".into(),
    ];
    let first =
        compile_rebuilt_v3_manifest(&snapshot(), &compiler(), &capabilities, &documents()).unwrap();
    let mut reversed = documents();
    reversed.reverse();
    let second =
        compile_rebuilt_v3_manifest(&snapshot(), &compiler(), &capabilities, &reversed).unwrap();
    assert_eq!(first, second);
    assert_eq!(first.manifest.format_version, 2);
    assert_eq!(first.manifest.schema_version, 3);
    assert_eq!(first.manifest.schema_hash, REBUILT_V3_SCHEMA_SHA256);
    assert_eq!(
        first.manifest.capabilities,
        ["realmz.core.classic-rules-v1", "realmz.world.topology-v2"]
    );
    assert_eq!(first.manifest.compiler.project_origin, "authored");
    assert_eq!(first.manifest.files.len(), 4);
    assert_eq!(
        first.manifest.content_id,
        "f4e7ddbe576fd252721998b8687bcd99e39dff04b9e3431728d4c7ff4d070c30"
    );
    assert_eq!(
        first.manifest.package_hash,
        "69882d54c55977aae0ff5b2a06e482b17a1d87d7b5d498acde4d34dfffa96655"
    );

    let mut value: serde_json::Value = serde_json::from_slice(&first.canonical_json).unwrap();
    assert_eq!(value.as_object().unwrap().len(), 14);
    value.as_object_mut().unwrap().remove("packageHash");
    assert_eq!(
        sha256_hex(&canonical_json_bytes(&value).unwrap()),
        first.manifest.package_hash
    );
}

#[test]
fn v4_schema_hash_matches_its_mirror_and_manifest_is_import_only() {
    let v5_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../contracts/realmz2/realmz2-package-v5.schema.json");
    assert_eq!(
        sha256_hex(&std::fs::read(&v5_path).unwrap()),
        REBUILT_V5_SCHEMA_SHA256
    );
    assert_eq!(
        std::fs::read_to_string(v5_path.with_extension("sha256"))
            .unwrap()
            .trim(),
        REBUILT_V5_SCHEMA_SHA256
    );
    let schema_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../contracts/realmz2/realmz2-package-v4.schema.json");
    let hash_path = schema_path.with_file_name("realmz2-package-v4.schema.sha256");
    let schema = std::fs::read(schema_path).expect("v4 schema file");
    let expected = std::fs::read_to_string(hash_path).expect("v4 schema hash mirror");
    assert_eq!(sha256_hex(&schema), REBUILT_V4_SCHEMA_SHA256);
    assert_eq!(expected.trim(), REBUILT_V4_SCHEMA_SHA256);

    let mut imported = snapshot();
    imported.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    let manifest = compile_rebuilt_v4_manifest(&imported, &compiler(), &[], &documents())
        .expect("imported v4 manifest");
    assert_eq!(manifest.manifest.schema_version, 4);
    assert_eq!(manifest.manifest.schema_hash, REBUILT_V4_SCHEMA_SHA256);
    assert_eq!(
        compile_rebuilt_v4_manifest(&snapshot(), &compiler(), &[], &documents()),
        Err(RebuiltV3ManifestError::SchemaV4RequiresImportedOrigin)
    );
}

#[test]
fn package_recompile_preserves_v3_and_v4_contract_identity() {
    let mut imported = snapshot();
    imported.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    let v3 = compile_rebuilt_v3_manifest(&snapshot(), &compiler(), &[], &documents()).unwrap();
    let rebuilt_v3 = recompile_rebuilt_manifest(&v3.manifest, &compiler(), &documents()).unwrap();
    assert_eq!(rebuilt_v3.manifest.schema_version, 3);
    assert_eq!(rebuilt_v3.manifest.schema_hash, REBUILT_V3_SCHEMA_SHA256);

    let v4 = compile_rebuilt_v4_manifest(&imported, &compiler(), &[], &documents()).unwrap();
    let rebuilt_v4 = recompile_rebuilt_manifest(&v4.manifest, &compiler(), &documents()).unwrap();
    assert_eq!(rebuilt_v4.manifest.schema_version, 4);
    assert_eq!(rebuilt_v4.manifest.schema_hash, REBUILT_V4_SCHEMA_SHA256);
    assert_eq!(rebuilt_v4.manifest.compiler.project_origin, "imported");
}

#[test]
fn manifest_refuses_missing_duplicate_or_unowned_paths() {
    let missing = &documents()[..3];
    assert_eq!(
        compile_rebuilt_v3_manifest(&snapshot(), &compiler(), &[], missing),
        Err(RebuiltV3ManifestError::MissingDocument("world.json"))
    );

    let mut duplicate = documents();
    duplicate.push(RebuiltV3FileInput {
        path: "content.json",
        bytes: CONTENT,
    });
    assert_eq!(
        compile_rebuilt_v3_manifest(&snapshot(), &compiler(), &[], &duplicate),
        Err(RebuiltV3ManifestError::DuplicatePath("content.json".into()))
    );

    let mut invalid = documents();
    invalid.push(RebuiltV3FileInput {
        path: "notes.txt",
        bytes: b"not a package input",
    });
    assert_eq!(
        compile_rebuilt_v3_manifest(&snapshot(), &compiler(), &[], &invalid),
        Err(RebuiltV3ManifestError::InvalidPath("notes.txt".into()))
    );
}

#[test]
fn media_path_must_match_the_exact_payload_digest() {
    let payload = b"payload";
    let valid_path = format!("assets/media/{}.png", sha256_hex(payload));
    let mut valid = documents();
    valid.push(RebuiltV3FileInput {
        path: &valid_path,
        bytes: payload,
    });
    let compiled = compile_rebuilt_v3_manifest(&snapshot(), &compiler(), &[], &valid).unwrap();
    assert_eq!(compiled.manifest.files[&valid_path].bytes, 7);

    let mut inputs = documents();
    inputs.push(RebuiltV3FileInput {
        path: "assets/media/0000000000000000000000000000000000000000000000000000000000000000.png",
        bytes: b"payload",
    });
    assert!(matches!(
        compile_rebuilt_v3_manifest(&snapshot(), &compiler(), &[], &inputs),
        Err(RebuiltV3ManifestError::MediaHashMismatch { .. })
    ));
}

#[test]
fn capabilities_must_be_known_and_unique() {
    let unknown = vec!["realmz.future.unowned-v1".into()];
    assert_eq!(
        compile_rebuilt_v3_manifest(&snapshot(), &compiler(), &unknown, &documents()),
        Err(RebuiltV3ManifestError::UnsupportedCapability(
            "realmz.future.unowned-v1".into()
        ))
    );
    let duplicate = vec![
        "realmz.world.topology-v2".into(),
        "realmz.world.topology-v2".into(),
    ];
    assert_eq!(
        compile_rebuilt_v3_manifest(&snapshot(), &compiler(), &duplicate, &documents()),
        Err(RebuiltV3ManifestError::DuplicateCapability(
            "realmz.world.topology-v2".into()
        ))
    );
}

#[test]
fn imported_origin_never_leaks_compatibility_annex_identity() {
    let annex = "sha256:private-compatibility-annex";
    let mut imported = snapshot();
    imported.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(annex.into()),
    };

    let compiled = compile_rebuilt_v3_manifest(&imported, &compiler(), &[], &documents()).unwrap();
    assert_eq!(compiled.manifest.compiler.project_origin, "imported");
    assert!(
        !String::from_utf8(compiled.canonical_json)
            .unwrap()
            .contains(annex)
    );
}
