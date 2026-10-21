use crate::model::{ProjectOrigin, ProjectSnapshot, StableId};
use crate::rebuilt::{RebuiltV3DeferredDisposition, RebuiltV3DeferredReference};
use std::collections::BTreeSet;

pub(crate) fn imported_rule_diagnostics(
    snapshot: &ProjectSnapshot,
) -> Vec<RebuiltV3DeferredReference> {
    if !matches!(snapshot.origin, ProjectOrigin::Imported { .. }) {
        return Vec::new();
    }
    let races = snapshot
        .race_rules
        .iter()
        .map(|row| row.definition.id.clone())
        .collect::<BTreeSet<_>>();
    let castes = snapshot
        .caste_rules
        .iter()
        .map(|row| row.definition.id.clone())
        .collect::<BTreeSet<_>>();
    let mut findings = Vec::new();
    for (family, ids, stride) in [
        ("Race", &races, crate::codecs::RACE_RECORD_BYTES),
        ("Caste", &castes, crate::codecs::CASTE_RECORD_BYTES),
    ] {
        let path = format!("Data {family}");
        if let Some(source) = snapshot
            .classic_sources
            .iter()
            .find(|row| row.native_path == path)
        {
            for number in 1..=30 {
                let id = format!("classic.{}.{number}", family.to_lowercase());
                if !ids.contains(&StableId(id.clone())) {
                    findings.push(finding(StableId(format!("classic-source:{path}")),
                        "nativeSlots", &family.to_lowercase(), id,
                        format!("{path} has no complete native definition for author slot {}; {} source bytes are retained without stock substitution", number - 1, source.byte_length)));
                }
            }
            if source.byte_length % stride as u64 != 0 {
                findings.push(finding(StableId(format!("classic-source:{path}")),
                    "partialRow", &family.to_lowercase(), (source.byte_length / stride as u64 + 1).to_string(),
                    format!("{path} retains a partial {stride}-byte native row; it is not an operational definition")));
            }
        }
    }
    missing_eligibility(snapshot, &races, &castes, &mut findings);
    findings
}

fn missing_eligibility(
    snapshot: &ProjectSnapshot,
    races: &BTreeSet<StableId>,
    castes: &BTreeSet<StableId>,
    findings: &mut Vec<RebuiltV3DeferredReference>,
) {
    let links = snapshot
        .race_rules
        .iter()
        .map(|row| {
            (
                &row.definition.id,
                "eligibleCasteIds",
                "caste",
                &row.definition.eligible_caste_ids,
                castes,
            )
        })
        .chain(snapshot.caste_rules.iter().map(|row| {
            (
                &row.definition.id,
                "eligibleRaceIds",
                "race",
                &row.definition.eligible_race_ids,
                races,
            )
        }));
    for (source, field, family, targets, available) in links {
        for target in targets.iter().filter(|target| !available.contains(*target)) {
            findings.push(finding(source.clone(), field, family, target.0.clone(),
                "native eligibility names an unavailable definition; its source flag remains preserved".into()));
        }
    }
}

fn finding(
    source: StableId,
    field: &str,
    family: &str,
    target_id: String,
    reason: String,
) -> RebuiltV3DeferredReference {
    RebuiltV3DeferredReference {
        source,
        field: field.into(),
        target_kind: family.into(),
        target_id,
        reason,
        disposition: RebuiltV3DeferredDisposition::Deferred,
    }
}
