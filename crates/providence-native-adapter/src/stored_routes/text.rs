use crate::reference_strings::list_reference_strings;
use crate::reference_strings::open_reference_string;
use crate::text_resource_resolution;
use crate::text_resources::read_text_resource;
use crate::text_resources::update_text_resource;
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
        "text-resource.inspect-styles" | "text-resource.apply-styles" => {
            crate::text_style_drafts::dispatch(session, store, method, &params)
        }
        "text-resource.open" => read_text_resource(session, store, params),
        "text-resource.resolve-exact" => text_resource_resolution::resolve_exact(session, &params),
        "text-resource.update" => update_text_resource(session, store, params),
        "reference-string.list" => list_reference_strings(session, store, params),
        "reference-string.open" => open_reference_string(session, store, params),
        _ => crate::text_resource_authoring::dispatch(session, store, method, &params)
            .unwrap_or_else(|| crate::session_routes::dispatch(session, method, params)),
    }
}
