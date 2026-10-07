//! Reviewed media commands bind exact content, ownership and both document revisions.
mod allocation;

pub(crate) fn check_retained_landlook(
    session: &EditorSession,
    project: &ProjectStore,
    key: &providence_core::model::ClassicResourceKey,
    replacement: bool,
) -> Result<(), String> {
    allocation::check_retained(session, project, key, replacement)
}
mod editing;
mod images;
mod import_workflow;
mod imports;
mod library_catalog;
mod music;
mod music_audition;
mod music_slots;
mod recovery;
mod transfers;

use crate::{
    catalogs::CatalogViews,
    request_params::{required_string, required_u64},
};
use providence_core::{
    model::{AssetDescriptor, BlobId, StableId},
    personal_library::PersonalMedia,
    session::{EditorCommand, EditorSession},
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

pub(super) fn dispatch(
    session: &mut EditorSession,
    project: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    match method {
        "media.music-slots" => music_slots::list(session, params),
        "media.music-audition.prepare" => {
            music_audition::prepare(session, project, catalogs, params)
        }
        "media.open" => transfers::open(session, project, catalogs, params),
        "media.recovery.read" => recovery::read(session, project, catalogs, params),
        "media.library.list" => library_catalog::list(catalogs, params),
        "media.copy.prepare" | "media.copy.commit"
            if params["sourceReference"].as_bool() == Some(true) =>
        {
            library_catalog::copy(session, project, catalogs, method, params)
        }
        "media.transfer.prepare" | "media.transfer.commit" => {
            transfers::to_library(session, project, catalogs, method, params)
        }
        "media.copy.prepare" | "media.copy.commit" => {
            transfers::to_scenario(session, project, catalogs, method, params)
        }
        "media.import.prepare" | "media.import.commit" => {
            imports::dispatch(session, project, catalogs, method, params)
        }
        "media.metadata.apply" | "media.remove.prepare" | "media.remove.commit" => {
            editing::dispatch(session, project, catalogs, method, params)
        }
        _ => Err(format!("Unknown media command '{method}'")),
    }
}

fn check_project(session: &EditorSession, params: &Value) -> Result<(), String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("The scenario changed. Review this media operation again.".into());
    }
    Ok(())
}

fn checked_hash(
    session: &EditorSession,
    params: &Value,
    library_revision: Option<u64>,
    media: &PersonalMedia,
) -> Result<String, String> {
    let mut intent = params.clone();
    if let Some(object) = intent.as_object_mut() {
        object.remove("operationId");
        object.remove("reviewHash");
        object.remove("measurePerformance");
    }
    let bytes = serde_json::to_vec(&json!([
        session.snapshot().project_id,
        session.revision(),
        library_revision,
        intent,
        media
    ]))
    .map_err(|e| e.to_string())?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn require_review(params: &Value, hash: &str) -> Result<(), String> {
    if required_string(params, "reviewHash")? != hash {
        return Err("The source, settings or destination changed. Review the current result before applying.".into());
    }
    Ok(())
}

fn asset(session: &EditorSession, identity: &str) -> Result<AssetDescriptor, String> {
    session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity.0 == identity)
        .cloned()
        .ok_or("The selected scenario resource no longer exists.".into())
}

fn upsert(media: &PersonalMedia) -> EditorCommand {
    match media.companion.as_ref() {
        Some(companion) if media.primary.kind == "text-resource" => {
            EditorCommand::UpsertTextResourcePair {
                text: Box::new(media.primary.clone()),
                style: Box::new(companion.clone()),
            }
        }
        Some(companion) => EditorCommand::UpsertMonsterAppearancePair {
            base: Box::new(media.primary.clone()),
            facing: Box::new(companion.clone()),
        },
        None => EditorCommand::UpsertAsset {
            asset: Box::new(media.primary.clone()),
        },
    }
}

fn preview(
    media: &PersonalMedia,
    read: impl Fn(&BlobId) -> Result<Vec<u8>, String>,
) -> Result<Value, String> {
    let one = |asset: &AssetDescriptor| -> Result<Value, String> {
        let bytes = read(&asset.blob)?;
        if bytes.len() as u64 != asset.byte_length {
            return Err("The media payload has an incorrect length.".into());
        }
        if asset.kind == "music" {
            return music::preview(asset, &bytes);
        }
        use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
        let bytes = if asset.mime_type.as_deref() == Some("image/png") {
            crate::personal_image::preview(&bytes)?.png
        } else {
            bytes
        };
        Ok(
            json!({"identity":asset.identity,"mimeType":asset.mime_type,"width":asset.width,"height":asset.height,"base64":BASE64.encode(bytes)}),
        )
    };
    Ok(
        json!({"primary":one(&media.primary)?,"companion":media.companion.as_ref().map(one).transpose()?}),
    )
}

fn rebase(media: &PersonalMedia, number: i32, label: &str) -> Result<PersonalMedia, String> {
    if media.primary.kind == "music" {
        return music::rebase(&media.primary, number, label);
    }
    let resource = media
        .primary
        .classic_resource
        .as_ref()
        .ok_or("This original must be prepared before it can be copied.")?;
    let identity = |asset: &AssetDescriptor, id: i32| StableId(format!("{}:{id}", asset.kind));
    let mut result = media.clone();
    let primary = &mut result.primary;
    primary
        .classic_resource
        .as_mut()
        .ok_or("Missing resource key")?
        .resource_id = number;
    primary.identity = identity(primary, number);
    primary.label = label.into();
    primary.source = "authored media copy".into();
    if let Some(companion) = result.companion.as_mut() {
        let id = if resource.resource_type == "TEXT" {
            number
        } else {
            number
                .checked_add(308)
                .ok_or("Appearance number overflow")?
        };
        i16::try_from(id)
            .map_err(|_| "Choose a number that leaves room for the reverse appearance.")?;
        companion
            .classic_resource
            .as_mut()
            .ok_or("Missing companion resource key")?
            .resource_id = id;
        companion.identity = identity(companion, id);
        companion.source = "authored media copy".into();
    }
    Ok(result)
}
