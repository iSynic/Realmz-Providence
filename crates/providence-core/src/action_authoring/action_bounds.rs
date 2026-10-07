//! Source-established authoring bounds for genuine numeric fields.

use super::DescribedActionField;
use crate::model::CLASSIC_MAP_SIZE;
use std::collections::BTreeMap;

pub(super) fn direct(opcode: i16) -> (i16, i16) {
    match opcode {
        // Divinity defines this direct argument as an amount to give. Classic
        // has a separate Take Away Victory Points action for subtraction.
        11 => (0, i16::MAX),
        // Divinity explicitly documents the temple inflation range as 0..32000.
        32 => (0, 32_000),
        _ => (i16::MIN, i16::MAX),
    }
}

pub(super) fn apply(
    opcode: i16,
    values: &BTreeMap<String, i16>,
    fields: &mut [DescribedActionField],
) {
    apply_coordinate_bounds(opcode, fields);
    apply_random_bounds(opcode, values, fields);
    match opcode {
        22 => set_bounds(fields, 1, 1, 180),
        42 => set_bounds(fields, 0, 0, 100),
        67 => set_bounds(fields, 2, 0, i16::MAX),
        75 => set_bounds(fields, 1, 0, i16::MAX),
        77 => set_bounds(fields, 1, -127, 127),
        90 => set_bounds(fields, 0, 0, i16::MAX),
        126 => set_bounds(
            fields,
            1,
            0,
            if values.get("mode") == Some(&1) {
                100
            } else {
                i16::MAX
            },
        ),
        _ => {}
    }
}

fn apply_coordinate_bounds(opcode: i16, fields: &mut [DescribedActionField]) {
    let maximum_map_cell = i16::try_from(CLASSIC_MAP_SIZE - 1).expect("Classic map size fits i16");
    let coordinate_indices: &[u8] = match opcode {
        12 => &[1, 2],
        37 => &[2, 3],
        _ => &[],
    };
    for index in coordinate_indices {
        set_bounds(fields, *index, 0, maximum_map_cell);
    }
}

fn apply_random_bounds(
    opcode: i16,
    values: &BTreeMap<String, i16>,
    fields: &mut [DescribedActionField],
) {
    if opcode == 61 && values.get("randomize").is_some_and(|value| *value != 0) {
        // Classic calls randrange(1, authored maximum) for each axis in random
        // mode. Exact mode instead adds the signed values directly.
        for index in [1, 2] {
            set_bounds(fields, index, 1, i16::MAX);
        }
    }
    if matches!(opcode, 15 | 16 | 74) {
        // Divinity defines these as the nonnegative low/high endpoints of a
        // random magnitude. Direction is encoded separately by the multiplier
        // sign and is exposed through the named Heal/Damage or Give/Take mode.
        for index in [1, 2] {
            set_bounds(fields, index, 0, i16::MAX);
        }
    }
}

fn set_bounds(fields: &mut [DescribedActionField], index: u8, minimum: i16, maximum: i16) {
    if let Some(field) = fields.iter_mut().find(|field| field.index == Some(index)) {
        field.minimum = minimum;
        field.maximum = maximum;
    }
}
