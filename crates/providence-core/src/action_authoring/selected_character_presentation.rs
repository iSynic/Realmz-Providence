use super::ActionSemanticInventoryField;
use std::collections::BTreeMap;

pub(super) fn field_presentation(
    field: &ActionSemanticInventoryField,
    values: &BTreeMap<String, i16>,
) -> (String, String) {
    match field.index {
        0 => ("Statistic To Change".into(), "Choose which statistic is permanently changed for every currently picked character.".into()),
        1 if values.get("statSelector") == Some(&12) => ("Prestige Improvement".into(), "Classic subtracts this signed amount from the prestige penalty: positive values improve prestige and negative values worsen it.".into()),
        1 => ("Change Amount".into(), "Signed amount added to the selected statistic: positive values increase it and negative values decrease it. Classic enforces that statistic's minimum.".into()),
        _ => (field.label.clone(), field.help.clone()),
    }
}
