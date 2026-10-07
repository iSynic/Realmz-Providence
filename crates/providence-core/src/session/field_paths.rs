pub(super) fn parse_indexed_field(field: &str, prefix: &str, length: usize) -> Option<usize> {
    field
        .strip_prefix(prefix)
        .and_then(|suffix| suffix.strip_prefix('['))
        .and_then(|suffix| suffix.strip_suffix(']'))
        .and_then(|index| index.parse::<usize>().ok())
        .filter(|index| *index < length)
}

pub(super) fn parse_battle_grid_field(field: &str) -> Option<usize> {
    field
        .strip_prefix("grid[")
        .and_then(|suffix| suffix.strip_suffix("].monster"))
        .and_then(|index| index.parse::<usize>().ok())
}

pub(super) fn parse_complex_action_field(field: &str) -> Option<usize> {
    field
        .strip_prefix("actions[")
        .and_then(|suffix| suffix.strip_suffix("].target"))
        .and_then(|index| index.parse::<usize>().ok())
        .filter(|index| *index < crate::codecs::COMPLEX_ENCOUNTER_ACTION_SLOTS)
}
