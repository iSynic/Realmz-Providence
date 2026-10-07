use crate::model::StableId;

pub(super) fn xap_program(id: i64) -> StableId {
    StableId(format!("xap:{id}"))
}

pub(super) fn simple_program(id: u32, result: u8) -> StableId {
    StableId(format!("simple:{id}:result:{result}"))
}

pub(super) fn complex_program(id: u32, result: u8) -> StableId {
    StableId(format!("complex:{id}:result:{result}"))
}
