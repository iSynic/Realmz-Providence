use super::super::*;
use super::fixtures::{simple_snapshot, snapshot};
use crate::model::StableId;
use crate::rebuilt::scenario::RebuiltV3ScenarioError;
use std::collections::BTreeSet;

#[test]
fn catalog_preflight_preserves_family_specific_failure_order() {
    let mut simple = simple_snapshot();
    simple.messages.push(simple.messages[0].clone());
    simple.extra_codes.push(simple.extra_codes[0].clone());
    assert!(matches!(
        project_rebuilt_v3_simple_encounters(&simple),
        Err(RebuiltV3ScenarioError::DuplicateMessageId(47))
    ));

    let mut complex = snapshot();
    complex.messages.push(complex.messages[0].clone());
    complex.extra_codes.push(complex.extra_codes[0].clone());
    assert!(matches!(
        project_rebuilt_v3_complex_encounters(&complex),
        Err(RebuiltV3ScenarioError::DuplicateExtraCodeRow(_))
    ));
}

#[test]
fn selected_simple_programs_and_complete_complex_blocks_keep_their_contract() {
    let ids = BTreeSet::from([7]);
    let programs = BTreeSet::from([StableId("simple:7:result:2".into())]);
    let simple =
        project_rebuilt_v3_selected_simple_encounters(&simple_snapshot(), &ids, &programs).unwrap();
    assert_eq!(simple.programs.len(), 1);
    assert_eq!(simple.programs[0].id.0, "simple:7:result:2");
    assert_eq!(simple.programs[0].instructions[0].slot, 1);

    let ids = BTreeSet::from([0]);
    let programs = BTreeSet::from([StableId("complex:0:result:2".into())]);
    let complex =
        project_rebuilt_v3_selected_complex_encounters(&snapshot(), &ids, &programs).unwrap();
    assert_eq!(
        complex
            .programs
            .iter()
            .map(|program| program.id.0.as_str())
            .collect::<Vec<_>>(),
        [
            "complex:0:result:0",
            "complex:0:result:1",
            "complex:0:result:2",
            "complex:0:result:3"
        ]
    );
    assert_eq!(complex.programs[2].instructions[0].slot, 1);
}
