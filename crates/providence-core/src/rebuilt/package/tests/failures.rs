use super::*;

#[test]
fn bootstrap_and_campaign_failures_precede_compiler_and_file_failures() {
    let mut project = snapshot();
    let mut identity = compiler();
    identity.version.clear();
    project.project_id = StableId("not/a/component".into());
    project.campaign.as_mut().unwrap().name = " ".into();
    project.start_location = None;
    let capabilities = ["unknown".into()];
    assert_eq!(
        compile_rebuilt_v3_manifest(&project, &identity, &capabilities, &[]),
        Err(RebuiltV3ManifestError::MissingBootstrap)
    );
    project.start_location = snapshot().start_location;
    assert_eq!(
        compile_rebuilt_v3_manifest(&project, &identity, &capabilities, &[]),
        Err(RebuiltV3ManifestError::InvalidCampaignId(
            project.project_id.clone()
        ))
    );
    project.project_id = snapshot().project_id;
    assert_eq!(
        compile_rebuilt_v3_manifest(&project, &identity, &capabilities, &[]),
        Err(RebuiltV3ManifestError::InvalidCampaignName)
    );
    project.campaign = snapshot().campaign;
    assert_eq!(
        compile_rebuilt_v3_manifest(&project, &identity, &capabilities, &[]),
        Err(RebuiltV3ManifestError::InvalidCompilerMetadata)
    );
    assert_eq!(
        compile_rebuilt_v3_manifest(&project, &compiler(), &capabilities, &[]),
        Err(RebuiltV3ManifestError::UnsupportedCapability(
            "unknown".into()
        ))
    );
}

#[test]
fn input_errors_precede_missing_documents_in_input_order() {
    let invalid = [RebuiltV3FileInput {
        path: "invalid",
        bytes: &[],
    }];
    assert_eq!(
        compile_rebuilt_v3_manifest(&snapshot(), &compiler(), &[], &invalid),
        Err(RebuiltV3ManifestError::InvalidPath("invalid".into()))
    );
    let input = RebuiltV3FileInput {
        path: "content.json",
        bytes: CONTENT,
    };
    let duplicate = [input.clone(), input];
    assert_eq!(
        compile_rebuilt_v3_manifest(&snapshot(), &compiler(), &[], &duplicate),
        Err(RebuiltV3ManifestError::DuplicatePath("content.json".into()))
    );
    let path = format!("assets/media/{}.png", "0".repeat(64));
    let inputs = [RebuiltV3FileInput {
        path: &path,
        bytes: b"payload",
    }];
    assert_eq!(
        compile_rebuilt_v3_manifest(&snapshot(), &compiler(), &[], &inputs),
        Err(RebuiltV3ManifestError::MediaHashMismatch {
            path: path.clone(),
            actual: sha256_hex(b"payload")
        })
    );
}

#[test]
fn v5_migration_retains_imported_contract_and_rejects_unowned_schema_first() {
    let mut project = snapshot();
    project.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId("sha256:retained-source".into()),
    };
    let initial = compile_rebuilt_v5_manifest(&project, &compiler(), &[], &documents()).unwrap();
    let rebuilt = recompile_rebuilt_manifest(&initial.manifest, &compiler(), &documents()).unwrap();
    assert_eq!(initial, rebuilt);
    assert_eq!(
        compile_rebuilt_v5_manifest(&snapshot(), &compiler(), &[], &[]),
        Err(RebuiltV3ManifestError::SchemaV4RequiresImportedOrigin)
    );
    assert_eq!(
        recompile_rebuilt_v3_manifest(&initial.manifest, &compiler(), &[]),
        Err(RebuiltV3ManifestError::UnsupportedSchemaContract {
            version: 5,
            hash: REBUILT_V5_SCHEMA_SHA256.into()
        })
    );
    let mut source = initial.manifest;
    source.compiler.project_origin = "authored".into();
    source.campaign_id = StableId("invalid/id".into());
    assert_eq!(
        recompile_rebuilt_manifest(&source, &compiler(), &[]),
        Err(RebuiltV3ManifestError::UnsupportedSchemaContract {
            version: 5,
            hash: REBUILT_V5_SCHEMA_SHA256.into()
        })
    );
}

#[test]
fn migration_retains_source_provenance_and_updates_only_compiler_identity() {
    let mut source = compile_rebuilt_v3_manifest(&snapshot(), &compiler(), &[], &documents())
        .unwrap()
        .manifest;
    source.compiler.project_schema_version = 17;
    source.compiler.project_origin = "imported".into();
    source.engine.rules_version = "source-rules".into();
    let mut identity = compiler();
    identity.version = "new-version".into();
    identity.commit = "new-commit".into();
    identity.minimum_engine_version = "new-engine".into();
    let revised = recompile_rebuilt_manifest(&source, &identity, &documents())
        .unwrap()
        .manifest;
    assert_eq!(revised.campaign_id, source.campaign_id);
    assert_eq!(revised.name, source.name);
    assert_eq!(revised.start, source.start);
    assert_eq!(revised.compiler.project_schema_version, 17);
    assert_eq!(revised.compiler.project_origin, "imported");
    assert_eq!(revised.engine.rules_version, "source-rules");
    assert_eq!(revised.compiler.version, identity.version);
    assert_eq!(revised.compiler.commit, identity.commit);
    assert_eq!(
        revised.engine.minimum_version,
        identity.minimum_engine_version
    );
    assert_eq!(revised.content_id, source.content_id);
    assert_ne!(revised.package_hash, source.package_hash);
}

#[test]
fn added_media_changes_package_integrity_without_changing_document_content_id() {
    let base = compile_rebuilt_v3_manifest(&snapshot(), &compiler(), &[], &documents()).unwrap();
    let path = format!("assets/media/{}.png", sha256_hex(b"media"));
    let mut inputs = documents();
    inputs.push(RebuiltV3FileInput {
        path: &path,
        bytes: b"media",
    });
    let media = compile_rebuilt_v3_manifest(&snapshot(), &compiler(), &[], &inputs).unwrap();
    assert_eq!(media.manifest.content_id, base.manifest.content_id);
    assert_ne!(media.manifest.package_hash, base.manifest.package_hash);
    let mut reversed = inputs;
    reversed.reverse();
    assert_eq!(
        compile_rebuilt_v3_manifest(&snapshot(), &compiler(), &[], &reversed).unwrap(),
        media
    );
}
