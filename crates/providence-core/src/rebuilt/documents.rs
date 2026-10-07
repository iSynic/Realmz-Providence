use std::collections::{BTreeMap, BTreeSet};

use sha2::{Digest, Sha256};

use crate::model::{ProjectOrigin, ProjectSnapshot};

use super::{
    ApplicationMediaCatalog, RebuiltV3AssetError, RebuiltV3AssetIndex, RebuiltV3CompilerIdentity,
    RebuiltV3ContentArtifact, RebuiltV3ContentError, RebuiltV3FileInput, RebuiltV3ManifestArtifact,
    RebuiltV3ManifestError, RebuiltV3ReachableMediaError, RebuiltV3ReachableRuntimeError,
    RebuiltV3ScenarioDocument, RebuiltV3ScenarioError, RebuiltV3WorldArtifact, RebuiltV3WorldError,
    canonical::canonical_json_bytes, compile_rebuilt_v3_content, compile_rebuilt_v3_manifest,
    compile_rebuilt_v3_reachable_content, compile_rebuilt_v3_reachable_world_with_application,
    compile_rebuilt_v3_world, compile_rebuilt_v4_manifest, compile_rebuilt_v5_manifest,
    imported_extra_code_tail, imported_requires_rebuilt_v4,
    is_missing_imported_presentation_reference, project_rebuilt_v3_asset_index,
    project_rebuilt_v3_reachable_media_with_application, project_rebuilt_v3_reachable_runtime,
    project_rebuilt_v3_scenario,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RebuiltV3DocumentSetArtifact {
    pub content: RebuiltV3ContentArtifact,
    pub world: RebuiltV3WorldArtifact,
    pub scenario_json: Vec<u8>,
    pub asset_index_json: Vec<u8>,
    pub manifest: RebuiltV3ManifestArtifact,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3DocumentSetError {
    Content(RebuiltV3ContentError),
    World(RebuiltV3WorldError),
    Scenario(RebuiltV3ScenarioError),
    Assets(RebuiltV3AssetError),
    Runtime(RebuiltV3ReachableRuntimeError),
    Media(RebuiltV3ReachableMediaError),
    ConflictingMediaDeclaration(String),
    DuplicateMediaPayload(String),
    UnexpectedMediaPayload(String),
    MissingMediaPayload(String),
    MediaLengthMismatch {
        path: String,
        expected: u64,
        actual: u64,
    },
    MediaHashMismatch {
        path: String,
        expected: String,
        actual: String,
    },
    Serialization(String),
    Manifest(RebuiltV3ManifestError),
}

impl std::fmt::Display for RebuiltV3DocumentSetError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Content(error) => write!(formatter, "content.json is invalid: {error}"),
            Self::World(error) => write!(formatter, "world.json is invalid: {error}"),
            Self::Scenario(error) => write!(formatter, "scenario.json is invalid: {error}"),
            Self::Assets(error) => write!(formatter, "assets/index.json is invalid: {error}"),
            Self::Runtime(error) => write!(formatter, "runtime selection is invalid: {error}"),
            Self::Media(error) => write!(formatter, "runtime media selection is invalid: {error}"),
            Self::ConflictingMediaDeclaration(path) => write!(
                formatter,
                "assets/index.json declares conflicting metadata for media path '{path}'"
            ),
            Self::DuplicateMediaPayload(path) => {
                write!(formatter, "media payload path '{path}' is duplicated")
            }
            Self::UnexpectedMediaPayload(path) => write!(
                formatter,
                "media payload path '{path}' is not owned by assets/index.json"
            ),
            Self::MissingMediaPayload(path) => write!(
                formatter,
                "assets/index.json references unavailable media payload '{path}'"
            ),
            Self::MediaLengthMismatch {
                path,
                expected,
                actual,
            } => write!(
                formatter,
                "media payload '{path}' has {actual} bytes; assets/index.json declares {expected}"
            ),
            Self::MediaHashMismatch {
                path,
                expected,
                actual,
            } => write!(
                formatter,
                "media payload '{path}' has SHA-256 {actual}; assets/index.json declares {expected}"
            ),
            Self::Serialization(reason) => {
                write!(formatter, "package document serialization failed: {reason}")
            }
            Self::Manifest(error) => write!(formatter, "manifest.json is invalid: {error}"),
        }
    }
}

impl std::error::Error for RebuiltV3DocumentSetError {}

pub fn compile_rebuilt_v3_document_set(
    snapshot: &ProjectSnapshot,
    compiler_identity: &RebuiltV3CompilerIdentity,
    media_payloads: &[RebuiltV3FileInput<'_>],
) -> Result<RebuiltV3DocumentSetArtifact, RebuiltV3DocumentSetError> {
    if imported_requires_rebuilt_v4(snapshot) || imported_extra_code_tail(snapshot).is_some() {
        let runtime = project_rebuilt_v3_reachable_runtime(snapshot)
            .map_err(RebuiltV3DocumentSetError::Runtime)?;
        let content = compile_rebuilt_v3_reachable_content(snapshot, &runtime)
            .map_err(RebuiltV3DocumentSetError::Content)?;
        let world = super::compile_rebuilt_v3_reachable_world(snapshot, &runtime)
            .map_err(RebuiltV3DocumentSetError::World)?;
        let scenario = runtime.scenario;
        let asset_index =
            project_rebuilt_v3_asset_index(snapshot).map_err(RebuiltV3DocumentSetError::Assets)?;
        return assemble_rebuilt_v3_document_set(
            snapshot,
            compiler_identity,
            media_payloads,
            content,
            world,
            scenario,
            asset_index,
            true,
        );
    }
    let content =
        compile_rebuilt_v3_content(snapshot).map_err(RebuiltV3DocumentSetError::Content)?;
    let world = compile_rebuilt_v3_world(snapshot).map_err(RebuiltV3DocumentSetError::World)?;
    let scenario =
        project_rebuilt_v3_scenario(snapshot).map_err(RebuiltV3DocumentSetError::Scenario)?;
    let asset_index =
        project_rebuilt_v3_asset_index(snapshot).map_err(RebuiltV3DocumentSetError::Assets)?;
    assemble_rebuilt_v3_document_set(
        snapshot,
        compiler_identity,
        media_payloads,
        content,
        world,
        scenario,
        asset_index,
        crate::compatibility::imported_start_location_requires_deferred_capability(snapshot),
    )
}

pub fn compile_rebuilt_v3_document_set_with_application(
    snapshot: &ProjectSnapshot,
    application_media: &ApplicationMediaCatalog,
    compiler_identity: &RebuiltV3CompilerIdentity,
    media_payloads: &[RebuiltV3FileInput<'_>],
) -> Result<RebuiltV3DocumentSetArtifact, RebuiltV3DocumentSetError> {
    compile_document_set_with_rules(
        snapshot,
        application_media,
        compiler_identity,
        media_payloads,
        None,
    )
}

pub fn compile_rebuilt_document_set_with_selected_rules(
    selection: &super::ResolvedClassicRules,
    application_media: &ApplicationMediaCatalog,
    compiler_identity: &RebuiltV3CompilerIdentity,
    media_payloads: &[RebuiltV3FileInput<'_>],
) -> Result<RebuiltV3DocumentSetArtifact, RebuiltV3DocumentSetError> {
    compile_document_set_with_rules(
        &selection.effective_snapshot,
        application_media,
        compiler_identity,
        media_payloads,
        Some(&selection.runtime_overrides),
    )
}

fn compile_document_set_with_rules(
    snapshot: &ProjectSnapshot,
    application_media: &ApplicationMediaCatalog,
    compiler_identity: &RebuiltV3CompilerIdentity,
    media_payloads: &[RebuiltV3FileInput<'_>],
    rules: Option<&super::RebuiltV3RuleCatalog>,
) -> Result<RebuiltV3DocumentSetArtifact, RebuiltV3DocumentSetError> {
    let runtime = project_rebuilt_v3_reachable_runtime(snapshot)
        .map_err(RebuiltV3DocumentSetError::Runtime)?;
    let media = project_rebuilt_v3_reachable_media_with_application(
        snapshot,
        application_media,
        &runtime.scenario,
        &runtime.item_spells.items,
        &runtime.item_spells.spells,
        runtime.combat.all_monsters(),
        &runtime.rogue_encounters,
        !runtime.combat.battles.is_empty(),
    )
    .map_err(RebuiltV3DocumentSetError::Media)?;
    let missing_monster_media = media
        .references
        .iter()
        .filter(|reference| is_missing_imported_presentation_reference(reference))
        .cloned()
        .collect::<Vec<_>>();
    if !missing_monster_media.is_empty()
        && !matches!(snapshot.origin, ProjectOrigin::Imported { .. })
    {
        return Err(RebuiltV3DocumentSetError::Media(
            RebuiltV3ReachableMediaError::UnresolvedRequired(missing_monster_media),
        ));
    }
    let mut content = compile_rebuilt_v3_reachable_content(snapshot, &runtime)
        .map_err(RebuiltV3DocumentSetError::Content)?;
    if let Some(rules) = rules {
        content.document.races = rules.races.clone();
        content.document.castes = rules.castes.clone();
        content =
            super::content::compile_content_artifact(content.document, content.monster_omissions)
                .map_err(RebuiltV3DocumentSetError::Content)?;
    }
    let world =
        compile_rebuilt_v3_reachable_world_with_application(snapshot, application_media, &runtime)
            .map_err(RebuiltV3DocumentSetError::World)?;
    assemble_rebuilt_v3_document_set(
        snapshot,
        compiler_identity,
        media_payloads,
        content,
        world,
        runtime.scenario,
        media.assets,
        !runtime.deferred_references.is_empty()
            || !missing_monster_media.is_empty()
            || crate::compatibility::imported_start_location_requires_deferred_capability(snapshot),
    )
}

#[allow(clippy::too_many_arguments)]
fn assemble_rebuilt_v3_document_set(
    snapshot: &ProjectSnapshot,
    compiler_identity: &RebuiltV3CompilerIdentity,
    media_payloads: &[RebuiltV3FileInput<'_>],
    mut content: RebuiltV3ContentArtifact,
    mut world: RebuiltV3WorldArtifact,
    mut scenario: RebuiltV3ScenarioDocument,
    mut asset_index: RebuiltV3AssetIndex,
    has_deferred_references: bool,
) -> Result<RebuiltV3DocumentSetArtifact, RebuiltV3DocumentSetError> {
    let schema_version = if scenario.extra_code_tail.is_some() {
        5
    } else if imported_requires_rebuilt_v4(snapshot) {
        4
    } else {
        3
    };
    align_document_schema(
        schema_version,
        &mut content,
        &mut world,
        &mut scenario,
        &mut asset_index,
    )?;
    let scenario_json = canonical_json_bytes(&scenario)
        .map_err(|error| RebuiltV3DocumentSetError::Serialization(error.to_string()))?;
    let asset_index_json = canonical_json_bytes(&asset_index)
        .map_err(|error| RebuiltV3DocumentSetError::Serialization(error.to_string()))?;
    validate_media_payloads(&asset_index.assets, media_payloads)?;

    let capabilities = package_capabilities_for_assets(
        &asset_index.assets,
        content_needs_battle_atlas(&content),
        has_deferred_references || scenario.extra_code_tail.is_some(),
    );
    let inputs = document_file_inputs(
        &content,
        &world,
        &scenario_json,
        &asset_index_json,
        media_payloads,
    );
    let manifest = if schema_version == 5 {
        compile_rebuilt_v5_manifest(snapshot, compiler_identity, &capabilities, &inputs)
    } else if schema_version == 4 {
        compile_rebuilt_v4_manifest(snapshot, compiler_identity, &capabilities, &inputs)
    } else {
        compile_rebuilt_v3_manifest(snapshot, compiler_identity, &capabilities, &inputs)
    }
    .map_err(RebuiltV3DocumentSetError::Manifest)?;

    Ok(RebuiltV3DocumentSetArtifact {
        content,
        world,
        scenario_json,
        asset_index_json,
        manifest,
    })
}

fn content_needs_battle_atlas(content: &RebuiltV3ContentArtifact) -> bool {
    !content.document.battles.is_empty()
        || content
            .document
            .spells
            .iter()
            .any(|spell| spell.queue_icon != 0)
}

fn document_file_inputs<'a>(
    content: &'a RebuiltV3ContentArtifact,
    world: &'a RebuiltV3WorldArtifact,
    scenario_json: &'a [u8],
    asset_index_json: &'a [u8],
    media_payloads: &'a [RebuiltV3FileInput<'a>],
) -> Vec<RebuiltV3FileInput<'a>> {
    let mut inputs = vec![
        RebuiltV3FileInput {
            path: "content.json",
            bytes: &content.canonical_json,
        },
        RebuiltV3FileInput {
            path: "world.json",
            bytes: &world.canonical_json,
        },
        RebuiltV3FileInput {
            path: "scenario.json",
            bytes: scenario_json,
        },
        RebuiltV3FileInput {
            path: "assets/index.json",
            bytes: asset_index_json,
        },
    ];
    inputs.extend(media_payloads.iter().cloned());
    inputs
}

fn align_document_schema(
    schema_version: u8,
    content: &mut RebuiltV3ContentArtifact,
    world: &mut RebuiltV3WorldArtifact,
    scenario: &mut RebuiltV3ScenarioDocument,
    asset_index: &mut RebuiltV3AssetIndex,
) -> Result<(), RebuiltV3DocumentSetError> {
    if schema_version >= 4 {
        content.document.schema_version = schema_version;
        content.canonical_json = canonical_json_bytes(&content.document)
            .map_err(|error| RebuiltV3DocumentSetError::Serialization(error.to_string()))?;
        content.sha256 = sha256_hex(&content.canonical_json);
        world.document.schema_version = schema_version;
        world.canonical_json = canonical_json_bytes(&world.document)
            .map_err(|error| RebuiltV3DocumentSetError::Serialization(error.to_string()))?;
        world.sha256 = sha256_hex(&world.canonical_json);
        scenario.schema_version = schema_version;
        asset_index.schema_version = schema_version;
    }
    Ok(())
}

pub fn package_capabilities(snapshot: &ProjectSnapshot) -> Vec<String> {
    let assets = project_rebuilt_v3_asset_index(snapshot)
        .map(|index| index.assets)
        .unwrap_or_default();
    package_capabilities_for_assets(
        &assets,
        !snapshot.battles.is_empty()
            || snapshot
                .scenario_spells
                .iter()
                .chain(&snapshot.standard_spells)
                .any(|spell| spell.definition.queue_icon != 0),
        false,
    )
}

fn package_capabilities_for_assets(
    assets: &[super::RebuiltV3AssetRecord],
    has_reachable_battles: bool,
    has_deferred_references: bool,
) -> Vec<String> {
    let mut capabilities = BTreeSet::from([
        "realmz.core.classic-rules-v1".to_string(),
        "realmz.scenario.classic-vm-v1".to_string(),
        "realmz.world.topology-v2".to_string(),
    ]);
    if !assets.is_empty() {
        capabilities.insert("realmz.presentation.content-addressed-media-v1".into());
    }
    if assets.iter().any(|asset| asset.kind == "tileset") {
        capabilities.insert("realmz.presentation.tileset-atlases-v1".into());
    }
    if has_reachable_battles || assets.iter().any(|asset| asset.kind == "battle-tileset") {
        capabilities.insert("realmz.presentation.battle-atlas-v1".into());
    }
    if has_deferred_references {
        capabilities.insert("realmz.scenario.deferred-references-v1".into());
    }
    capabilities.into_iter().collect()
}

fn validate_media_payloads(
    assets: &[super::RebuiltV3AssetRecord],
    media_payloads: &[RebuiltV3FileInput<'_>],
) -> Result<(), RebuiltV3DocumentSetError> {
    let mut expected = BTreeMap::new();
    for asset in assets {
        let declaration = (asset.bytes, asset.sha256.as_str());
        if expected
            .insert(asset.path.as_str(), declaration)
            .is_some_and(|existing| existing != declaration)
        {
            return Err(RebuiltV3DocumentSetError::ConflictingMediaDeclaration(
                asset.path.clone(),
            ));
        }
    }
    let mut seen = BTreeSet::new();
    for payload in media_payloads {
        if !seen.insert(payload.path) {
            return Err(RebuiltV3DocumentSetError::DuplicateMediaPayload(
                payload.path.into(),
            ));
        }
        let Some((expected_length, expected_hash)) = expected.get(payload.path).copied() else {
            return Err(RebuiltV3DocumentSetError::UnexpectedMediaPayload(
                payload.path.into(),
            ));
        };
        let actual_length = payload.bytes.len() as u64;
        if expected_length != actual_length {
            return Err(RebuiltV3DocumentSetError::MediaLengthMismatch {
                path: payload.path.into(),
                expected: expected_length,
                actual: actual_length,
            });
        }
        let actual_hash = sha256_hex(payload.bytes);
        if expected_hash != actual_hash {
            return Err(RebuiltV3DocumentSetError::MediaHashMismatch {
                path: payload.path.into(),
                expected: expected_hash.into(),
                actual: actual_hash,
            });
        }
    }
    for path in expected.keys() {
        if !seen.contains(path) {
            return Err(RebuiltV3DocumentSetError::MissingMediaPayload(
                (*path).into(),
            ));
        }
    }
    Ok(())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
#[path = "documents/tests.rs"]
mod tests;
