use super::{RebuiltV3RuleCatalog, project_rebuilt_v3_rule_catalog};
use crate::model::{
    ClassicRuleSelectionEvidence, ClassicRuleSelectionPolicy, ProjectSnapshot, SourcedCasteRule,
    SourcedRaceRule,
};
#[cfg(test)]
#[path = "classic_rule_resolution_tests.rs"]
mod tests;

pub struct ClassicRuleNameOverrides {
    pub races: Option<Vec<String>>,
    pub castes: Option<Vec<String>>,
}

// An operation-local projection. Neither selected stock rows nor derived eligibility are edits.
pub struct ResolvedClassicRules {
    pub effective_snapshot: ProjectSnapshot,
    pub runtime_overrides: RebuiltV3RuleCatalog,
    pub context_identity: String,
    pub race_source: &'static str,
    pub caste_source: &'static str,
}

pub fn selected_classic_rule_sources(
    snapshot: &ProjectSnapshot,
) -> Result<(&'static str, &'static str), String> {
    let context = snapshot
        .classic_rule_selection
        .as_ref()
        .ok_or("Classic rule selection is unresolved")?;
    context.validate_binding(snapshot)?;
    let local = context.policy() == ClassicRuleSelectionPolicy::ScenarioFirst;
    Ok((
        if local && scenario_family_present(snapshot, "Data Race", true) {
            "scenario"
        } else {
            "application"
        },
        if local && scenario_family_present(snapshot, "Data Caste", false) {
            "scenario"
        } else {
            "application"
        },
    ))
}

pub fn resolve_classic_rules(
    snapshot: &ProjectSnapshot,
    application: &RebuiltV3RuleCatalog,
    names: &ClassicRuleNameOverrides,
) -> Result<ResolvedClassicRules, String> {
    let context = snapshot.classic_rule_selection.as_ref().ok_or(
        "Classic rule selection is unresolved; configure the intended Castle execution selection",
    )?;
    context.validate_binding(snapshot)?;
    if !matches!(
        context.evidence_origin,
        ClassicRuleSelectionEvidence::OwnerConfigured
    ) {
        return Err("captured native selection requires a verified runtime capture channel".into());
    }
    let mut effective = snapshot.clone();
    effective.classic_rule_selection = None;
    effective.rule_names = None;
    let stock = validated_application_rules(snapshot, application)?;
    let (race_source, caste_source) = selected_classic_rule_sources(snapshot)?;
    let local_race = race_source == "scenario";
    let local_caste = caste_source == "scenario";
    validate_present_families(snapshot, local_race, local_caste)?;
    if !local_race {
        effective.race_rules = stock.race_rules;
    }
    if !local_caste {
        effective.caste_rules = stock.caste_rules;
    }
    seed_names(&mut effective, application);
    apply_names(&mut effective, snapshot, names)?;
    crate::codecs::derive_caste_eligibility(&effective.race_rules, &mut effective.caste_rules)
        .map_err(|error| format!("effective rule eligibility: {error}"))?;
    let catalog = project_rebuilt_v3_rule_catalog(&effective).map_err(|error| error.to_string())?;
    let races = catalog
        .races
        .into_iter()
        .filter(|rule| {
            local_race || application.races.iter().find(|stock| stock.id == rule.id) != Some(rule)
        })
        .collect();
    let castes = catalog
        .castes
        .into_iter()
        .filter(|rule| {
            local_caste
                || !application
                    .castes
                    .iter()
                    .any(|stock| same_caste(stock, rule))
        })
        .collect();
    Ok(ResolvedClassicRules {
        effective_snapshot: effective,
        runtime_overrides: RebuiltV3RuleCatalog { races, castes },
        context_identity: context.identity(),
        race_source,
        caste_source,
    })
}

fn validated_application_rules(
    snapshot: &ProjectSnapshot,
    application: &RebuiltV3RuleCatalog,
) -> Result<ProjectSnapshot, String> {
    let mut stock = ProjectSnapshot::new_authored(snapshot.project_id.clone());
    stock.race_rules = application
        .races
        .iter()
        .cloned()
        .map(|definition| SourcedRaceRule {
            source: "selected application rules".into(),
            source_blob: None,
            definition,
        })
        .collect();
    stock.caste_rules = application
        .castes
        .iter()
        .cloned()
        .map(|definition| SourcedCasteRule {
            source: "selected application rules".into(),
            source_blob: None,
            definition,
        })
        .collect();
    project_rebuilt_v3_rule_catalog(&stock)
        .map_err(|error| format!("application rules: {error}"))?;
    Ok(stock)
}

fn validate_present_families(
    snapshot: &ProjectSnapshot,
    local_race: bool,
    local_caste: bool,
) -> Result<(), String> {
    if local_race
        && let Some(source) = snapshot
            .classic_sources
            .iter()
            .find(|source| source.native_path == "Data Race")
        && source.byte_length < (30 * crate::codecs::RACE_RECORD_BYTES) as u64
    {
        return Err(format!(
            "Selected scenario Data Race is quarantined: {} bytes cannot supply Castle's 30 complete 408-byte records. Choose application rules or replace the malformed table.",
            source.byte_length
        ));
    }
    for (path, selected, rows) in [
        ("Data Race", local_race, snapshot.race_rules.len()),
        ("Data Caste", local_caste, snapshot.caste_rules.len()),
    ] {
        if selected
            && snapshot
                .classic_sources
                .iter()
                .any(|source| source.native_path == path)
            && rows != 30
        {
            return Err(format!(
                "selected scenario {path} must contain 30 usable records; found {rows}"
            ));
        }
    }
    Ok(())
}

fn same_caste(
    left: &crate::model::CasteRuleDefinition,
    right: &crate::model::CasteRuleDefinition,
) -> bool {
    let mut left = left.clone();
    let mut right = right.clone();
    left.eligible_race_ids.sort();
    right.eligible_race_ids.sort();
    left == right
}

fn scenario_family_present(snapshot: &ProjectSnapshot, path: &str, race: bool) -> bool {
    snapshot
        .classic_sources
        .iter()
        .any(|source| source.native_path == path)
        || if race {
            snapshot.race_rules.iter().any(|rule| {
                rule.source_blob.is_none() || rule.source.starts_with("Scenario Data Race ")
            })
        } else {
            snapshot.caste_rules.iter().any(|rule| {
                rule.source_blob.is_none() || rule.source.starts_with("Scenario Data Caste ")
            })
        }
}

fn seed_names(effective: &mut ProjectSnapshot, application: &RebuiltV3RuleCatalog) {
    for row in &mut effective.race_rules {
        if row.definition.name.is_empty()
            && let Some(stock) = application
                .races
                .iter()
                .find(|stock| stock.id == row.definition.id)
        {
            row.definition.name = stock.name.clone();
        }
    }
    for row in &mut effective.caste_rules {
        if row.definition.name.is_empty()
            && let Some(stock) = application
                .castes
                .iter()
                .find(|stock| stock.id == row.definition.id)
        {
            row.definition.name = stock.name.clone();
        }
    }
}

fn apply_names(
    effective: &mut ProjectSnapshot,
    imported: &ProjectSnapshot,
    names: &ClassicRuleNameOverrides,
) -> Result<(), String> {
    for (family, values) in [("Race", &names.races), ("Caste", &names.castes)] {
        if values.as_ref().is_some_and(|values| values.len() < 30) {
            return Err(format!(
                "scenario STR# {family} names must contain all 30 entries"
            ));
        }
    }
    for rule in &mut effective.race_rules {
        let id = rule.definition.classic_id;
        if let Some(name) = names
            .races
            .as_ref()
            .and_then(|values| values.get(usize::from(id.saturating_sub(1))))
        {
            rule.definition.name = name.clone();
        }
        if let Some(authored) = imported
            .race_rules
            .iter()
            .find(|row| row.definition.classic_id == id && !row.definition.name.is_empty())
        {
            rule.definition.name = authored.definition.name.clone();
        }
    }
    for rule in &mut effective.caste_rules {
        let id = rule.definition.classic_id;
        if let Some(name) = names
            .castes
            .as_ref()
            .and_then(|values| values.get(usize::from(id.saturating_sub(1))))
        {
            rule.definition.name = name.clone();
        }
        if let Some(authored) = imported
            .caste_rules
            .iter()
            .find(|row| row.definition.classic_id == id && !row.definition.name.is_empty())
        {
            rule.definition.name = authored.definition.name.clone();
        }
    }
    Ok(())
}
