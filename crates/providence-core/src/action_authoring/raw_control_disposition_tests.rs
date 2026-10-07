use super::{ActionFormDescribeQuery, FormControl, catalog, describe_action_form};
use crate::model::{ProjectSnapshot, StableId};
use std::collections::{BTreeMap, BTreeSet};

const EXPECTATIONS: &str = include_str!("fixtures/classic-raw-control-dispositions.txt");

#[test]
fn every_raw_integer_control_has_one_explicit_authoring_disposition() {
    let expected = parsed_expectations();
    let actual = described_raw_controls();
    assert_eq!(actual, expected.keys().cloned().collect());

    let dispositions: BTreeMap<&str, usize> =
        expected
            .values()
            .fold(BTreeMap::new(), |mut counts, disposition| {
                *counts.entry(disposition.as_str()).or_default() += 1;
                counts
            });
    assert_eq!(dispositions.get("confirmed-numeric"), Some(&48));
    assert_eq!(dispositions.get("authoring-picker-required"), None);
    assert_eq!(
        dispositions.get("conditional-reference-at-baseline"),
        Some(&4)
    );
    assert_eq!(dispositions.get("runtime-decision-required"), None);
}

fn parsed_expectations() -> BTreeMap<(i16, String), String> {
    EXPECTATIONS
        .lines()
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(|line| {
            let mut columns = line.split_whitespace();
            let opcode = columns.next().unwrap().parse().unwrap();
            let key = columns.next().unwrap().to_owned();
            let disposition = columns.next().unwrap().to_owned();
            assert!(columns.next().unwrap().starts_with("newland.c:"));
            assert!(columns.next().is_none());
            ((opcode, key), disposition)
        })
        .collect()
}

fn described_raw_controls() -> BTreeSet<(i16, String)> {
    let snapshot = ProjectSnapshot::new_authored(StableId("raw-control-dispositions".into()));
    catalog()
        .actions
        .into_iter()
        .flat_map(|action| {
            let description = describe_action_form(
                &snapshot,
                &ActionFormDescribeQuery {
                    action_identity: action.identity,
                    target_native_id: 0,
                    values: BTreeMap::new(),
                    secondary_values: BTreeMap::new(),
                    context: Default::default(),
                },
            )
            .unwrap();
            let inactive: BTreeSet<String> = description
                .authoring
                .controls
                .iter()
                .flat_map(|control| control.member_fields.iter())
                .filter(|member| {
                    !description
                        .authoring
                        .controls
                        .iter()
                        .any(|control| control.active_fields.contains(member))
                })
                .cloned()
                .collect();
            description.fields.into_iter().filter_map(move |field| {
                (field.visible
                    && field.editable
                    && field.control == FormControl::Integer
                    && field.value_picker_kind.is_none()
                    && !inactive.contains(&field.key))
                .then_some((action.opcode, field.key))
            })
        })
        .collect()
}
