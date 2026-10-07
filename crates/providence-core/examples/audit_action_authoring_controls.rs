use std::collections::BTreeMap;

use providence_core::{
    action_authoring::{
        ActionDefinition, ActionFormDescribeQuery, ActionTargetKind, DescribedActionField,
        FormControl, catalog, describe_action_form,
    },
    model::{ProjectSnapshot, StableId},
};
use serde::Serialize;
use std::collections::BTreeSet;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RawIntegerField {
    opcode: i16,
    action: String,
    key: String,
    label: String,
    explanation: String,
    minimum: i16,
    maximum: i16,
    units: Option<String>,
    special_values: Vec<String>,
    control_disposition: &'static str,
    audit_disposition: String,
    evidence: String,
    value_picker_kind: Option<ActionTargetKind>,
}

fn main() -> Result<(), String> {
    let snapshot = ProjectSnapshot::new_authored(StableId("authoring-control-audit".into()));
    let mut fields = Vec::new();
    let mut expectations = audit_expectations();

    for action in catalog().actions {
        fields.extend(action_fields(&snapshot, action, &mut expectations)?);
    }
    if !expectations.is_empty() {
        return Err(format!(
            "{} raw-control expectations were not present in the live descriptions",
            expectations.len()
        ));
    }

    println!(
        "{}",
        serde_json::to_string_pretty(&fields).map_err(|error| error.to_string())?
    );
    Ok(())
}

fn action_fields(
    snapshot: &ProjectSnapshot,
    action: providence_core::action_authoring::ActionDefinition,
    expectations: &mut BTreeMap<(i16, String), (String, String)>,
) -> Result<Vec<RawIntegerField>, String> {
    let description = describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: action.identity.clone(),
            target_native_id: 0,
            values: BTreeMap::new(),
            secondary_values: BTreeMap::new(),
            context: Default::default(),
        },
    )
    .map_err(|error| error.to_string())?;
    let member_fields: BTreeSet<&str> = description
        .authoring
        .controls
        .iter()
        .flat_map(|control| control.member_fields.iter().map(String::as_str))
        .collect();
    let active_fields: BTreeSet<&str> = description
        .authoring
        .controls
        .iter()
        .flat_map(|control| control.active_fields.iter().map(String::as_str))
        .collect();
    description
        .fields
        .into_iter()
        .filter(|field| {
            field.visible
                && field.editable
                && field.control == FormControl::Integer
                && (!member_fields.contains(field.key.as_str())
                    || active_fields.contains(field.key.as_str()))
        })
        .map(|field| raw_field(&action, field, expectations))
        .collect()
}

fn raw_field(
    action: &ActionDefinition,
    field: DescribedActionField,
    expectations: &mut BTreeMap<(i16, String), (String, String)>,
) -> Result<RawIntegerField, String> {
    let (audit_disposition, evidence) = if field.value_picker_kind.is_some() {
        (
            "value-picker-implemented".into(),
            "centralized Rust description".into(),
        )
    } else {
        expectations
            .remove(&(action.opcode, field.key.clone()))
            .ok_or_else(|| {
                format!(
                    "raw control {}:{} lacks an explicit audit disposition",
                    action.opcode, field.key
                )
            })?
    };
    Ok(RawIntegerField {
        opcode: action.opcode,
        action: action.label.clone(),
        key: field.key,
        label: field.label,
        explanation: field.explanation,
        minimum: field.minimum,
        maximum: field.maximum,
        units: field.units,
        special_values: field
            .special_values
            .into_iter()
            .map(|special| format!("{}: {}", special.value, special.meaning))
            .collect(),
        control_disposition: if field.value_picker_kind.is_some() {
            "numeric-storage-with-value-picker"
        } else {
            "raw-numeric-entry"
        },
        audit_disposition,
        evidence,
        value_picker_kind: field.value_picker_kind,
    })
}

fn audit_expectations() -> BTreeMap<(i16, String), (String, String)> {
    include_str!("../src/action_authoring/fixtures/classic-raw-control-dispositions.txt")
        .lines()
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(|line| {
            let mut columns = line.split_whitespace();
            let opcode = columns.next().unwrap().parse().unwrap();
            let key = columns.next().unwrap().to_owned();
            let disposition = columns.next().unwrap().to_owned();
            let evidence = columns.next().unwrap().to_owned();
            assert!(columns.next().is_none());
            ((opcode, key), (disposition, evidence))
        })
        .collect()
}
