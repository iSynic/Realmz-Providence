use super::{
    RebuiltV3MediaRequirement, RebuiltV3ReachableMediaError, RebuiltV3ReachableMediaSelection,
    RebuiltV3RuntimeMediaReference, is_missing_imported_presentation_reference,
};
use crate::{
    model::{ProjectOrigin, ProjectSnapshot},
    rebuilt::project_rebuilt_v3_asset_index,
    references::ResolutionState,
};
use std::collections::BTreeSet;

// Resolve ambiguity before absence; retain every source-owned asset, even without callers.
pub(super) fn project_rebuilt_v3_reachable_media_from_references(
    snapshot: &ProjectSnapshot,
    references: Vec<RebuiltV3RuntimeMediaReference>,
) -> Result<RebuiltV3ReachableMediaSelection, RebuiltV3ReachableMediaError> {
    let ambiguous = unique_problem_references(
        references
            .iter()
            .filter(|reference| {
                reference.requirement != RebuiltV3MediaRequirement::OptionalCompanion
                    && reference.resolution == ResolutionState::Ambiguous
            })
            .cloned()
            .collect(),
    );
    if !ambiguous.is_empty() {
        return Err(RebuiltV3ReachableMediaError::Ambiguous(ambiguous));
    }
    let unresolved = unique_problem_references(
        references
            .iter()
            .filter(|reference| {
                matches!(
                    reference.requirement,
                    RebuiltV3MediaRequirement::PackageRequired
                        | RebuiltV3MediaRequirement::ApplicationRequired
                ) && reference.resolution == ResolutionState::Missing
                    && !(matches!(snapshot.origin, ProjectOrigin::Imported { .. })
                        && is_missing_imported_presentation_reference(reference))
            })
            .cloned()
            .collect(),
    );
    if !unresolved.is_empty() {
        return Err(RebuiltV3ReachableMediaError::UnresolvedRequired(unresolved));
    }
    let assets =
        project_rebuilt_v3_asset_index(snapshot).map_err(RebuiltV3ReachableMediaError::Asset)?;
    Ok(RebuiltV3ReachableMediaSelection { references, assets })
}

fn unique_problem_references(
    references: Vec<RebuiltV3RuntimeMediaReference>,
) -> Vec<RebuiltV3RuntimeMediaReference> {
    let mut seen = BTreeSet::new();
    references
        .into_iter()
        .filter(|reference| {
            seen.insert((
                reference.asset_id.clone(),
                reference.classic_resource.clone(),
            ))
        })
        .collect()
}
