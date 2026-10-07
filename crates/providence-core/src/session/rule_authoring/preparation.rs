use super::*;
use crate::codecs::{
    decode_caste_rules, decode_race_rules, derive_caste_eligibility, encode_caste_rules,
    encode_race_rules, patch_caste_native_fields,
};
use crate::model::{BlobId, SourcedCasteRule, SourcedRaceRule};
use crate::references::ReferenceDescriptor;
use crate::session::EditorSession;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreparedRuleCommit {
    pub expected_family_hash: String,
    pub identity: StableId,
    pub races: Vec<SourcedRaceRule>,
    pub castes: Vec<SourcedCasteRule>,
    pub names: RuleNameCatalog,
}

pub struct PreparedRuleWrite {
    pub commit: PreparedRuleCommit,
    pub race_bytes: Vec<u8>,
    pub caste_bytes: Vec<u8>,
}

pub fn prepare_rule_draft(
    snapshot: &ProjectSnapshot,
    draft: &RuleRecordDraft,
    sources: &RuleAuthoringSources<'_>,
    baseline: &RuleAuthoringBaseline<'_>,
) -> Result<PreparedRuleWrite, String> {
    prepare(snapshot, draft, sources, baseline, None)
}

impl EditorSession {
    pub fn prepare_rule_draft(
        &self,
        draft: &RuleRecordDraft,
        sources: &RuleAuthoringSources<'_>,
        baseline: &RuleAuthoringBaseline<'_>,
    ) -> Result<PreparedRuleWrite, String> {
        let references = draft
            .allocation
            .then(|| self.projections.references(self.snapshot()));
        prepare(self.snapshot(), draft, sources, baseline, references)
    }
}

fn prepare(
    snapshot: &ProjectSnapshot,
    draft: &RuleRecordDraft,
    sources: &RuleAuthoringSources<'_>,
    baseline: &RuleAuthoringBaseline<'_>,
    references: Option<&[ReferenceDescriptor]>,
) -> Result<PreparedRuleWrite, String> {
    validate_destination(snapshot, draft, sources, baseline, references)?;
    super::validation::validate_changed_ranges(draft, sources, baseline)?;
    super::eligibility::validate(snapshot, draft, sources, baseline)?;
    let mut races = if snapshot.race_rules.is_empty() {
        decode_race_rules(sources.race, None).rules
    } else {
        snapshot.race_rules.clone()
    };
    let mut castes = if snapshot.caste_rules.is_empty() {
        decode_caste_rules(sources.caste, None).rules
    } else {
        snapshot.caste_rules.clone()
    };
    if races.len() != 30 || castes.len() != 30 {
        return Err("Authoring requires all 30 source rows in each rule family.".into());
    }
    let mut names = snapshot
        .rule_names
        .clone()
        .unwrap_or_else(|| baseline.names.clone());
    let caste_source = apply_edit(draft, &mut races, &mut castes, &mut names, sources.caste)?;
    derive_caste_eligibility(&races, &mut castes).map_err(|e| e.to_string())?;
    let race_bytes = encode_race_rules(&races, Some(sources.race)).map_err(|e| e.to_string())?;
    let caste_bytes =
        encode_caste_rules(&castes, Some(&caste_source)).map_err(|e| e.to_string())?;
    for race in &mut races {
        race.source_blob = Some(BlobId(digest(&race_bytes)));
    }
    for caste in &mut castes {
        caste.source_blob = Some(BlobId(digest(&caste_bytes)));
    }
    Ok(PreparedRuleWrite {
        commit: PreparedRuleCommit {
            expected_family_hash: draft.expected_family_hash.clone(),
            identity: draft.edit.identity().clone(),
            races,
            castes,
            names,
        },
        race_bytes,
        caste_bytes,
    })
}

fn validate_destination(
    snapshot: &ProjectSnapshot,
    draft: &RuleRecordDraft,
    sources: &RuleAuthoringSources<'_>,
    baseline: &RuleAuthoringBaseline<'_>,
    references: Option<&[ReferenceDescriptor]>,
) -> Result<(), String> {
    if draft.expected_family_hash != rule_family_hash(snapshot) {
        return Err("The saved rule family changed. Your local draft was retained; review the saved version.".into());
    }
    let kind = draft.edit.kind();
    let id = draft.edit.classic_id();
    if *draft.edit.identity() != kind.identity(id) {
        return Err("The rule draft cannot change its fixed identity.".into());
    }
    let ownership = rule_ownership(snapshot, kind, id, sources, baseline)?;
    if draft.allocation && ownership != RuleOwnership::Vacant {
        return Err("The reviewed custom destination is occupied. No record was replaced.".into());
    }
    if !draft.allocation && ownership != RuleOwnership::Scenario {
        return Err(
            "Copy a stock rule into a reviewed vacant custom identity before editing.".into(),
        );
    }
    if draft.allocation
        && match references {
            Some(references) => has_callers_in(snapshot, kind, id, baseline, references),
            None => has_callers(snapshot, kind, id, baseline),
        }
    {
        return Err("The destination has incoming uses. Review another vacant identity.".into());
    }
    if let Some(copy) = &draft.copy_source {
        if copy.kind != kind {
            return Err("The copy source belongs to a different rule family.".into());
        }
        if (copy.scope == "stock" && copy.classic_id >= kind.custom_start())
            || (copy.scope == "scenario"
                && rule_ownership(snapshot, kind, copy.classic_id, sources, baseline)?
                    == RuleOwnership::Vacant)
        {
            return Err("An empty rule slot is not a copy source. Create a record first.".into());
        }
        validate_copy(snapshot, copy, baseline)?;
    }
    Ok(())
}

pub(super) fn has_callers(
    snapshot: &ProjectSnapshot,
    kind: RuleKind,
    id: u8,
    baseline: &RuleAuthoringBaseline<'_>,
) -> bool {
    has_callers_in(
        snapshot,
        kind,
        id,
        baseline,
        &crate::session::references_for(snapshot),
    )
}

pub(super) fn has_callers_in(
    snapshot: &ProjectSnapshot,
    kind: RuleKind,
    id: u8,
    baseline: &RuleAuthoringBaseline<'_>,
    references: &[ReferenceDescriptor],
) -> bool {
    let identity = kind.identity(id);
    references
        .iter()
        .any(|r| r.target_id == identity.0 && allocation_caller(snapshot, r, baseline))
}

fn allocation_caller(
    snapshot: &ProjectSnapshot,
    reference: &crate::references::ReferenceDescriptor,
    baseline: &RuleAuthoringBaseline<'_>,
) -> bool {
    // Application eligibility matrices do not occupy a scenario's vacant custom slots.
    // Authored/imported rule edges and all non-rule callers still protect destinations.
    let imported = |family| {
        snapshot
            .classic_sources
            .iter()
            .any(|s| s.native_path == family)
    };
    if let Some(row) = snapshot
        .race_rules
        .iter()
        .find(|r| r.definition.id == reference.source)
    {
        if imported("Data Race") {
            return true;
        }
        let stock = decode_race_rules(baseline.race, None).rules;
        return !stock[usize::from(row.definition.classic_id - 1)]
            .definition
            .eligible_caste_ids
            .iter()
            .any(|id| id.0 == reference.target_id);
    }
    if let Some(row) = snapshot
        .caste_rules
        .iter()
        .find(|r| r.definition.id == reference.source)
    {
        // This reciprocal edge is derived from Data Race; Data Caste has no eligibility bytes.
        if imported("Data Race") {
            return true;
        }
        let races = decode_race_rules(baseline.race, None).rules;
        return !races
            .iter()
            .find(|r| r.definition.id.0 == reference.target_id)
            .is_some_and(|r| r.definition.eligible_caste_ids.contains(&row.definition.id));
    }
    true
}

fn validate_copy(
    snapshot: &ProjectSnapshot,
    copy: &RuleCopyGuard,
    baseline: &RuleAuthoringBaseline<'_>,
) -> Result<(), String> {
    if copy.library_fingerprint != baseline.fingerprint {
        return Err("The copy source library changed. Review the source again.".into());
    }
    let payload = copy_payload(snapshot, copy.kind, copy.classic_id, &copy.scope, baseline)?;
    if digest(&payload) != copy.definition_hash {
        return Err("The copy source changed after review. Your draft was not applied.".into());
    }
    Ok(())
}

pub(super) fn copy_payload(
    snapshot: &ProjectSnapshot,
    kind: RuleKind,
    id: u8,
    scope: &str,
    baseline: &RuleAuthoringBaseline<'_>,
) -> Result<Vec<u8>, String> {
    let payload = match (scope, kind) {
        ("stock", RuleKind::Race) => serde_json::to_vec(
            &decode_race_rules(baseline.race, None)
                .rules
                .get(usize::from(
                    id.checked_sub(1).ok_or("Invalid copy identity")?,
                ))
                .ok_or("Missing stock Race")?
                .definition,
        ),
        ("stock", RuleKind::Caste) => serde_json::to_vec(
            &decode_caste_rules(baseline.caste, None)
                .rules
                .get(usize::from(
                    id.checked_sub(1).ok_or("Invalid copy identity")?,
                ))
                .ok_or("Missing stock Caste")?
                .definition,
        ),
        ("scenario", RuleKind::Race) => serde_json::to_vec(
            &snapshot
                .race_rules
                .iter()
                .find(|r| r.definition.classic_id == id)
                .ok_or("The source Race no longer exists")?
                .definition,
        ),
        ("scenario", RuleKind::Caste) => serde_json::to_vec(
            &snapshot
                .caste_rules
                .iter()
                .find(|r| r.definition.classic_id == id)
                .ok_or("The source Caste no longer exists")?
                .definition,
        ),
        _ => return Err("Choose an explicit stock or scenario copy source.".into()),
    }
    .map_err(|e| e.to_string())?;
    Ok(payload)
}

fn apply_edit(
    draft: &RuleRecordDraft,
    races: &mut [SourcedRaceRule],
    castes: &mut [SourcedCasteRule],
    names: &mut RuleNameCatalog,
    caste_bytes: &[u8],
) -> Result<Vec<u8>, String> {
    if names.race_names.len() != 30 || names.caste_names.len() != 30 {
        return Err(
            "The ordered rule name catalogs must each cover exactly 30 fixed identities.".into(),
        );
    }
    let id = draft.edit.classic_id();
    let index = usize::from(id - 1);
    match &draft.edit {
        RuleEdit::Race { definition } => {
            validate_text(&definition.name, &definition.description)?;
            let rule = races
                .iter_mut()
                .find(|r| r.definition.classic_id == id)
                .ok_or("The Race destination is unavailable")?;
            rule.definition = definition.clone();
            rule.source = format!("Scenario Data Race record {index}");
            names.race_names[index] = definition.name.clone();
            Ok(caste_bytes.to_vec())
        }
        RuleEdit::Caste {
            definition,
            native_fields,
        } => {
            validate_text(&definition.name, &definition.description)?;
            let rule = castes
                .iter_mut()
                .find(|r| r.definition.classic_id == id)
                .ok_or("The Caste destination is unavailable")?;
            rule.definition = definition.as_ref().clone();
            rule.definition.starting_item_ids = native_fields
                .starting_items
                .iter()
                .flatten()
                .cloned()
                .collect();
            rule.source = format!("Scenario Data Caste record {index}");
            names.caste_names[index] = definition.name.clone();
            apply_eligibility(races, definition)?;
            patch_caste_native_fields(caste_bytes, id, native_fields).map_err(|e| e.to_string())
        }
    }
}

fn apply_eligibility(
    races: &mut [SourcedRaceRule],
    definition: &CasteRuleDefinition,
) -> Result<(), String> {
    for identity in &definition.eligible_race_ids {
        if !races.iter().any(|r| &r.definition.id == identity) {
            return Err(format!(
                "Race {} is unavailable; it cannot be enabled.",
                identity.0
            ));
        }
    }
    for race in races {
        let enabled = definition.eligible_race_ids.contains(&race.definition.id);
        let before = race.definition.eligible_caste_ids.contains(&definition.id);
        if enabled != before {
            race.definition
                .eligible_caste_ids
                .retain(|id| id != &definition.id);
            if enabled {
                race.definition
                    .eligible_caste_ids
                    .push(definition.id.clone());
            }
            race.definition.eligible_caste_ids.sort();
            if !race.source.starts_with("Scenario Data Race record ") {
                race.source = format!(
                    "Scenario Data Race eligibility record {}",
                    race.definition.classic_id - 1
                );
            }
        }
    }
    Ok(())
}

fn validate_text(name: &str, note: &str) -> Result<(), String> {
    if name.trim().is_empty() || name.len() > 1024 || note.len() > 16384 {
        return Err(
            "Enter a name up to 1024 UTF-8 bytes and a project note up to 16384 bytes.".into(),
        );
    }
    Ok(())
}
