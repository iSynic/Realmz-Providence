use super::*;
use crate::codecs::decode_race_rules;

// Retained permissions are evidence. Only newly added permissions require a live target.
pub(super) fn validate(
    snapshot: &ProjectSnapshot,
    draft: &RuleRecordDraft,
    sources: &RuleAuthoringSources<'_>,
    baseline: &RuleAuthoringBaseline<'_>,
) -> Result<(), String> {
    let previous = previous_permissions(snapshot, draft, sources, baseline);
    let (target_kind, desired) = match &draft.edit {
        RuleEdit::Race { definition } => (RuleKind::Caste, &definition.eligible_caste_ids),
        RuleEdit::Caste { definition, .. } => (RuleKind::Race, &definition.eligible_race_ids),
    };
    let owners = rule_catalog_ownership(snapshot, target_kind, sources, baseline)?;
    for identity in desired.iter().filter(|id| !previous.contains(id)) {
        let id = identity
            .0
            .rsplit('.')
            .next()
            .and_then(|v| v.parse::<u8>().ok());
        let Some(id) = id.filter(|id| (1..=30).contains(id)) else {
            return Err("Choose an exact rule identity from 1 through 30.".into());
        };
        if *identity != target_kind.identity(id) {
            return Err("The permitted target belongs to a different rule family.".into());
        }
        if owners[usize::from(id - 1)] == RuleOwnership::Vacant {
            return Err(format!(
                "{} {id} is an empty slot. Create it before adding this permission; your draft is retained.",
                target_kind.family().trim_start_matches("Data ")
            ));
        }
    }
    Ok(())
}

fn previous_permissions(
    snapshot: &ProjectSnapshot,
    draft: &RuleRecordDraft,
    sources: &RuleAuthoringSources<'_>,
    baseline: &RuleAuthoringBaseline<'_>,
) -> Vec<StableId> {
    if draft.allocation && draft.copy_source.is_none() {
        return Vec::new();
    }
    let copy = draft.copy_source.as_ref();
    let id = copy.map_or(draft.edit.classic_id(), |c| c.classic_id);
    let stock = copy.is_some_and(|c| c.scope == "stock");
    let races = if stock {
        decode_race_rules(baseline.race, None).rules
    } else if snapshot.race_rules.is_empty() {
        decode_race_rules(sources.race, None).rules
    } else {
        snapshot.race_rules.clone()
    };
    match draft.edit.kind() {
        RuleKind::Race => races
            .iter()
            .find(|r| r.definition.classic_id == id)
            .map(|r| r.definition.eligible_caste_ids.clone())
            .unwrap_or_default(),
        RuleKind::Caste => races
            .iter()
            .filter(|r| {
                r.definition
                    .eligible_caste_ids
                    .contains(&RuleKind::Caste.identity(id))
            })
            .map(|r| r.definition.id.clone())
            .collect(),
    }
}
