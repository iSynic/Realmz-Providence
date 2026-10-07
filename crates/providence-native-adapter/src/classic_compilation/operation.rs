use super::reports;
use crate::{classic_export_plan, classic_publication::write_classic_slice_with_application};
use providence_core::{
    compiler::{
        ClassicCompatibilitySources, compile_classic_slice_with_application_and_asset_payloads,
    },
    rebuilt::ApplicationMediaCatalog,
    session::EditorSession,
};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ClassicManifestOperation {
    Publish,
    InspectPlan,
    InspectNoEdit,
    InspectOwnedEdit,
    InspectStuffIt,
    PublishStuffIt,
}

impl ClassicManifestOperation {
    pub(super) fn execute(
        self,
        session: &EditorSession,
        sources: ClassicCompatibilitySources<'_>,
        asset_payloads: &BTreeMap<String, Vec<u8>>,
        source_bytes: &BTreeMap<String, Vec<u8>>,
        application_media: Option<&ApplicationMediaCatalog>,
        params: Value,
    ) -> Result<Value, String> {
        // Certify imported ownership before constructing a publish plan or writing.
        self.certify_owned_if_required(
            session,
            sources,
            asset_payloads,
            source_bytes,
            application_media,
            &params,
        )?;
        match self {
            ClassicManifestOperation::InspectNoEdit => reports::no_edit(
                session,
                sources,
                asset_payloads,
                source_bytes,
                application_media,
            ),
            ClassicManifestOperation::InspectOwnedEdit => reports::owned_edit(
                session,
                sources,
                asset_payloads,
                source_bytes,
                application_media,
                &params,
            ),
            ClassicManifestOperation::InspectPlan
            | ClassicManifestOperation::InspectStuffIt
            | ClassicManifestOperation::PublishStuffIt => {
                let manifest = compile_classic_slice_with_application_and_asset_payloads(
                    session.snapshot(),
                    sources,
                    asset_payloads,
                    application_media,
                )
                .map_err(|error| error.to_string())?;
                self.project_manifest(&manifest, session.revision(), params)
            }
            ClassicManifestOperation::Publish => write_classic_slice_with_application(
                session,
                &params,
                sources,
                asset_payloads,
                application_media,
            ),
        }
    }

    fn certify_owned_if_required(
        self,
        session: &EditorSession,
        sources: ClassicCompatibilitySources<'_>,
        asset_payloads: &BTreeMap<String, Vec<u8>>,
        source_bytes: &BTreeMap<String, Vec<u8>>,
        application_media: Option<&ApplicationMediaCatalog>,
        params: &Value,
    ) -> Result<(), String> {
        let snapshot = session.snapshot();
        if snapshot
            .startup_authoring
            .as_ref()
            .and_then(|authoring| authoring.original_source.as_ref())
            .is_some()
            && matches!(
                self,
                ClassicManifestOperation::Publish
                    | ClassicManifestOperation::InspectPlan
                    | ClassicManifestOperation::InspectStuffIt
                    | ClassicManifestOperation::PublishStuffIt
            )
        {
            reports::owned_edit(
                session,
                sources,
                asset_payloads,
                source_bytes,
                application_media,
                params,
            )?;
        }
        Ok(())
    }

    fn project_manifest(
        self,
        manifest: &providence_core::compiler::NativeManifest,
        revision: providence_core::session::Revision,
        params: Value,
    ) -> Result<Value, String> {
        match self {
            Self::InspectPlan => classic_export_plan::project(manifest, revision, params),
            Self::InspectStuffIt | Self::PublishStuffIt => crate::classic_stuffit::execute(
                manifest,
                revision.0,
                params,
                self == Self::InspectStuffIt,
            ),
            _ => Err("This Classic operation does not project a compiled manifest".into()),
        }
    }
}
