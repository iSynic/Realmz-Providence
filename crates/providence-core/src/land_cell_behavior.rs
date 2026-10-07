use crate::{
    codecs::{apply_land_marker_band, decode_land_cell},
    land_paint_intent::configured_erase_tile,
    map_paint::{invalid, land_map},
    model::{CLASSIC_MAP_SIZE, LevelType, MapCoordinate, ProjectSnapshot, StableId},
    session::SessionError,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LandSecretState {
    Normal,
    Hidden,
    Revealed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LandCellBehaviorEdit {
    pub x: u8,
    pub y: u8,
    pub secret: LandSecretState,
    pub solid: Option<bool>,
    pub remove_placement: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpecialSolidityUse {
    pub identity: StableId,
    pub name: String,
    pub cells: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LandCellBehavior {
    pub coordinate: MapCoordinate,
    pub before: i16,
    pub after: i16,
    pub secret: LandSecretState,
    pub special_resource_id: Option<i16>,
    pub solid: Option<bool>,
    pub solidity_reason: String,
    pub affected_maps: Vec<SpecialSolidityUse>,
    pub changed: bool,
}

pub fn read(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    x: u8,
    y: u8,
) -> Result<LandCellBehavior, SessionError> {
    let map = land_map(snapshot, identity)?;
    if usize::from(x) >= CLASSIC_MAP_SIZE || usize::from(y) >= CLASSIC_MAP_SIZE {
        return Err(invalid(identity, "Select a cell within this map."));
    }
    let raw = map.tiles[usize::from(y) * CLASSIC_MAP_SIZE + usize::from(x)];
    let profile = decode_land_cell(raw);
    let resource = profile.icon_resource_id.filter(|_| raw < 0);
    let solid = resource.and_then(|id| {
        snapshot
            .world
            .special_land_solidity
            .as_ref()
            .filter(|catalog| catalog.source == "Data Solids" && catalog.solid.len() == 1024)?
            .solid
            .get(usize::from(id.unsigned_abs()))
            .copied()
    });
    let reason = if resource.is_none() {
        "Select a special artwork placement to edit passability."
    } else if solid.is_none() {
        "This special resource has no representable scenario passability row."
    } else {
        ""
    };
    Ok(LandCellBehavior {
        coordinate: MapCoordinate { x, y },
        before: raw,
        after: raw,
        secret: secret(raw),
        special_resource_id: resource,
        solid,
        solidity_reason: reason.into(),
        affected_maps: solidity_uses(snapshot, resource),
        changed: false,
    })
}

fn solidity_uses(snapshot: &ProjectSnapshot, resource: Option<i16>) -> Vec<SpecialSolidityUse> {
    let Some(resource) = resource else {
        return Vec::new();
    };
    snapshot
        .world
        .maps
        .iter()
        .filter(|map| map.level_type == LevelType::Land)
        .filter_map(|map| {
            let cells = map
                .tiles
                .iter()
                .filter(|raw| {
                    **raw < 0 && decode_land_cell(**raw).icon_resource_id == Some(resource)
                })
                .count();
            (cells > 0).then(|| SpecialSolidityUse {
                identity: map.identity.clone(),
                name: map.name.clone(),
                cells,
            })
        })
        .collect()
}

pub fn preview(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    edit: &LandCellBehaviorEdit,
) -> Result<LandCellBehavior, SessionError> {
    let mut result = read(snapshot, identity, edit.x, edit.y)?;
    let map = land_map(snapshot, identity)?;
    let has_ap = snapshot.world.action_points.iter().any(|ap| {
        ap.level_type == LevelType::Land
            && ap.level_index == map.native_index
            && ap.coordinate == Some(result.coordinate)
    });
    if edit.remove_placement {
        if result.special_resource_id.is_none() {
            return Err(invalid(
                identity,
                "This cell has no special artwork placement to remove.",
            ));
        }
        if edit.solid.is_some() || edit.secret != result.secret {
            return Err(invalid(
                identity,
                "Remove placement preserves secret state and shared passability. Apply other edits separately.",
            ));
        }
        let replacement = configured_erase_tile(snapshot, identity)?;
        result.after = apply_land_marker_band(replacement, band(edit.secret, has_ap))
            .map_err(|reason| invalid(identity, reason))?;
    } else {
        if edit.secret != result.secret {
            result.after = apply_land_marker_band(result.before, band(edit.secret, has_ap))
                .map_err(|reason| invalid(identity, reason))?;
        }
        if let Some(solid) = edit.solid {
            let original = result
                .solid
                .ok_or_else(|| invalid(identity, &result.solidity_reason))?;
            result.changed = original != solid;
            result.solid = Some(solid);
        }
    }
    result.changed |= result.before != result.after;
    result.secret = edit.secret;
    Ok(result)
}

fn band(secret: LandSecretState, has_ap: bool) -> u8 {
    match secret {
        LandSecretState::Hidden => 3,
        LandSecretState::Revealed => 2,
        LandSecretState::Normal => u8::from(has_ap),
    }
}

fn secret(raw: i16) -> LandSecretState {
    let profile = decode_land_cell(raw);
    if profile.hidden_secret {
        LandSecretState::Hidden
    } else if profile.revealed_secret {
        LandSecretState::Revealed
    } else {
        LandSecretState::Normal
    }
}

#[cfg(test)]
mod tests;
