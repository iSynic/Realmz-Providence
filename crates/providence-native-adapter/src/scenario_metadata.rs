use providence_core::codecs::decode_scenario_contact_info;
use providence_core::model::CampaignContactProvenance;
use providence_core::model::{CampaignMetadata, LevelType};
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;

pub(crate) fn read_scenario_contact(
    session: &EditorSession,
    store: Option<&ProjectStore>,
) -> Result<Value, String> {
    let neutral = CampaignMetadata::neutral();
    let campaign = session.snapshot().campaign.as_ref().unwrap_or(&neutral);
    let source = session
        .snapshot()
        .classic_sources
        .iter()
        .find(|source| source.native_path == "Data CI");
    let contact = if campaign.contact_provenance == CampaignContactProvenance::LegacyUnhydrated {
        legacy_contact_fields(source, store)?
    } else {
        json!({
            "title": campaign.contact.title,
            "version": campaign.version,
            "date": campaign.contact.date,
            "author": campaign.author,
            "email": campaign.contact.email,
            "web": campaign.contact.web,
            "fee": campaign.contact.fee,
            "description": campaign.description,
        })
    };
    Ok(json!({
        "revision": session.revision(),
        "contact": contact,
        "provenance": campaign.contact_provenance,
        "sourcePresent": source.is_some(),
    }))
}

pub(crate) fn read_scenario_startup(session: &EditorSession) -> Result<Value, String> {
    let snapshot = session.snapshot();
    let neutral = CampaignMetadata::neutral();
    let campaign = snapshot.campaign.as_ref().unwrap_or(&neutral);
    let start_location = snapshot.start_location.as_ref();
    let start_map_resolves = start_location.is_some_and(|location| {
        snapshot
            .world
            .maps
            .iter()
            .any(|map| map.identity == location.map && map.level_type == LevelType::Land)
    });
    let source = snapshot.classic_sources.iter().find(|source| {
        source.native_path
            == snapshot
                .startup_authoring
                .as_ref()
                .and_then(|authoring| authoring.original_source.as_ref())
                .map(|original| original.native_path.as_str())
                .unwrap_or(&campaign.name)
    });

    Ok(json!({
        "revision": session.revision(),
        "startup": {
            "imported": matches!(snapshot.origin, providence_core::model::ProjectOrigin::Imported { .. }),
            "name": campaign.name,
            "markerFilename": snapshot.startup_authoring.as_ref().map(|authoring| authoring.marker_filename.as_str()).unwrap_or(&campaign.name),
            "recommendedPartyLevels": campaign.recommended_party_levels,
            "maximumPartyLevels": campaign.maximum_party_levels,
            "creatorUserCheck": campaign.creator_user_check,
            "guidanceAuthored": campaign.guidance_authored,
        },
        "startLocation": start_location,
        "startMapResolves": start_map_resolves,
        "source": source.map(|source| json!({
            "nativePath": source.native_path,
            "byteLength": source.byte_length,
        })),
    }))
}

pub(crate) fn read_scenario_restrictions(session: &EditorSession) -> Result<Value, String> {
    let snapshot = session.snapshot();
    let neutral = CampaignMetadata::neutral();
    let campaign = snapshot.campaign.as_ref().unwrap_or(&neutral);
    let source = snapshot
        .classic_sources
        .iter()
        .find(|source| source.native_path == "Data RI");

    Ok(json!({
        "revision": session.revision(),
        "restrictions": campaign.restrictions,
        "source": source.map(|source| json!({
            "nativePath": source.native_path,
            "byteLength": source.byte_length,
        })),
    }))
}

pub(crate) fn read_scenario_security(
    session: &EditorSession,
    store: Option<&ProjectStore>,
) -> Result<Value, String> {
    super::scenario_security::read(session, store)
}

fn legacy_contact_fields(
    source: Option<&providence_core::model::ClassicSourceBlob>,
    store: Option<&ProjectStore>,
) -> Result<Value, String> {
    let source = source.ok_or_else(|| {
        "legacy scenario contact metadata names Data CI but retains no Data CI source".to_string()
    })?;
    let store = store.ok_or_else(|| {
        "legacy scenario contact metadata requires a persistent project session to read Data CI"
            .to_string()
    })?;
    let bytes = store
        .read_blob(&source.blob)
        .map_err(|error| error.to_string())?;
    let decoded = decode_scenario_contact_info(&bytes).map_err(|error| error.to_string())?;
    Ok(json!({
        "title": decoded.title, "version": decoded.version, "date": decoded.date,
        "author": decoded.author, "email": decoded.email, "web": decoded.web,
        "fee": decoded.fee, "description": decoded.description,
    }))
}
