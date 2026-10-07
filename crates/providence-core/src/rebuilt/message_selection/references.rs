use super::RebuiltV3RuntimeMessageReference;
use crate::model::StableId;
use std::collections::BTreeSet;

pub(super) fn add_reference(
    references: &mut BTreeSet<RebuiltV3RuntimeMessageReference>,
    source: &StableId,
    runtime_opcode: Option<i16>,
    field_path: String,
    raw_native_id: i16,
    zero_is_sentinel: bool,
) {
    if zero_is_sentinel && raw_native_id == 0 {
        return;
    }
    references.insert(RebuiltV3RuntimeMessageReference {
        source: source.clone(),
        runtime_opcode,
        field_path,
        raw_native_id,
        message_native_id: i32::from(raw_native_id).unsigned_abs(),
    });
}
