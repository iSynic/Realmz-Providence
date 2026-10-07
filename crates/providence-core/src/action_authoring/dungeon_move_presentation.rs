use std::collections::BTreeMap;

use super::ActionSemanticInventoryField;

pub(super) fn field_presentation(
    field: &ActionSemanticInventoryField,
    values: &BTreeMap<String, i16>,
) -> (String, String) {
    let (label, help) = match field.index {
        0 => (
            "Travel Direction",
            "Choose whether the party enters a dungeon or returns to land.",
        ),
        1 if values.get("mode") == Some(&1) => (
            "Land Level",
            "Land level used when the party returns from a dungeon.",
        ),
        1 => ("Dungeon Level", "Dungeon level the party enters."),
        2 => ("Destination X", "Horizontal destination cell."),
        3 => ("Destination Y", "Vertical destination cell."),
        4 => (
            "Dungeon View and Heading",
            "Choose the initial facing direction and whether the entered dungeon allows the overhead view.",
        ),
        _ => return (field.label.clone(), field.help.clone()),
    };
    (label.into(), help.into())
}

pub(super) fn choices(index: u8) -> &'static [(i16, &'static str)] {
    match index {
        0 => &[(0, "Enter dungeon"), (1, "Return to land")],
        4 => &[
            (1, "North · overhead and 3D views"),
            (2, "East · overhead and 3D views"),
            (3, "South · overhead and 3D views"),
            (4, "West · overhead and 3D views"),
            (-1, "North · 3D view only"),
            (-2, "East · 3D view only"),
            (-3, "South · 3D view only"),
            (-4, "West · 3D view only"),
        ],
        _ => &[],
    }
}

pub(super) fn availability(index: u8, values: &BTreeMap<String, i16>) -> Option<String> {
    (index == 4 && values.get("mode") == Some(&1))
        .then(|| "Returning to land does not read the dungeon heading/view setting.".into())
}
