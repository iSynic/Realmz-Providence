use super::*;
use crate::codecs::{
    SHOP_ITEM_SLOTS, SHOP_RECORD_BYTES, SIMPLE_ENCOUNTER_RECORD_BYTES, TIMED_ENCOUNTER_RECORD_BYTES,
};
pub(super) fn project_simple(bytes: &[u8], output: &mut Vec<NativeSimpleEncounter>) {
    for (id, row) in bytes
        .chunks_exact(SIMPLE_ENCOUNTER_RECORD_BYTES)
        .enumerate()
    {
        output.push(NativeSimpleEncounter {
            id: id as u32,
            codes: row[..32].iter().map(|value| *value as i8).collect(),
            operands: (0..32)
                .map(|slot| read_i16(&row[32 + slot * 2..34 + slot * 2]))
                .collect(),
            choice_results: row[96..100].iter().map(|value| *value as i8).collect(),
            can_back_out_byte: row[100],
            max_times: row[101] as i8,
            caste_success: row[102] as i8,
            reserved_byte: row[103],
            prompt_message_id: read_i16(&row[104..106]),
            text_slots: (0..4)
                .map(|slot| row[106 + slot * 80..186 + slot * 80].to_vec())
                .collect(),
        });
    }
}

pub(super) fn project_timed(bytes: &[u8], output: &mut Vec<NativeTimedEncounter>) {
    for (id, row) in bytes.chunks_exact(TIMED_ENCOUNTER_RECORD_BYTES).enumerate() {
        output.push(NativeTimedEncounter {
            id: id as u32,
            words: (0..20)
                .map(|slot| read_i16(&row[slot * 2..slot * 2 + 2]))
                .collect(),
        });
    }
}

pub(super) fn project_shops(bytes: &[u8], output: &mut Vec<NativeShop>) {
    for (id, row) in bytes.chunks_exact(SHOP_RECORD_BYTES).enumerate() {
        output.push(NativeShop {
            id: id as u32,
            item_ids: (0..SHOP_ITEM_SLOTS)
                .map(|slot| read_i16(&row[slot * 2..slot * 2 + 2]))
                .collect(),
            quantities: row[2000..3000].to_vec(),
            inflation: read_i16(&row[3000..3002]),
        });
    }
}

pub(super) fn project_programs(
    native_path: &str,
    bytes: &[u8],
    output: &mut Vec<NativeProgramFact>,
) {
    let (record_bytes, prefix_bytes, code_count, signed_byte_codes, operand_offset, suffix_offset) =
        match native_path {
            "Data DD" | "Data DDD" | "Data ED3" => (40, 8, 8, false, 24, 40),
            "Data ED2" => (520, 0, 32, true, 32, 96),
            _ => return,
        };
    for (id, row) in bytes.chunks_exact(record_bytes).enumerate() {
        let codes = (0..code_count)
            .map(|slot| {
                if signed_byte_codes {
                    row[slot] as i8 as i16
                } else {
                    read_i16(&row[prefix_bytes + slot * 2..prefix_bytes + slot * 2 + 2])
                }
            })
            .collect();
        let operands = (0..code_count)
            .map(|slot| read_i16(&row[operand_offset + slot * 2..operand_offset + slot * 2 + 2]))
            .collect();
        output.push(NativeProgramFact {
            native_path: native_path.to_owned(),
            id: id as u32,
            prefix: row[..prefix_bytes].to_vec(),
            codes,
            operands,
            suffix: row[suffix_offset..].to_vec(),
        });
    }
}

pub(super) fn project_extra_codes(bytes: &[u8], output: &mut Vec<NativeExtraCodeFact>) {
    let record_bytes = crate::codecs::EXTRA_CODE_RECORD_BYTES;
    for (id, row) in bytes.chunks_exact(record_bytes).enumerate() {
        output.push(NativeExtraCodeFact {
            id: id as u32,
            values: std::array::from_fn(|slot| read_i16(&row[slot * 2..slot * 2 + 2])),
        });
    }
}

fn read_i16(bytes: &[u8]) -> i16 {
    i16::from_be_bytes([bytes[0], bytes[1]])
}
