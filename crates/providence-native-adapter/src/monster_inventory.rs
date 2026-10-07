use crate::request_params::required_i16;
use providence_core::model::ProjectSnapshot;
use serde_json::Value;

pub(crate) fn monster_catalog_projection(
    snapshot: &ProjectSnapshot,
    params: &Value,
) -> Result<providence_core::monster_inventory::MonsterInventoryPage, String> {
    providence_core::monster_inventory::inventory(
        snapshot,
        required_i16(params, "setId")?,
        params.get("query").and_then(Value::as_str).unwrap_or(""),
        params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize,
        params.get("limit").and_then(Value::as_u64).unwrap_or(64) as usize,
    )
}
