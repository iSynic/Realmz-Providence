use super::*;

/// Legacy publication keeps its projection rules; current imported exports retain native catalogs.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum ExportContract {
    Legacy,
    Current,
}

impl ExportContract {
    pub(super) fn world(
        self,
        snapshot: &ProjectSnapshot,
    ) -> Result<RebuiltV3WorldArtifact, RebuiltV3WorldError> {
        if self == Self::Current && matches!(snapshot.origin, ProjectOrigin::Imported { .. }) {
            crate::rebuilt::world::compile_imported_world(snapshot, None, None)
        } else {
            compile_rebuilt_v3_world(snapshot)
        }
    }

    pub(super) fn reachable_world(
        self,
        snapshot: &ProjectSnapshot,
        application: &ApplicationMediaCatalog,
        runtime: &super::super::RebuiltV3ReachableRuntimeSelection,
    ) -> Result<RebuiltV3WorldArtifact, RebuiltV3WorldError> {
        if self == Self::Current && matches!(snapshot.origin, ProjectOrigin::Imported { .. }) {
            crate::rebuilt::world::compile_imported_world(
                snapshot,
                Some(application),
                Some(runtime),
            )
        } else {
            compile_rebuilt_v3_reachable_world_with_application(snapshot, application, runtime)
        }
    }

    pub(super) fn reachable_world_without_application(
        self,
        snapshot: &ProjectSnapshot,
        runtime: &super::super::RebuiltV3ReachableRuntimeSelection,
    ) -> Result<RebuiltV3WorldArtifact, RebuiltV3WorldError> {
        if self == Self::Current && matches!(snapshot.origin, ProjectOrigin::Imported { .. }) {
            crate::rebuilt::world::compile_imported_world(snapshot, None, Some(runtime))
        } else {
            super::super::compile_rebuilt_v3_reachable_world(snapshot, runtime)
        }
    }

    pub(super) fn content(
        self,
        snapshot: &ProjectSnapshot,
    ) -> Result<RebuiltV3ContentArtifact, RebuiltV3ContentError> {
        match self {
            Self::Legacy => super::super::compile_rebuilt_v3_content(snapshot),
            Self::Current => compile_rebuilt_content(snapshot),
        }
    }

    pub(super) fn validate_monster_contract(
        self,
        snapshot: &ProjectSnapshot,
    ) -> Result<(), RebuiltV3DocumentSetError> {
        if self == Self::Legacy && !matches!(snapshot.origin, ProjectOrigin::Imported { .. }) {
            super::super::project_rebuilt_v3_monster_catalog(snapshot)
                .map_err(|error| RebuiltV3ContentError::InvalidSection {
                    section: "monsters",
                    reason: error.to_string(),
                })
                .map_err(RebuiltV3DocumentSetError::Content)?;
        }
        Ok(())
    }
}

/// Historical contract: authored v3; imported source-backed versions as before.
/// Product publication calls the version-neutral current-export functions.
pub fn compile_rebuilt_v3_document_set(
    snapshot: &ProjectSnapshot,
    compiler_identity: &RebuiltV3CompilerIdentity,
    media_payloads: &[RebuiltV3FileInput<'_>],
) -> Result<RebuiltV3DocumentSetArtifact, RebuiltV3DocumentSetError> {
    compile_document_set(
        snapshot,
        compiler_identity,
        media_payloads,
        ExportContract::Legacy,
    )
}

pub fn compile_rebuilt_v3_document_set_with_application(
    snapshot: &ProjectSnapshot,
    application_media: &ApplicationMediaCatalog,
    compiler_identity: &RebuiltV3CompilerIdentity,
    media_payloads: &[RebuiltV3FileInput<'_>],
) -> Result<RebuiltV3DocumentSetArtifact, RebuiltV3DocumentSetError> {
    compile_document_set_with_rules(
        snapshot,
        application_media,
        compiler_identity,
        media_payloads,
        None,
        ExportContract::Legacy,
    )
}
