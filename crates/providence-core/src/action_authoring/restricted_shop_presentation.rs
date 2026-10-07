use super::ActionSemanticInventoryField;

pub(super) fn field_presentation(field: &ActionSemanticInventoryField) -> (String, String) {
    let label = match field.index {
        1 => "Range 1 Low Item",
        2 => "Range 1 High Item",
        3 => "Range 2 Low Item",
        4 => "Range 2 High Item",
        _ => unreachable!("restricted shop presentation is limited to range endpoints"),
    };
    (
        label.into(),
        "Inclusive item-number endpoint for the shop's accepted-item ranges. A zero low endpoint disables that range check; the high endpoint does not independently disable it."
            .into(),
    )
}
