use crate::media_problems::grouped_media_problem_references;
use crate::media_problems::media_problem_projection;
use crate::media_problems::reachable_media_references;
use crate::media_problems::readiness_blocking_media_references;
use crate::reachability_problems::runtime_selection_problem_projections;
use providence_core::compatibility::CompatibilityBlocker;
use providence_core::compatibility::TargetCompatibility;
use providence_core::compatibility::classify_classic_slice;
use providence_core::compatibility::classify_classic_slice_with_application;
use providence_core::compatibility::classify_rebuilt_v3;
use providence_core::compatibility::classify_rebuilt_v3_with_application;
use providence_core::model::{ProjectSnapshot, StableId};
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::rebuilt::RebuiltV3ReachableRuntimeSelection;
use providence_core::rebuilt::RebuiltV3WorldError;
use providence_core::rebuilt::compile_rebuilt_v3_reachable_world_with_application;
use providence_core::rebuilt::project_rebuilt_v3_reachable_runtime;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use serde_json::Value;
use serde_json::json;
use std::collections::BTreeMap;

pub(crate) struct ReadinessData {
    pub readiness: TargetCompatibility,
    pub problems: Vec<Value>,
    pub problem_count: usize,
}

impl ReadinessData {
    pub(crate) fn project(&self, revision: Revision, params: &Value) -> Result<Value, String> {
        readiness_projection(
            revision,
            &self.readiness,
            &self.problems,
            self.problem_count,
            params,
        )
    }
}

pub(crate) fn collect_rebuilt(
    session: &EditorSession,
    snapshot: &ProjectSnapshot,
    application_media: Option<&ApplicationMediaCatalog>,
) -> Result<ReadinessData, String> {
    let readiness = application_media.map_or_else(
        || classify_rebuilt_v3(snapshot),
        |application_media| classify_rebuilt_v3_with_application(snapshot, application_media),
    );
    let mut problems = readiness
        .blockers
        .iter()
        .any(|blocker| blocker.code == "rebuilt.reachability.invalid")
        .then(|| project_rebuilt_v3_reachable_runtime(snapshot).err())
        .flatten()
        .map(|error| runtime_selection_problem_projections(snapshot, &session.references(), &error))
        .unwrap_or_default();
    let mut problem_count = problems.len();
    if readiness.blockers.iter().any(|blocker| {
        matches!(
            blocker.code.as_str(),
            "rebuilt.media-selection.invalid" | "rebuilt.world.invalid"
        )
    }) && let Ok(runtime) = project_rebuilt_v3_reachable_runtime(snapshot)
    {
        let media_references = reachable_media_references(snapshot, &runtime, application_media);
        let world_player_map =
            invalid_world_player_map(snapshot, &readiness, &runtime, application_media);
        let blocking_media_references =
            readiness_blocking_media_references(&media_references, world_player_map.as_ref());
        let grouped = grouped_media_problem_references(&blocking_media_references)?;
        problem_count = problem_count.saturating_add(grouped.len());
        let references = session.references();
        problems.extend(
            grouped
                .iter()
                .map(|(reference, uses)| media_problem_projection(reference, *uses, &references))
                .collect::<Result<Vec<_>, String>>()?,
        );
    }
    Ok(ReadinessData {
        readiness,
        problems,
        problem_count,
    })
}

pub(crate) fn inspect_classic_readiness(
    session: &EditorSession,
    application_media: Option<&ApplicationMediaCatalog>,
    params: &Value,
) -> Result<Value, String> {
    collect_classic(session.snapshot(), application_media).project(session.revision(), params)
}

pub(crate) fn collect_classic(
    snapshot: &ProjectSnapshot,
    application_media: Option<&ApplicationMediaCatalog>,
) -> ReadinessData {
    let readiness = application_media.map_or_else(
        || classify_classic_slice(snapshot),
        |application_media| classify_classic_slice_with_application(snapshot, application_media),
    );
    ReadinessData {
        readiness,
        problems: Vec::new(),
        problem_count: 0,
    }
}

pub(crate) use projection::readiness_projection;
mod projection;

pub(crate) fn blocker_code_groups(blockers: &[CompatibilityBlocker]) -> BTreeMap<String, usize> {
    let mut groups = BTreeMap::new();
    for blocker in blockers {
        *groups.entry(blocker.code.clone()).or_default() += blocker
            .group
            .as_ref()
            .map_or(1, |group| group.occurrence_count);
    }
    groups
}

#[cfg(test)]
pub(crate) fn bounded_blocker_code_summary(readiness: &TargetCompatibility) -> String {
    const MAX_CODES: usize = 32;
    let groups = blocker_code_groups(&readiness.blockers);
    let mut labels = groups
        .iter()
        .take(MAX_CODES)
        .map(|(code, count)| {
            if *count == 1 {
                code.clone()
            } else {
                format!("{code} ({count})")
            }
        })
        .collect::<Vec<_>>();
    if groups.len() > MAX_CODES {
        labels.push(format!("+{} more blocker kinds", groups.len() - MAX_CODES));
    }
    labels.join(", ")
}

fn invalid_world_player_map(
    snapshot: &ProjectSnapshot,
    readiness: &TargetCompatibility,
    runtime: &RebuiltV3ReachableRuntimeSelection,
    application_media: Option<&ApplicationMediaCatalog>,
) -> Option<StableId> {
    if readiness
        .blockers
        .iter()
        .any(|blocker| blocker.code == "rebuilt.world.invalid")
        && let Some(application_media) = application_media
        && let Err(RebuiltV3WorldError::InvalidPlayerMap { player_map, .. }) =
            compile_rebuilt_v3_reachable_world_with_application(
                snapshot,
                application_media,
                runtime,
            )
    {
        Some(player_map)
    } else {
        None
    }
}
