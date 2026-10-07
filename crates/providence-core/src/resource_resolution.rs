use crate::model::{AssetDescriptor, ClassicResourceKey, ProjectSnapshot};

pub(crate) enum ScenarioResourceResolution<'a> {
    Resolved(&'a AssetDescriptor),
    Missing,
    WrongKind,
    Ambiguous,
}

pub(crate) fn scenario_resource<'a>(
    snapshot: &'a ProjectSnapshot,
    resource: &ClassicResourceKey,
    expected_kind: &str,
) -> ScenarioResourceResolution<'a> {
    unique_resource(
        snapshot
            .assets
            .iter()
            .filter(|asset| asset.classic_resource.as_ref() == Some(resource)),
        expected_kind,
    )
}

// Ownership is determined before role. A malformed or ambiguous exact key
// must not be replaced by a different asset merely because its role matches.
pub(crate) fn unique_resource<'a>(
    mut candidates: impl Iterator<Item = &'a AssetDescriptor>,
    expected_kind: &str,
) -> ScenarioResourceResolution<'a> {
    let Some(asset) = candidates.next() else {
        return ScenarioResourceResolution::Missing;
    };
    if candidates.next().is_some() {
        ScenarioResourceResolution::Ambiguous
    } else if asset.kind != expected_kind {
        ScenarioResourceResolution::WrongKind
    } else {
        ScenarioResourceResolution::Resolved(asset)
    }
}
