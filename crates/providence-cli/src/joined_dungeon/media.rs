use providence_core::model::ProjectSnapshot;
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::rebuilt::derive_rebuilt_v3_reachable_media_references;
use providence_core::rebuilt::derive_rebuilt_v3_reachable_media_references_with_application;
use providence_core::rebuilt::project_rebuilt_v3_reachable_media;
use providence_core::rebuilt::project_rebuilt_v3_reachable_media_with_application;
use providence_core::references::ResolutionState;
use serde_json::json;
use sha2::Digest;
use sha2::Sha256;
use std::collections::BTreeMap;

use super::ProjectionCheck;
use providence_core::rebuilt::{
    RebuiltV3MediaRequirement as Requirement, RebuiltV3ReachableMediaError,
    RebuiltV3ReachableMediaSelection, RebuiltV3ReachableRuntimeSelection,
    RebuiltV3RuntimeMediaReference,
};

struct MediaSummary {
    valid: bool,
    assets: usize,
    sha256: Option<String>,
    error: Option<String>,
}

pub(super) fn inspect(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    runtime: Option<&RebuiltV3ReachableRuntimeSelection>,
) -> ProjectionCheck {
    let references = runtime
        .map(|selection| media_references(snapshot, application, selection))
        .unwrap_or_default();
    let selection = runtime.map(|selection| select_media(snapshot, application, selection));
    let summary = summarize(selection);
    ProjectionCheck {
        valid: summary.valid,
        report: media_report(&references, summary),
    }
}

fn media_references(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    selection: &RebuiltV3ReachableRuntimeSelection,
) -> Vec<RebuiltV3RuntimeMediaReference> {
    match application {
        None => derive_rebuilt_v3_reachable_media_references(
            snapshot,
            &selection.scenario,
            &selection.item_spells.items,
            &selection.item_spells.spells,
            &selection.combat.monsters,
            &selection.rogue_encounters,
            !selection.combat.battles.is_empty(),
        ),
        Some(catalog) => derive_rebuilt_v3_reachable_media_references_with_application(
            snapshot,
            catalog,
            &selection.scenario,
            &selection.item_spells.items,
            &selection.item_spells.spells,
            &selection.combat.monsters,
            &selection.rogue_encounters,
            !selection.combat.battles.is_empty(),
        ),
    }
}

fn select_media(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    selection: &RebuiltV3ReachableRuntimeSelection,
) -> Result<RebuiltV3ReachableMediaSelection, RebuiltV3ReachableMediaError> {
    match application {
        None => project_rebuilt_v3_reachable_media(
            snapshot,
            &selection.scenario,
            &selection.item_spells.items,
            &selection.item_spells.spells,
            &selection.combat.monsters,
            &selection.rogue_encounters,
            !selection.combat.battles.is_empty(),
        ),
        Some(catalog) => project_rebuilt_v3_reachable_media_with_application(
            snapshot,
            catalog,
            &selection.scenario,
            &selection.item_spells.items,
            &selection.item_spells.spells,
            &selection.combat.monsters,
            &selection.rogue_encounters,
            !selection.combat.battles.is_empty(),
        ),
    }
}

fn summarize(
    selection: Option<Result<RebuiltV3ReachableMediaSelection, RebuiltV3ReachableMediaError>>,
) -> MediaSummary {
    match selection {
        Some(Ok(selection)) => {
            let bytes = serde_json::to_vec(&selection).expect("media selection serializes");
            MediaSummary {
                valid: true,
                assets: selection.assets.assets.len(),
                sha256: Some(format!("{:x}", Sha256::digest(&bytes))),
                error: None,
            }
        }
        Some(Err(error)) => MediaSummary {
            valid: false,
            assets: 0,
            sha256: None,
            error: Some(error.to_string()),
        },
        None => MediaSummary {
            valid: false,
            assets: 0,
            sha256: None,
            error: Some("runtime roots are unavailable".into()),
        },
    }
}

fn media_report(
    references: &[RebuiltV3RuntimeMediaReference],
    summary: MediaSummary,
) -> serde_json::Value {
    let media_count = |requirement, resolution| {
        references
            .iter()
            .filter(|reference| {
                reference.requirement == requirement && reference.resolution == resolution
            })
            .count()
    };
    json!({
        "valid": summary.valid,
        "references": references.len(),
        "packageRequiredResolved": media_count(
            Requirement::PackageRequired,
            ResolutionState::Resolved,
        ),
        "packageRequiredMissing": media_count(
            Requirement::PackageRequired,
            ResolutionState::Missing,
        ),
        "applicationRequiredResolved": media_count(
            Requirement::ApplicationRequired,
            ResolutionState::Resolved,
        ),
        "applicationRequiredFallback": media_count(
            Requirement::ApplicationRequired,
            ResolutionState::StockFallback,
        ),
        "applicationRequiredMissing": media_count(
            Requirement::ApplicationRequired,
            ResolutionState::Missing,
        ),
        "stockFallback": media_count(
            Requirement::StockFallbackAllowed,
            ResolutionState::StockFallback,
        ),
        "scenarioOverridesResolved": media_count(
            Requirement::StockFallbackAllowed,
            ResolutionState::Resolved,
        ),
        "optionalResolved": media_count(
            Requirement::OptionalCompanion,
            ResolutionState::Resolved,
        ),
        "optionalMissing": media_count(
            Requirement::OptionalCompanion,
            ResolutionState::Missing,
        ),
        "missingRequiredByRelation": media_relation_counts(references, true),
        "allReferencesByRelation": media_relation_counts(references, false),
        "assets": summary.assets,
        "sha256": summary.sha256,
        "error": summary.error,
        "packageOutputChanged": false,
    })
}

fn media_relation_counts(
    references: &[RebuiltV3RuntimeMediaReference],
    required_only: bool,
) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::<String, usize>::new();
    for reference in references {
        if required_only
            && !(matches!(
                reference.requirement,
                Requirement::PackageRequired | Requirement::ApplicationRequired
            ) && reference.resolution == ResolutionState::Missing)
        {
            continue;
        }
        let relation = serde_json::to_value(reference.relation)
            .ok()
            .and_then(|value| value.as_str().map(str::to_owned))
            .unwrap_or_else(|| "unknown".into());
        *counts.entry(relation).or_default() += 1;
    }
    counts
}
