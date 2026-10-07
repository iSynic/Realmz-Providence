use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::rebuilt::RebuiltV3MediaOwner;
use providence_core::rebuilt::RebuiltV3MediaRequirement;
use providence_core::rebuilt::RebuiltV3ReachableRuntimeSelection;
use providence_core::rebuilt::RebuiltV3RuntimeMediaReference;
use providence_core::rebuilt::derive_rebuilt_v3_reachable_media_references;
use providence_core::rebuilt::derive_rebuilt_v3_reachable_media_references_with_application;
use providence_core::rebuilt::project_rebuilt_v3_selected_assets;
use providence_core::references::ReferenceDescriptor;
use providence_core::references::RepairAction;
use providence_core::references::ResolutionState;
use providence_core::session::Revision;
use serde::Serialize;
use serde_json::Value;
use serde_json::json;
use std::collections::BTreeMap;
use std::collections::BTreeSet;

pub(crate) fn media_reference_is_problem(reference: &RebuiltV3RuntimeMediaReference) -> bool {
    (reference.requirement != RebuiltV3MediaRequirement::OptionalCompanion
        && reference.resolution == ResolutionState::Ambiguous)
        || (matches!(
            reference.requirement,
            RebuiltV3MediaRequirement::PackageRequired
                | RebuiltV3MediaRequirement::ApplicationRequired
                | RebuiltV3MediaRequirement::StockFallbackAllowed
        ) && reference.resolution == ResolutionState::Missing)
}

pub(crate) fn readiness_blocking_media_references(
    references: &[RebuiltV3RuntimeMediaReference],
    invalid_world_player_map: Option<&StableId>,
) -> Vec<RebuiltV3RuntimeMediaReference> {
    references
        .iter()
        .filter(|reference| {
            (reference.requirement != RebuiltV3MediaRequirement::OptionalCompanion
                && reference.resolution == ResolutionState::Ambiguous)
                || (reference.resolution == ResolutionState::Missing
                    && (matches!(
                        reference.requirement,
                        RebuiltV3MediaRequirement::PackageRequired
                            | RebuiltV3MediaRequirement::ApplicationRequired
                    ) || invalid_world_player_map == Some(&reference.source)))
        })
        .cloned()
        .collect()
}

pub(crate) fn grouped_media_problem_references(
    references: &[RebuiltV3RuntimeMediaReference],
) -> Result<Vec<(RebuiltV3RuntimeMediaReference, usize)>, String> {
    let mut grouped = BTreeMap::<String, (RebuiltV3RuntimeMediaReference, usize)>::new();
    for reference in references
        .iter()
        .filter(|reference| media_reference_is_problem(reference))
    {
        let target_key = serde_json::to_string(&(
            &reference.asset_id,
            &reference.classic_resource,
            &reference.expected_asset_kind,
        ))
        .map_err(|error| format!("could not group media problem: {error}"))?;
        let entry = grouped
            .entry(target_key)
            .or_insert_with(|| (reference.clone(), 0));
        entry.1 += 1;
    }

    Ok(grouped.into_values().collect())
}

pub(crate) fn media_problem_projection(
    reference: &RebuiltV3RuntimeMediaReference,
    uses: usize,
    authoring_references: &[ReferenceDescriptor],
) -> Result<Value, String> {
    let authoring = authoring_references.iter().find(|candidate| {
        candidate.source == reference.source && candidate.field.0 == reference.field_path
    });
    let target_kind = authoring
        .map(|candidate| serialized_key(&candidate.target_kind))
        .transpose()?
        .unwrap_or_else(|| media_target_kind(reference).into());
    let target_id = media_problem_target_id(reference, authoring);
    let resolution = serialized_key(&reference.resolution)?;
    let code = if reference.resolution == ResolutionState::Ambiguous {
        "rebuilt.media.ambiguous-target"
    } else {
        "rebuilt.media.missing-target"
    };
    let repair_actions = media_repair_actions(reference, authoring);
    let byte_provenance = authoring.and_then(|candidate| candidate.byte_provenance.clone());
    Ok(json!({
        "id": format!(
            "rebuilt-media|{}|{}|{}|{}",
            reference.source.0, reference.field_path, target_kind, target_id
        ),
        "code": code,
        "severity": "error",
        "message": format!(
            "{} {} has a {} {} media target {}.",
            reference.source.0, reference.field_path, resolution, target_kind, target_id
        ),
        "source": reference.source,
        "field": reference.field_path,
        "targetKind": target_kind,
        "targetId": target_id,
        "assetId": reference.asset_id,
        "classicResource": reference.classic_resource,
        "expectedAssetKind": reference.expected_asset_kind,
        "relation": reference.relation,
        "requirement": reference.requirement,
        "resolution": reference.resolution,
        "required": reference.requirement != RebuiltV3MediaRequirement::OptionalCompanion,
        "uses": uses,
        "repairActions": repair_actions,
        "byteProvenance": byte_provenance,
        "navigation": {
            "documentKind": media_source_document_kind(&reference.source),
            "identity": reference.source,
            "field": reference.field_path,
        },
    }))
}

pub(crate) fn media_target_kind(reference: &RebuiltV3RuntimeMediaReference) -> &'static str {
    match reference
        .classic_resource
        .as_ref()
        .map(|resource| resource.resource_type.as_str())
    {
        Some("cicn") => "icon",
        Some("PICT") => "picture",
        Some("snd ") => "sound",
        Some("TEXT") | Some("styl") => "text-resource",
        _ if reference.asset_id.is_some() => "asset",
        _ => "media",
    }
}

pub(crate) fn media_source_document_kind(source: &StableId) -> &'static str {
    match source.0.split(':').next().unwrap_or_default() {
        "player-map" => "player-map",
        "land" | "dungeon" => "map",
        "action-point" => "action-point",
        "extra-action-point" | "xap" => "extra-action-point",
        "simple-encounter" => "simple-encounter",
        "complex-encounter" => "complex-encounter",
        "rogue-encounter" => "rogue-encounter",
        "battle" => "battle",
        "monster" => "monster",
        "item" => "item",
        "spell" => "spell",
        "terrain" => "terrain-profile",
        _ => "project",
    }
}

pub(crate) fn inspect_rebuilt_media_projection(
    snapshot: &ProjectSnapshot,
    revision: Revision,
    runtime: &RebuiltV3ReachableRuntimeSelection,
    application_media: Option<&ApplicationMediaCatalog>,
    params: &Value,
) -> Result<Value, String> {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(100)
        .clamp(1, 200) as usize;
    let references = reachable_media_references(snapshot, runtime, application_media);
    let mut counts = media_counts(snapshot, &references)?;

    let grouped_problems = grouped_media_problem_references(&references)?;
    let problem_targets = grouped_problems.len();
    counts["problemTargets"] = json!(problem_targets);
    let problems = media_problem_page(grouped_problems, offset, limit)?;

    Ok(json!({
        "revision": revision,
        "ready": problem_targets == 0,
        "counts": counts,
        "runtime": {
            "programs": runtime.reachable_program_ids.len(),
            "simpleEncounters": runtime.reachable_simple_encounter_ids.len(),
            "complexEncounters": runtime.reachable_complex_encounter_ids.len(),
            "rogueEncounters": runtime.reachable_rogue_encounter_ids.len(),
            "messages": runtime.reachable_message_ids.len(),
            "battles": runtime.combat.battles.len(),
            "monsters": runtime.combat.monsters.len(),
            "items": runtime.item_spells.items.len(),
            "spells": runtime.item_spells.spells.len(),
        },
        "problems": problems,
        "offset": offset,
        "limit": limit,
        "total": problem_targets,
        "truncated": offset.saturating_add(limit) < problem_targets,
    }))
}

pub(crate) fn serialized_key<T: Serialize>(value: &T) -> Result<String, String> {
    serde_json::to_value(value)
        .map_err(|error| format!("could not encode media classification: {error}"))?
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| "media classification did not serialize as a string".into())
}

fn media_problem_target_id(
    reference: &RebuiltV3RuntimeMediaReference,
    authoring: Option<&ReferenceDescriptor>,
) -> String {
    authoring
        .map(|candidate| candidate.target_id.clone())
        .or_else(|| {
            reference
                .asset_id
                .as_ref()
                .map(|identity| identity.0.clone())
        })
        .or_else(|| {
            reference
                .classic_resource
                .as_ref()
                .map(|resource| resource.resource_id.to_string())
        })
        .unwrap_or_else(|| "unidentified".into())
}

pub(crate) fn reachable_media_references(
    snapshot: &ProjectSnapshot,
    runtime: &RebuiltV3ReachableRuntimeSelection,
    application_media: Option<&ApplicationMediaCatalog>,
) -> Vec<RebuiltV3RuntimeMediaReference> {
    if let Some(application_media) = application_media {
        derive_rebuilt_v3_reachable_media_references_with_application(
            snapshot,
            application_media,
            &runtime.scenario,
            &runtime.item_spells.items,
            &runtime.item_spells.spells,
            &runtime.combat.monsters,
            &runtime.rogue_encounters,
            !runtime.combat.battles.is_empty(),
        )
    } else {
        derive_rebuilt_v3_reachable_media_references(
            snapshot,
            &runtime.scenario,
            &runtime.item_spells.items,
            &runtime.item_spells.spells,
            &runtime.combat.monsters,
            &runtime.rogue_encounters,
            !runtime.combat.battles.is_empty(),
        )
    }
}

fn media_counts(
    snapshot: &ProjectSnapshot,
    references: &[RebuiltV3RuntimeMediaReference],
) -> Result<Value, String> {
    let mut resolutions = BTreeMap::<String, usize>::new();
    let mut requirements = BTreeMap::<String, usize>::new();
    let mut relations = BTreeMap::<String, usize>::new();
    let mut resolved_assets = BTreeSet::new();
    let mut application_assets = BTreeSet::new();
    let mut problem_uses = 0usize;
    for reference in references {
        *resolutions
            .entry(serialized_key(&reference.resolution)?)
            .or_default() += 1;
        *requirements
            .entry(serialized_key(&reference.requirement)?)
            .or_default() += 1;
        *relations
            .entry(serialized_key(&reference.relation)?)
            .or_default() += 1;
        if let Some(identity) = &reference.resolved_asset_id {
            match reference.resolved_owner {
                Some(RebuiltV3MediaOwner::ScenarioPackage) => {
                    resolved_assets.insert(identity.clone());
                }
                Some(RebuiltV3MediaOwner::ClassicApplication) => {
                    application_assets.insert(identity.clone());
                }
                None => {}
            }
        }
        problem_uses += usize::from(media_reference_is_problem(reference));
    }
    let selected_assets = project_rebuilt_v3_selected_assets(snapshot, &resolved_assets)
        .map_err(|error| format!("reachable media projection failed: {error}"))?;

    Ok(json!({
        "references": references.len(),
        "resolvedAssets": selected_assets.assets.len(),
        "resolvedApplicationAssets": application_assets.len(),
        "problemUses": problem_uses,
        "resolutions": resolutions,
        "requirements": requirements,
        "relations": relations,
    }))
}

fn media_problem_page(
    grouped_problems: Vec<(RebuiltV3RuntimeMediaReference, usize)>,
    offset: usize,
    limit: usize,
) -> Result<Vec<Value>, String> {
    grouped_problems
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(|(reference, uses)| {
            let mut value = serde_json::to_value(reference)
                .map_err(|error| format!("could not encode media problem: {error}"))?;
            value
                .as_object_mut()
                .expect("media reference serializes as an object")
                .insert("uses".into(), json!(uses));
            Ok(value)
        })
        .collect::<Result<Vec<_>, String>>()
}

fn media_repair_actions(
    reference: &RebuiltV3RuntimeMediaReference,
    authoring: Option<&ReferenceDescriptor>,
) -> Vec<RepairAction> {
    authoring
        .map(|candidate| candidate.repair_actions.clone())
        .unwrap_or_else(|| {
            if reference.resolution == ResolutionState::Ambiguous {
                vec![RepairAction::ChooseCandidate]
            } else {
                vec![RepairAction::ImportTarget]
            }
        })
}
