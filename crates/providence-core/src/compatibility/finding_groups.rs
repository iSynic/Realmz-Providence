use super::{CompatibilityBlocker, CompatibilityFindingGroup, CompatibilityFindingMember};
use crate::rebuilt::{
    RebuiltV3DeferredDisposition, RebuiltV3DeferredReference, RebuiltV3RuntimeMediaReference,
    is_missing_imported_presentation_reference,
};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub(super) fn runtime_conditions(
    snapshot: &crate::model::ProjectSnapshot,
    blockers: &mut Vec<CompatibilityBlocker>,
    warnings: &mut Vec<CompatibilityBlocker>,
) {
    for finding in crate::session::imported_runtime_diagnostics(snapshot)
        .into_iter()
        .filter(|finding| {
            matches!(
                finding.code.as_str(),
                "timed-encounter.location.invalid-level"
                    | "rogue-encounter.damage.inverted"
                    | "source.race-table.quarantined"
            )
        })
    {
        let blocking = finding.severity == crate::validation::Severity::Error;
        let finding = CompatibilityBlocker {
            code: finding.code,
            message: finding.message,
            entity: finding.entity,
            group: None,
        };
        if blocking {
            blockers.push(finding);
        } else {
            warnings.push(finding);
        }
    }
}

/// Group presentation after complete dependency checking; package guards keep
/// the original occurrence list and its exact native targets.
pub(super) fn deferred(references: &[RebuiltV3DeferredReference]) -> Vec<CompatibilityBlocker> {
    let mut groups = BTreeMap::new();
    for reference in references {
        let code = match reference.disposition {
            RebuiltV3DeferredDisposition::Deferred => "rebuilt.deferred-reference",
            RebuiltV3DeferredDisposition::Quarantined => "rebuilt.quarantined-record",
        };
        let key = (
            code,
            &reference.source,
            &reference.field,
            &reference.target_kind,
            &reference.reason,
        );
        groups
            .entry(key)
            .or_insert_with(Vec::new)
            .push(reference.target_id.clone());
    }
    groups
        .into_iter()
        .map(|((code, source, field, kind, reason), targets)| {
            let identity = format!(
                "{:x}",
                Sha256::digest(
                    serde_json::to_vec(&(code, source, field, kind, reason))
                        .expect("string group identity")
                )
            );
            let examples = targets.iter().take(4).cloned().collect::<Vec<_>>();
            CompatibilityBlocker {
                code: code.into(),
                entity: Some(source.clone()),
                message: format!(
                    "{} · {}: {} unavailable {} references ({}). {}",
                    source.0,
                    field,
                    targets.len(),
                    kind,
                    examples.join(", "),
                    reason
                ),
                group: Some(CompatibilityFindingGroup {
                    identity,
                    field: field.clone(),
                    target_kind: kind.clone(),
                    occurrence_count: targets.len(),
                    examples,
                    members: targets
                        .into_iter()
                        .map(|target_id| CompatibilityFindingMember {
                            field: field.clone(),
                            target_id,
                        })
                        .collect(),
                }),
            }
        })
        .collect()
}

pub(super) fn media(
    references: &[RebuiltV3RuntimeMediaReference],
    imported: bool,
) -> Vec<CompatibilityBlocker> {
    let code = if imported {
        "rebuilt.deferred-reference"
    } else {
        "rebuilt.media-selection.invalid"
    };
    let mut groups = BTreeMap::new();
    for reference in references
        .iter()
        .filter(|reference| is_missing_imported_presentation_reference(reference))
    {
        let target = reference
            .classic_resource
            .as_ref()
            .map(|resource| format!("{}:{}", resource.resource_type, resource.resource_id))
            .unwrap_or_else(|| "unidentified".into());
        let family = reference
            .field_path
            .split('[')
            .next()
            .unwrap_or(&reference.field_path)
            .to_string();
        groups
            .entry((reference.source.clone(), family, target))
            .or_insert_with(Vec::new)
            .push(reference.field_path.clone());
    }
    groups.into_iter().map(|((source, family, target), fields)| {
        let identity = format!("{:x}", Sha256::digest(serde_json::to_vec(&(code, &source, &family, &target)).expect("media group identity")));
        CompatibilityBlocker { code: code.into(), entity: Some(source.clone()),
            message: format!("{}: {} cells or fields use unavailable {} artwork. Native references are retained.", source.0, fields.len(), target),
            group: Some(CompatibilityFindingGroup {
                identity, field: family, target_kind: "artwork".into(), occurrence_count: fields.len(),
                examples: fields.iter().take(4).cloned().collect(),
                members: fields.into_iter().map(|field| CompatibilityFindingMember { field, target_id: target.clone() }).collect(),
            }),
        }
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::StableId;

    #[test]
    fn imported_runtime_conditions_warn_but_fresh_or_edited_rows_block_both_targets() {
        use crate::model::{BlobId, ProjectOrigin, ProjectSnapshot};
        let mut snapshot = ProjectSnapshot::new_authored(StableId("source-conditions".into()));
        snapshot.timed_encounters = crate::codecs::decode_timed_encounters(
            &[0; crate::codecs::TIMED_ENCOUNTER_RECORD_BYTES],
        )
        .records;
        snapshot.timed_encounters[0].required_level = -1;
        snapshot.timed_encounters[0].location_kind = crate::model::TimedEncounterLocationKind::Land;
        snapshot.rogue_encounters = crate::codecs::decode_rogue_encounters(
            &[0; crate::codecs::ROGUE_ENCOUNTER_RECORD_BYTES],
        )
        .records;
        snapshot.rogue_encounters[0].low_damage = 10;
        snapshot.rogue_encounters[0].high_damage = 1;
        for imported in [false, true] {
            if imported {
                snapshot.origin = ProjectOrigin::Imported {
                    compatibility_annex: BlobId("fixture-source".into()),
                };
            }
            for result in super::super::classify_targets(&snapshot) {
                for code in [
                    "timed-encounter.location.invalid-level",
                    "rogue-encounter.damage.inverted",
                ] {
                    assert_eq!(
                        result.blockers.iter().any(|finding| finding.code == code),
                        !imported
                    );
                    assert_eq!(
                        result.warnings.iter().any(|finding| finding.code == code),
                        imported
                    );
                }
            }
        }
        snapshot.timed_encounters[0].authored = true;
        snapshot.rogue_encounters[0].authored = true;
        for result in super::super::classify_targets(&snapshot) {
            assert!(
                result
                    .blockers
                    .iter()
                    .any(|finding| finding.code == "rogue-encounter.damage.inverted")
            );
            assert!(
                result
                    .blockers
                    .iter()
                    .any(|finding| finding.code == "timed-encounter.location.invalid-level")
            );
        }
        assert_eq!(snapshot.timed_encounters[0].required_level, -1);
        assert_eq!(snapshot.rogue_encounters[0].low_damage, 10);
    }

    #[test]
    fn expanded_range_keeps_every_exact_member_without_expanded_messages() {
        let mut references = (0..20_000)
            .map(|id| RebuiltV3DeferredReference {
                source: StableId("xap:7".into()),
                field: "actions[3].itemRange".into(),
                target_kind: "item".into(),
                target_id: id.to_string(),
                reason: "missing".into(),
                disposition: RebuiltV3DeferredDisposition::Deferred,
            })
            .collect::<Vec<_>>();
        let groups = deferred(&references);
        assert_eq!(groups.len(), 1);
        let group = groups[0].group.as_ref().unwrap();
        assert_eq!(group.occurrence_count, 20_000);
        assert_eq!(
            group
                .members
                .iter()
                .map(|member| &member.target_id)
                .collect::<Vec<_>>(),
            references
                .iter()
                .map(|reference| &reference.target_id)
                .collect::<Vec<_>>()
        );
        assert_eq!(group.examples.len(), 4);
        assert!(serde_json::to_vec(&groups).unwrap().len() < 1024);
        references[0].field = "actions[4].itemRange".into();
        assert_eq!(deferred(&references).len(), 2);
    }
}
