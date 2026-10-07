use super::RebuiltV3ReachableRuntimeError;
use crate::model::{ClassicResourceKey, ProjectOrigin, ProjectSnapshot};
use crate::rebuilt::{
    assets::{RebuiltV3AssetIndex, project_rebuilt_v3_selected_classic_resources},
    combat_selection::RebuiltV3ReachableCombatSelection,
    encounters::{RebuiltV3ComplexEncounter, RebuiltV3RogueEncounter, RebuiltV3SimpleEncounter},
    item_spell_selection::{
        RebuiltV3ReachableItemSpellSelection, project_rebuilt_v3_reachable_items_and_spells,
    },
    message_selection::{
        RebuiltV3ReachableMessageSelection, project_rebuilt_v3_reachable_messages,
    },
    owner_selection::{RebuiltV3ReachableOwnerSelection, project_rebuilt_v3_reachable_owners},
    reachability::RebuiltV3ReachabilityReport,
    scenario::RebuiltV3ScenarioDocument,
};
use std::collections::BTreeSet;

pub(super) struct SelectedEncounters {
    pub scenario: RebuiltV3ScenarioDocument,
    pub simple: Vec<RebuiltV3SimpleEncounter>,
    pub complex: Vec<RebuiltV3ComplexEncounter>,
    pub rogue: Vec<RebuiltV3RogueEncounter>,
    pub rogue_ids: BTreeSet<u32>,
}

pub(super) struct SelectedCatalogs {
    pub messages: RebuiltV3ReachableMessageSelection,
    pub owners: RebuiltV3ReachableOwnerSelection,
    pub item_spells: RebuiltV3ReachableItemSpellSelection,
}

pub(super) struct SelectedTextResources {
    pub text_ids: Vec<i32>,
    pub style_ids: Vec<i32>,
    pub assets: RebuiltV3AssetIndex,
}

pub(super) fn select_encounters(
    snapshot: &ProjectSnapshot,
    reachability: &RebuiltV3ReachabilityReport,
) -> Result<SelectedEncounters, RebuiltV3ReachableRuntimeError> {
    let (scenario, simple_projection, complex_projection) =
        crate::rebuilt::scenario::project_rebuilt_v3_selected_scenario(snapshot, reachability)
            .map_err(RebuiltV3ReachableRuntimeError::Scenario)?;
    let requested_rogue_ids = complex_projection
        .complex_encounters
        .iter()
        .filter(|encounter| encounter.thief)
        .map(|encounter| {
            u32::try_from(encounter.thief_success)
                .expect("selected Complex projection resolved a nonnegative Rogue ID")
        })
        .collect::<std::collections::BTreeSet<_>>();
    let allow_deferred = matches!(snapshot.origin, ProjectOrigin::Imported { .. });
    let available_rogue_ids = snapshot
        .rogue_encounters
        .iter()
        .map(|encounter| encounter.native_id.0)
        .collect::<std::collections::BTreeSet<_>>();
    let rogue_ids = if allow_deferred {
        requested_rogue_ids
            .intersection(&available_rogue_ids)
            .copied()
            .collect()
    } else {
        requested_rogue_ids.clone()
    };
    let rogue_encounters =
        crate::rebuilt::encounters::project_rebuilt_v3_selected_rogue_encounters(
            snapshot, &rogue_ids,
        )
        .map_err(RebuiltV3ReachableRuntimeError::Rogue)?;

    Ok(SelectedEncounters {
        scenario,
        simple: simple_projection.simple_encounters,
        complex: complex_projection.complex_encounters,
        rogue: rogue_encounters,
        rogue_ids,
    })
}

pub(super) fn select_catalogs(
    snapshot: &ProjectSnapshot,
    encounters: &SelectedEncounters,
    combat: &RebuiltV3ReachableCombatSelection,
) -> Result<SelectedCatalogs, RebuiltV3ReachableRuntimeError> {
    let message_selection = project_rebuilt_v3_reachable_messages(
        snapshot,
        &encounters.scenario,
        &encounters.simple,
        &encounters.complex,
        &encounters.rogue,
        combat,
    )
    .map_err(RebuiltV3ReachableRuntimeError::Message)?;
    let owner_selection = project_rebuilt_v3_reachable_owners(snapshot, &encounters.scenario)
        .map_err(RebuiltV3ReachableRuntimeError::Owner)?;
    let item_spells = project_rebuilt_v3_reachable_items_and_spells(
        snapshot,
        &encounters.scenario,
        &encounters.complex,
        &encounters.rogue,
        &owner_selection,
        combat,
    )
    .map_err(RebuiltV3ReachableRuntimeError::ItemSpell)?;

    Ok(SelectedCatalogs {
        messages: message_selection,
        owners: owner_selection,
        item_spells,
    })
}

pub(super) fn select_text_resources(
    snapshot: &ProjectSnapshot,
    scenario: &RebuiltV3ScenarioDocument,
) -> Result<SelectedTextResources, RebuiltV3ReachableRuntimeError> {
    let text_keys = scenario
        .programs
        .iter()
        .flat_map(|program| &program.instructions)
        .filter(|instruction| instruction.opcode == 62)
        .map(|instruction| ClassicResourceKey {
            resource_type: "TEXT".into(),
            resource_id: i32::from(instruction.id),
        })
        .collect::<std::collections::BTreeSet<_>>();
    let style_keys = text_keys
        .iter()
        .map(|key| ClassicResourceKey {
            resource_type: "styl".into(),
            resource_id: key.resource_id,
        })
        .collect::<std::collections::BTreeSet<_>>();
    let assets = project_rebuilt_v3_selected_classic_resources(snapshot, &text_keys, &style_keys)
        .map_err(RebuiltV3ReachableRuntimeError::Asset)?;
    let reachable_style_resource_ids = assets
        .assets
        .iter()
        .filter(|asset| asset.resource_type.as_deref() == Some("styl"))
        .filter_map(|asset| asset.resource_id)
        .collect();

    Ok(SelectedTextResources {
        text_ids: text_keys.iter().map(|key| key.resource_id).collect(),
        style_ids: reachable_style_resource_ids,
        assets,
    })
}
