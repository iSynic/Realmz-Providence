//! Compact labels for fields whose donor help headings include prose or typos.

pub(super) fn presentation(opcode: i16, index: u8) -> Option<(String, String)> {
    branch_presentation(opcode, index).or_else(|| other_presentation(opcode, index))
}

fn branch_presentation(opcode: i16, index: u8) -> Option<(String, String)> {
    let (label, help) = match (opcode, index) {
        (31, 3) => (
            "On Success",
            "Extra Action Point run when the check succeeds.",
        ),
        (31, 4) => ("On Failure", "Extra Action Point run when the check fails."),
        (40, 1) => (
            "Branch Type",
            "Choose no branch, an Extra Action Point, a Simple Encounter branch, or a Complex Encounter branch.",
        ),
        (46, 0) => ("Quest Flag", "Quest flag whose state controls this branch."),
        (55, 0) => (
            "Success Condition",
            "Choose how many currently picked characters make this test succeed.",
        ),
        (55, 1) => (
            "On Failure",
            "Choose whether failure exits, branches to an Extra Action Point, or shows a message and exits.",
        ),
        (55, 3) => (
            "On Success",
            "Extra Action Point run when the picked-character test succeeds.",
        ),
        (72, 0) => (
            "Quest Range Start",
            "First quest in the inclusive range that must be active.",
        ),
        (72, 1) => (
            "Quest Range End",
            "Last quest in the inclusive range that must be active.",
        ),
        (72, 2) => (
            "Preserved Value 3",
            "The audited Classic action consumer does not read this compatibility word.",
        ),
        (72, 3) => (
            "Branch Type",
            "Choose an Extra Action Point, Simple Encounter branch, or Complex Encounter branch.",
        ),
        (72, 4) => (
            "Destination",
            "Destination interpreted according to the selected Branch Type.",
        ),
        (78, 0) => ("Tile Test", "Choose the map-tile property to test."),
        (78, 1) => (
            "Specific Tile",
            "Tile value used only when Specific tile is selected.",
        ),
        (78, 2) => (
            "Branch Type",
            "Choose an Extra Action Point, Simple Encounter branch, or Complex Encounter branch.",
        ),
        _ => return None,
    };
    Some((label.into(), help.into()))
}

fn other_presentation(opcode: i16, index: u8) -> Option<(String, String)> {
    let (label, help) = match (opcode, index) {
        (30 | 31, 1) => (
            "Check Modifier",
            "Signed adjustment to the selected ability or attribute check.",
        ),
        (92, 2) => (
            "Map Type",
            "Choose whether the rectangle is on a land or dungeon map.",
        ),
        (92, 3) => (
            "Encounter Chance Adjustment",
            "Signed change to the encounter chance, measured in points per 10,000.",
        ),
        (92, 4) => (
            "Shape Mode",
            "Keep the current shape, set absolute edges, offset the rectangle, or warp individual edges.",
        ),
        _ => return None,
    };
    Some((label.into(), help.into()))
}
