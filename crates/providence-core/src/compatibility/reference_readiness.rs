use super::{CompatibilityBlocker, blocker};
use crate::{
    model::{ClassicResourceKey, ProjectOrigin, ProjectSnapshot},
    rebuilt::{ApplicationMediaCatalog, ApplicationMediaResolution},
    references::{ReferenceDescriptor, ResolutionState, TargetKind},
    session::references_for,
};

fn unresolved(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
) -> Vec<ReferenceDescriptor> {
    references_for(snapshot)
        .into_iter()
        .filter(|reference| {
            matches!(
                reference.resolution,
                ResolutionState::Missing | ResolutionState::Ambiguous
            ) && !reference_is_resolved_by_application(reference, application)
        })
        .collect()
}

fn describe(reference: &ReferenceDescriptor) -> CompatibilityBlocker {
    blocker(
        "reference.unresolved",
        format!(
            "{}.{} targets unresolved {:?} {}.",
            reference.source.0, reference.field.0, reference.target_kind, reference.target_id
        ),
        Some(reference.source.clone()),
    )
}

pub(super) fn reference_blockers(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
) -> Vec<CompatibilityBlocker> {
    unresolved(snapshot, application)
        .iter()
        .map(describe)
        .collect()
}

pub(super) fn classic(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
) -> (Vec<CompatibilityBlocker>, Vec<CompatibilityBlocker>) {
    let imported = matches!(snapshot.origin, ProjectOrigin::Imported { .. });
    classify(unresolved(snapshot, application), imported)
}

fn classify(
    references: Vec<ReferenceDescriptor>,
    imported: bool,
) -> (Vec<CompatibilityBlocker>, Vec<CompatibilityBlocker>) {
    let mut blockers = Vec::new();
    let mut warnings = Vec::new();
    let mut groups = std::collections::BTreeMap::new();
    for reference in references {
        let preserved = imported && reference.resolution == ResolutionState::Missing;
        let artwork = matches!(
            reference.target_kind,
            crate::references::TargetKind::Icon
                | crate::references::TargetKind::Picture
                | crate::references::TargetKind::SpecialLandTile
                | crate::references::TargetKind::Landlook
        );
        let key = (
            preserved,
            reference.source.clone(),
            reference.target_kind.clone(),
            if artwork {
                reference.target_id.clone()
            } else {
                reference.field.0.clone()
            },
        );
        groups.entry(key).or_insert_with(Vec::new).push(reference);
    }
    for ((preserved, _, _, _), references) in groups {
        let diagnostic = grouped(&references, preserved);
        if preserved {
            warnings.push(diagnostic);
        } else {
            blockers.push(diagnostic);
        }
    }
    (blockers, warnings)
}

fn grouped(references: &[ReferenceDescriptor], preserved: bool) -> CompatibilityBlocker {
    use sha2::{Digest, Sha256};
    let mut finding = describe(&references[0]);
    if preserved {
        finding.code = "classic.reference.preserved-missing".into();
        finding.message += " Legacy export preserves this stored reference. The target is unavailable; runtime behavior is not certified.";
    }
    if references.len() > 1 {
        let first = &references[0];
        let artwork = matches!(
            first.target_kind,
            crate::references::TargetKind::Icon
                | crate::references::TargetKind::Picture
                | crate::references::TargetKind::SpecialLandTile
                | crate::references::TargetKind::Landlook
        );
        finding.message = format!(
            "{} affected cells or references. {}",
            references.len(),
            finding.message
        );
        finding.group = Some(super::CompatibilityFindingGroup {
            identity: format!(
                "{:x}",
                Sha256::digest(
                    serde_json::to_vec(&(
                        &finding.code,
                        &first.source,
                        &first.field,
                        &first.target_kind,
                        &first.target_id
                    ))
                    .expect("reference group identity")
                )
            ),
            field: first.field.0.clone(),
            target_kind: if artwork {
                "artwork".into()
            } else {
                format!("{:?}", first.target_kind)
            },
            occurrence_count: references.len(),
            examples: references
                .iter()
                .take(4)
                .map(|r| r.target_id.clone())
                .collect(),
            members: references
                .iter()
                .map(|r| super::CompatibilityFindingMember {
                    field: r.field.0.clone(),
                    target_id: r.target_id.clone(),
                })
                .collect(),
        });
    }
    finding
}

pub fn reference_is_resolved_by_application(
    reference: &ReferenceDescriptor,
    application_media: Option<&ApplicationMediaCatalog>,
) -> bool {
    if reference.resolution != ResolutionState::Missing {
        return false;
    }
    let Some(application_media) = application_media else {
        return false;
    };
    let (resource_type, expected_kind) = match reference.target_kind {
        TargetKind::Icon if reference.source.0.starts_with("player-map:") => ("cicn", None),
        TargetKind::Icon => ("cicn", Some("icon")),
        TargetKind::Picture => ("PICT", Some("picture")),
        TargetKind::Sound => ("snd ", Some("sound")),
        TargetKind::SpecialLandTile => ("cicn", Some("special-land-tile")),
        _ => return false,
    };
    let Ok(resource_id) = reference.target_id.parse::<i32>() else {
        return false;
    };
    matches!(
        application_media.resolve_resource(
            &ClassicResourceKey {
                resource_type: resource_type.into(),
                resource_id,
            },
            expected_kind,
        ),
        ApplicationMediaResolution::Resolved(_)
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        compatibility::{CompatibilityStatus, classify_classic_slice},
        model::{BlobId, MessageReference, NativeRecordId, ScenarioMessage, StableId},
        session::diagnostics_for,
        validation::Severity,
    };

    fn project(imported: bool) -> ProjectSnapshot {
        let mut project =
            ProjectSnapshot::new_authored(StableId("missing-reference-policy".into()));
        project.messages.push(ScenarioMessage {
            identity: StableId("message:1".into()),
            native_id: NativeRecordId(1),
            text: "Retained message".into(),
            authored: false,
        });
        project.message_references.push(MessageReference {
            source: StableId("caller".into()),
            field: "message".into(),
            target_native_id: NativeRecordId(999),
            required: true,
        });
        if imported {
            project.origin = ProjectOrigin::Imported {
                compatibility_annex: BlobId("sha256:annex".into()),
            };
        }
        project
    }

    #[test]
    fn imported_missing_targets_warn_without_authorizing_fresh_missing_targets() {
        let imported = project(true);
        let classification = classify_classic_slice(&imported);
        assert_eq!(
            classification.status,
            CompatibilityStatus::ReadyWithWarnings
        );
        assert_eq!(
            classification.warnings[0].code,
            "classic.reference.preserved-missing"
        );
        assert_eq!(diagnostics_for(&imported)[0].severity, Severity::Warning);
        let authored = project(false);
        assert_eq!(
            classify_classic_slice(&authored).status,
            CompatibilityStatus::Blocked
        );
        assert_eq!(diagnostics_for(&authored)[0].severity, Severity::Error);
    }

    #[test]
    fn repeated_missing_artwork_is_bounded_and_keeps_every_native_cell() {
        let mut reference = references_for(&project(true)).remove(0);
        reference.source = StableId("land:0".into());
        reference.target_kind = crate::references::TargetKind::Picture;
        reference.target_id = "13000".into();
        let references = (0..20_000)
            .map(|index| {
                let mut cell = reference.clone();
                cell.field = crate::references::FieldPath(format!("tiles[{index}]"));
                cell
            })
            .collect::<Vec<_>>();
        let (blockers, warnings) = classify(references, true);
        assert!(blockers.is_empty());
        assert_eq!(warnings.len(), 1);
        let group = warnings[0].group.as_ref().unwrap();
        assert_eq!(group.occurrence_count, 20_000);
        assert_eq!(group.members.last().unwrap().field, "tiles[19999]");
        assert!(serde_json::to_vec(&warnings).unwrap().len() < 1500);
    }

    #[test]
    fn imported_ambiguity_still_blocks_export() {
        let mut references = references_for(&project(true));
        references[0].resolution = ResolutionState::Ambiguous;
        let (blockers, warnings) = classify(references, true);
        assert_eq!(blockers[0].code, "reference.unresolved");
        assert!(warnings.is_empty());
    }
}
