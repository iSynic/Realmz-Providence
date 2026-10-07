use super::{CompatibilityBlocker, blocker};
use crate::model::{CLASSIC_MAP_SIZE, LevelType, ProjectSnapshot};

pub(super) fn campaign_blockers(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    let Some(campaign) = &snapshot.campaign else {
        return vec![blocker(
            "rebuilt.campaign-metadata.missing",
            "Campaign contact, restrictions, and party guidance must be authored before Rebuilt packaging.",
            Some(snapshot.project_id.clone()),
        )];
    };
    let mut blockers = Vec::new();
    if campaign.name.trim().is_empty() {
        blockers.push(blocker(
            "rebuilt.campaign-metadata.name-empty",
            "The Rebuilt campaign name cannot be empty.",
            Some(snapshot.project_id.clone()),
        ));
    }
    if !(1..=6).contains(&campaign.restrictions.max_party_size) {
        blockers.push(blocker(
            "rebuilt.campaign-metadata.party-size",
            "The Rebuilt maximum party size must be between 1 and 6.",
            Some(snapshot.project_id.clone()),
        ));
    }
    blockers
}

pub(super) fn start_location_blockers(snapshot: &ProjectSnapshot) -> Vec<CompatibilityBlocker> {
    start_location_issue(snapshot).into_iter().collect()
}

pub(crate) fn imported_start_location_requires_deferred_capability(
    snapshot: &ProjectSnapshot,
) -> bool {
    matches!(
        snapshot.origin,
        crate::model::ProjectOrigin::Imported { .. }
    ) && snapshot.start_location.is_some()
        && start_location_issue(snapshot)
            .is_some_and(|issue| issue.code != "rebuilt.start-location.not-land")
}

pub(super) fn deferred_start_location_warning(snapshot: &ProjectSnapshot) -> CompatibilityBlocker {
    let issue = start_location_issue(snapshot).expect("deferred start has an issue");
    blocker(
        "rebuilt.deferred-reference",
        format!(
            "Imported Classic startup location is preserved, but cannot start: {}",
            issue.message
        ),
        issue.entity,
    )
}

fn start_location_issue(snapshot: &ProjectSnapshot) -> Option<CompatibilityBlocker> {
    let Some(start) = &snapshot.start_location else {
        return Some(blocker(
            "rebuilt.start-location.missing",
            "A package start map and coordinate must be authored before Rebuilt packaging.",
            Some(snapshot.project_id.clone()),
        ));
    };
    let Some(map) = snapshot
        .world
        .maps
        .iter()
        .find(|map| map.identity == start.map)
    else {
        return Some(blocker(
            "rebuilt.start-location.map-unavailable",
            format!("The package start map '{}' is unavailable.", start.map.0),
            Some(start.map.clone()),
        ));
    };
    if map.level_type != LevelType::Land {
        return Some(blocker(
            "rebuilt.start-location.not-land",
            "The Classic scenario start location must identify a land map.",
            Some(map.identity.clone()),
        ));
    }
    if usize::from(start.coordinate.x) >= CLASSIC_MAP_SIZE
        || usize::from(start.coordinate.y) >= CLASSIC_MAP_SIZE
    {
        return Some(blocker(
            "rebuilt.start-location.out-of-range",
            format!(
                "The package start coordinate ({},{}) is outside map '{}'.",
                start.coordinate.x, start.coordinate.y, map.identity.0
            ),
            Some(map.identity.clone()),
        ));
    }
    None
}
