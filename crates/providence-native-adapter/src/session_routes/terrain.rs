//! Native terrain requests; decoding and bounded projections stay with this feature.

use crate::execute;
use crate::request_params::required_i16;
use crate::request_params::required_i64;
use crate::request_params::required_u8;
use crate::request_params::required_value;
use providence_core::model::TerrainProfile;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use serde_json::Value;

pub(super) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method {
        "terrain-profile.upsert" => terrain_profile_upsert(session, params),
        "landlook-base.set" => landlook_base_set(session, params),
        "landlook-range.set" => landlook_range_set(session, params),
        _ => Err(format!("unknown method {method}")),
    }
}

fn terrain_profile_upsert(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let profile = required_value(&params, "profile")?;
    let profile: TerrainProfile = serde_json::from_value(profile.clone())
        .map_err(|error| format!("invalid terrain profile: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::UpsertTerrainProfile {
            profile: Box::new(profile),
        },
    )
}

fn landlook_base_set(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::SetLandlookCatalogBase {
            landlook: i8::try_from(required_i64(&params, "landlook")?)
                .map_err(|_| "landlook must fit a signed byte".to_string())?,
            base_tile: required_i16(&params, "baseTile")?,
            base_scale: required_i16(&params, "baseScale")?,
        },
    )
}

fn landlook_range_set(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::SetLandlookRangeSlot {
            landlook: i8::try_from(required_i64(&params, "landlook")?)
                .map_err(|_| "landlook must fit a signed byte".to_string())?,
            slot: required_u8(&params, "slot")?,
            first_tile: required_i16(&params, "firstTile")?,
            last_tile: required_i16(&params, "lastTile")?,
        },
    )
}
