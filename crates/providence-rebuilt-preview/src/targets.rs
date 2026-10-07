use super::PreviewTarget;
use serde_json::Value;

pub(super) fn validate_target(target: &PreviewTarget) -> Result<(), String> {
    match target {
        PreviewTarget::ActionPoint { id, map_id, .. } if id.is_empty() || map_id.is_empty() => {
            Err("action-point preview targets require nonempty id and mapId".into())
        }
        PreviewTarget::MapLocation {
            id,
            map_id,
            x,
            y,
        } if id != map_id || !is_canonical_map_identity(id) || *x < 0 || *y < 0 =>
        {
            Err("map-location preview targets require equal canonical id/mapId and nonnegative map-local coordinates".into())
        }
        PreviewTarget::ScrollingText { id: 0 } => {
            Err("scrolling-text preview targets require an exact nonzero signed TEXT resource id".into())
        }
        _ => Ok(()),
    }
}

fn is_canonical_map_identity(identity: &str) -> bool {
    let Some((kind, native_index)) = identity.split_once(':') else {
        return false;
    };
    if kind != "land" && kind != "dungeon" {
        return false;
    }
    native_index
        .parse::<u32>()
        .is_ok_and(|parsed| identity == format!("{kind}:{parsed}"))
}

pub(super) fn target_identity(target: &PreviewTarget) -> (&'static str, Value) {
    match target {
        PreviewTarget::ActionPoint { id, .. } => ("action-point", Value::String(id.clone())),
        PreviewTarget::SimpleEncounter { id } => ("simple-encounter", Value::from(*id)),
        PreviewTarget::ComplexEncounter { id } => ("complex-encounter", Value::from(*id)),
        PreviewTarget::ThiefEncounter { id, .. } => ("thief-encounter", Value::from(*id)),
        PreviewTarget::ExtraActionPointProgram { id } => {
            ("extra-action-point-program", Value::from(*id))
        }
        PreviewTarget::MapLocation { id, .. } => ("map-location", Value::String(id.clone())),
        PreviewTarget::ScrollingText { id } => ("scrolling-text", Value::from(*id)),
        PreviewTarget::Battle { id } => ("battle", Value::from(*id)),
        PreviewTarget::Treasure { id } => ("treasure", Value::from(*id)),
        PreviewTarget::Shop { id } => ("shop", Value::from(*id)),
    }
}
