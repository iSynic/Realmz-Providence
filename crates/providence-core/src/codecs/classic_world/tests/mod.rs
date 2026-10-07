mod action_points;
mod cells;
mod encounters;
mod extra_action_points;
mod maps;

fn changed_offsets(before: &[u8], after: &[u8]) -> Vec<usize> {
    before
        .iter()
        .zip(after)
        .enumerate()
        .filter_map(|(index, (left, right))| (left != right).then_some(index))
        .collect()
}
