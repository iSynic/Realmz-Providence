//! Native overview requests; decoding and bounded projections stay with this feature.

use crate::document_catalogs::project_asset_list;
use crate::document_catalogs::project_asset_open;
use crate::document_catalogs::source_evidence_list;
use crate::document_catalogs::source_evidence_open;
use crate::record_catalog::record_list;
use crate::record_catalog::record_open;
use crate::session_summary::session_projection;
use crate::text_export::validation_list_projection;
use providence_core::compatibility::classify_targets;
use providence_core::session::EditorSession;
use serde_json::Value;

pub(super) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method {
        "session.describe" => Ok(session_projection(session)),
        "project-asset.list" => project_asset_list(session, &params),
        "project-asset.open" => project_asset_open(session, &params),
        "source-evidence.list" => source_evidence_list(session, &params),
        "source-evidence.open" => source_evidence_open(session, &params),
        "record.list" => record_list(session, &params),
        "record.open" => record_open(session, &params),
        "validation.run" => {
            serde_json::to_value(session.diagnostics()).map_err(|error| error.to_string())
        }
        "validation.list" => validation_list_projection(session, None, &params),
        "compatibility.classify" => serde_json::to_value(classify_targets(session.snapshot()))
            .map_err(|error| error.to_string()),
        "history.undo" => super::map_history::execute(session, &params, false),
        "history.redo" => super::map_history::execute(session, &params, true),
        _ => Err(format!("unknown method {method}")),
    }
}
