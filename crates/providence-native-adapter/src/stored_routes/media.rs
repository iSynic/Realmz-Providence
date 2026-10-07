use crate::icon_media::import_scenario_icon;
use crate::icon_media::read_icon_preview;
use crate::picture_media::import_scenario_picture;
use crate::picture_media::read_picture_preview;
use crate::sound_media::import_scenario_sound;
use crate::sound_media::read_sound_preview;
use crate::special_land_media::import_special_land_tile;
use crate::special_land_media::read_special_land_preview;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;

pub(super) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method {
        "picture.import" => import_scenario_picture(session, store, params),
        "picture.preview" => read_picture_preview(session, store, params),
        "sound.import" => import_scenario_sound(session, store, params),
        "sound.preview" => read_sound_preview(session, store, params),
        "icon.import" => import_scenario_icon(session, store, params),
        "icon.preview" => read_icon_preview(session, store, params),
        "special-land.import" => import_special_land_tile(session, store, params),
        "special-land.preview" => read_special_land_preview(session, store, params),
        _ => crate::session_routes::dispatch(session, method, params),
    }
}
