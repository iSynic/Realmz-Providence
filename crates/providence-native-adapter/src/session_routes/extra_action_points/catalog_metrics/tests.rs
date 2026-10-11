use super::*;
use providence_core::references::{FieldPath, ResolutionState};
use providence_core::validation::Severity;

#[test]
fn exact_source_and_target_counts_match_unindexed_findings() {
    let diagnostics = [Severity::Error, Severity::Warning, Severity::Information]
        .into_iter()
        .flat_map(|severity| {
            [Some(StableId("extra-action-point:7".into())), None]
                .into_iter()
                .map(move |entity| Diagnostic {
                    code: "test.finding".into(),
                    severity,
                    message: "Source-specific finding".into(),
                    entity,
                    field: None,
                })
        })
        .collect::<Vec<_>>();
    let references = [
        (TargetKind::ExtraActionPoint, "7"),
        (TargetKind::ExtraActionPoint, "7"),
        (TargetKind::ExtraActionPoint, "07"),
        (TargetKind::Message, "7"),
        (TargetKind::ExtraActionPoint, "8"),
    ]
    .into_iter()
    .map(|(target_kind, target_id)| ReferenceDescriptor {
        source: StableId("caller".into()),
        field: FieldPath("actions[0].target".into()),
        target_kind,
        target_id: target_id.into(),
        required: true,
        stock_fallback: None,
        resolution: ResolutionState::Resolved,
        repair_actions: vec![],
        byte_provenance: None,
    })
    .collect::<Vec<_>>();
    let metrics = CatalogMetrics::new(diagnostics.clone(), references.clone());
    for id in [7, 8, 9] {
        let identity = StableId(format!("extra-action-point:{id}"));
        let expected = diagnostics
            .iter()
            .filter(|d| d.entity.as_ref() == Some(&identity))
            .cloned()
            .collect::<Vec<_>>();
        assert_eq!(metrics.diagnostics(&identity), expected);
        assert_eq!(
            metrics.callers(id),
            references
                .iter()
                .filter(|r| {
                    r.target_kind == TargetKind::ExtraActionPoint && r.target_id == id.to_string()
                })
                .count()
        );
    }
}
