use super::*;
use crate::codecs::{decode_caste_rules, decode_race_rules, read_caste_native_fields};
use crate::references::ReferenceDescriptor;
use crate::session::EditorSession;

pub fn vacant_rule_ids(
    snapshot: &ProjectSnapshot,
    kind: RuleKind,
    sources: &RuleAuthoringSources<'_>,
    baseline: &RuleAuthoringBaseline<'_>,
) -> Result<Vec<u8>, String> {
    vacancies(
        snapshot,
        kind,
        sources,
        baseline,
        &crate::session::references_for(snapshot),
    )
}

impl EditorSession {
    pub fn vacant_rule_ids(
        &self,
        kind: RuleKind,
        sources: &RuleAuthoringSources<'_>,
        baseline: &RuleAuthoringBaseline<'_>,
    ) -> Result<Vec<u8>, String> {
        vacancies(
            self.snapshot(),
            kind,
            sources,
            baseline,
            self.projections.references(self.snapshot()),
        )
    }
}

fn vacancies(
    snapshot: &ProjectSnapshot,
    kind: RuleKind,
    sources: &RuleAuthoringSources<'_>,
    baseline: &RuleAuthoringBaseline<'_>,
    references: &[ReferenceDescriptor],
) -> Result<Vec<u8>, String> {
    let owners = rule_catalog_ownership(snapshot, kind, sources, baseline)?;
    let mut vacant = Vec::new();
    for id in kind.custom_start()..=30 {
        if owners[usize::from(id - 1)] == RuleOwnership::Vacant
            && !super::preparation::has_callers_in(snapshot, kind, id, baseline, references)
        {
            vacant.push(id);
        }
    }
    Ok(vacant)
}

pub fn empty_rule_edit(kind: RuleKind, id: u8) -> Result<RuleEdit, String> {
    if !(1..=30).contains(&id) {
        return Err("Choose a fixed rule identity from 1 through 30.".into());
    }
    match kind {
        RuleKind::Race => {
            let mut definition = decode_race_rules(&vec![0; RACE_RECORD_BYTES * 30], None).rules
                [usize::from(id - 1)]
            .definition
            .clone();
            definition.name = format!(
                "New Race {}",
                crate::rule_presentation::author_number(id).unwrap()
            );
            Ok(RuleEdit::Race { definition })
        }
        RuleKind::Caste => {
            let bytes = vec![0; CASTE_RECORD_BYTES * 30];
            let mut definition = decode_caste_rules(&bytes, None).rules[usize::from(id - 1)]
                .definition
                .clone();
            definition.name = format!(
                "New Caste {}",
                crate::rule_presentation::author_number(id).unwrap()
            );
            Ok(RuleEdit::Caste {
                definition: Box::new(definition),
                native_fields: read_caste_native_fields(&bytes, id).map_err(|e| e.to_string())?,
            })
        }
    }
}

pub fn retarget_rule_edit(edit: &mut RuleEdit, id: u8) -> Result<(), String> {
    if !(1..=30).contains(&id) {
        return Err("Choose a fixed rule identity from 1 through 30.".into());
    }
    let identity = edit.kind().identity(id);
    match edit {
        RuleEdit::Race { definition } => {
            definition.id = identity;
            definition.classic_id = id;
        }
        RuleEdit::Caste { definition, .. } => {
            definition.id = identity;
            definition.classic_id = id;
        }
    }
    Ok(())
}

pub fn rule_copy_guard(
    snapshot: &ProjectSnapshot,
    kind: RuleKind,
    id: u8,
    scope: &str,
    baseline: &RuleAuthoringBaseline<'_>,
) -> Result<RuleCopyGuard, String> {
    let payload = super::preparation::copy_payload(snapshot, kind, id, scope, baseline)?;
    Ok(RuleCopyGuard {
        kind,
        classic_id: id,
        scope: scope.into(),
        definition_hash: digest(&payload),
        library_fingerprint: baseline.fingerprint.into(),
    })
}
