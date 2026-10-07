use std::collections::BTreeMap;

pub(super) fn field_units(
    opcode: i16,
    index: u8,
    values: &BTreeMap<String, i16>,
) -> Option<String> {
    match (opcode, index) {
        (23 | -23, 2) => Some("chances per 10,000".into()),
        (13, 2) | (30 | 31, 1) | (42, 0) | (54, 1) | (68, 2) => Some("percent".into()),
        (92, 3) => Some("chance points per 10,000".into()),
        (65, 0) => Some("items".into()),
        (124, 2) => Some("monsters".into()),
        (125, 1) => Some("monsters".into()),
        (120, 2) => Some("combatants".into()),
        (12, 1 | 2) | (37, 2 | 3) | (61, 1 | 2) => Some("map cells".into()),
        (15 | 16, 0) => Some("roll multiplier".into()),
        (15 | 16, 1 | 2) => Some("stamina points".into()),
        (17 | 18, 1) => Some("spell power levels".into()),
        (17 | 18, 2) => Some("percentage points".into()),
        (22, 3) => Some("charges".into()),
        (52, 1) if values.get("selector") == Some(&0) => Some("movement points".into()),
        (52, 1) if values.get("selector") == Some(&1) => Some("party position".into()),
        (52, 1) if values.get("selector") == Some(&3) => Some("percent".into()),
        (63, 1) | (64, 0) | (54, 4) => Some("days".into()),
        (63, 2) | (64, 1) => Some("hours".into()),
        (63, 3) => Some("minutes".into()),
        (90, 0) => Some("victory points".into()),
        (126, 1) if values.get("mode") == Some(&0) => Some("battle round".into()),
        (126, 1) if values.get("mode") == Some(&1) => Some("percent".into()),
        _ => None,
    }
}

pub(super) fn direct_units(opcode: i16) -> Option<String> {
    match opcode {
        11 => Some("victory points".into()),
        -14 | 14 => Some("characters".into()),
        32 => Some("percent of normal price".into()),
        _ => None,
    }
}
