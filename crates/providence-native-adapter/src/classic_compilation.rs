mod operation;
mod reports;
mod rules;
mod sources;
pub(crate) use operation::ClassicManifestOperation;
use providence_core::{rebuilt::ApplicationMediaCatalog, session::EditorSession};
use providence_storage::ProjectStore;
use serde_json::Value;

#[cfg(test)]
pub(crate) fn compile_project_classic_slice(
    session: &EditorSession,
    store: &ProjectStore,
    params: Value,
) -> Result<Value, String> {
    compile_project_classic_slice_with_application(
        session,
        store,
        None,
        params,
        ClassicManifestOperation::Publish,
    )
}

pub(crate) fn compile_project_classic_slice_with_application(
    session: &EditorSession,
    store: &ProjectStore,
    application_media: Option<&ApplicationMediaCatalog>,
    params: Value,
    operation: ClassicManifestOperation,
) -> Result<Value, String> {
    if operation == ClassicManifestOperation::PublishStuffIt {
        crate::classic_stuffit::validate_revision(&params, session.revision().0)?;
    }
    let snapshot = session.snapshot();
    let source_bytes = sources::read_retained(snapshot, store)?;
    let startup = sources::startup(snapshot, &source_bytes)?;
    let application_caste = sources::application_caste(snapshot, &source_bytes, store)?;
    let rule_sources = rules::RuleSources::read(snapshot, store)?;
    sources::validate_custom_landlooks(snapshot, &source_bytes)?;
    let sources = rule_sources.overlay(sources::compatibility(
        snapshot,
        &source_bytes,
        startup,
        application_caste.as_deref(),
    ));
    let asset_payloads = sources::asset_payloads(snapshot, store)?;
    operation.execute(
        session,
        sources,
        &asset_payloads,
        &source_bytes,
        application_media,
        params,
    )
}
