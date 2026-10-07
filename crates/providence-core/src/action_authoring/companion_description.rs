use super::form_description::preservation_policy;
use super::semantic_inventory::donor_paths;
use super::{
    ActionFormDescribeQuery, ActionSemanticInventoryEntry, DescribedActionField, FormControl,
    FormRow, SemanticEvidence, SemanticEvidenceKind,
};

fn companion_presentation<'a>(
    index: usize,
    shape: i16,
    label: &'a str,
    explanation: &'a str,
) -> (&'a str, &'a str) {
    match (shape, index) {
        (1, 0) => (
            "Horizontal Offset",
            "Add this offset to both left and right edges.",
        ),
        (1, 1) => (
            "Vertical Offset",
            "Add this offset to both top and bottom edges.",
        ),
        (0, 0) => ("Left Edge", "Absolute left edge of the random rectangle."),
        (0, 1) => ("Right Edge", "Absolute right edge of the random rectangle."),
        (0, 2) => ("Top Edge", "Absolute top edge of the random rectangle."),
        (0, 3) => (
            "Bottom Edge",
            "Absolute bottom edge of the random rectangle.",
        ),
        (2, 0) => ("Left Edge Offset", "Add this offset to the left edge."),
        (2, 1) => ("Right Edge Offset", "Add this offset to the right edge."),
        (2, 2) => ("Top Edge Offset", "Add this offset to the top edge."),
        (2, 3) => ("Bottom Edge Offset", "Add this offset to the bottom edge."),
        _ => (label, explanation),
    }
}

pub(super) fn fields(
    query: &ActionFormDescribeQuery,
    entry: &ActionSemanticInventoryEntry,
) -> Vec<DescribedActionField> {
    const FIELDS: [(&str, &str, &str); 5] = [
        (
            "shapeX1",
            "Left Edge / X1",
            "First horizontal edge used by the selected shape mode.",
        ),
        (
            "shapeY1",
            "Top Edge / Y1",
            "First vertical edge used by the selected shape mode.",
        ),
        (
            "shapeX2",
            "Right Edge / X2",
            "Second horizontal edge used by the selected shape mode.",
        ),
        (
            "shapeY2",
            "Bottom Edge / Y2",
            "Second vertical edge used by the selected shape mode.",
        ),
        (
            "shapeFlags",
            "Preserved Shape Flags",
            "Imported companion flags are not consumed by the audited action-92 path.",
        ),
    ];
    FIELDS
        .into_iter()
        .enumerate()
        .map(|(index, field)| action_92_companion_field(query, entry, index, field))
        .collect()
}

fn action_92_companion_field(
    query: &ActionFormDescribeQuery,
    entry: &ActionSemanticInventoryEntry,
    index: usize,
    (key, label, explanation): (&str, &str, &str),
) -> DescribedActionField {
    let preserved = index == 4;
    let shape = query.values.get("shapeMode").copied().unwrap_or(0);
    let consumed = crate::classic_action_settings::companion_words(92, [0, 0, 0, 0, shape]);
    let active = consumed & (1 << index) != 0;
    let (label, explanation) = companion_presentation(index, shape, label, explanation);
    let absolute_edge = shape == 0 && index < 4;
    DescribedActionField {
        key: key.into(),
        index: Some(index as u8),
        row: FormRow::Secondary,
        label: label.into(),
        explanation: explanation.into(),
        control: if preserved {
            FormControl::Preserved
        } else {
            FormControl::Integer
        },
        value: query.secondary_values.get(key).copied().unwrap_or(0),
        minimum: if absolute_edge { 0 } else { i16::MIN },
        maximum: if absolute_edge {
            i16::try_from(crate::model::CLASSIC_MAP_SIZE - 1).expect("Classic map size fits i16")
        } else {
            i16::MAX
        },
        units: (!preserved).then(|| "map cells".into()),
        choices: Vec::new(),
        special_values: Vec::new(),
        target_kind: None,
        value_picker_kind: None,
        value_picker_preview: None,
        visible: true,
        editable: active,
        target_context: Default::default(),
        availability_reason: (!active)
            .then(|| "Retained unchanged; the selected shape mode does not read this word.".into()),
        preserved,
        applicable_context: "Action 92 paired settings row".into(),
        preservation_policy: preservation_policy(preserved),
        preview: None,
        evidence: SemanticEvidence {
            kind: SemanticEvidenceKind::SourceSupported,
            status: entry.evidence_status.clone(),
            sources: donor_paths().to_vec(),
            note: "Classic action 92 reads the contiguous companion row geometry.".into(),
        },
        uses: Vec::new(),
    }
}
