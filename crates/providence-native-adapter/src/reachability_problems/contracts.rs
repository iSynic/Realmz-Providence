use providence_core::{
    model::StableId,
    references::{ByteProvenance, RepairAction},
};
use serde_json::Value;
#[derive(Debug, Clone)]
pub(super) struct ReachabilityActionSite {
    pub(super) source: StableId,
    pub(super) slot: u8,
    pub(super) opcode: i16,
    pub(super) extra_code_id: Option<u32>,
    pub(super) byte_provenance: ByteProvenance,
    pub(super) opcode_byte_provenance: ByteProvenance,
}

#[derive(Debug, Clone)]
pub(super) struct ReachabilityAuthoringSite {
    pub(super) source: StableId,
    pub(super) field: String,
    pub(super) byte_provenance: Option<ByteProvenance>,
    pub(super) repair_actions: Vec<RepairAction>,
    pub(super) repair: Option<Value>,
}
