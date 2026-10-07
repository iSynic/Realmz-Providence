use serde_json::Value;

pub(super) struct CatalogQuery {
    pub requested_offset: usize,
    pub limit: usize,
    pub search: String,
    pub filter: String,
}

impl CatalogQuery {
    pub(super) fn from_params(params: &Value, default_limit: u64) -> Self {
        Self {
            requested_offset: params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize,
            limit: params
                .get("limit")
                .and_then(Value::as_u64)
                .unwrap_or(default_limit)
                .clamp(1, 128) as usize,
            search: params
                .get("search")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_ascii_lowercase(),
            filter: params
                .get("filter")
                .and_then(Value::as_str)
                .unwrap_or("all")
                .to_owned(),
        }
    }

    pub(super) fn page(&self, filtered: Vec<Value>) -> (Vec<Value>, usize, usize) {
        let total = filtered.len();
        let offset = if total == 0 {
            0
        } else {
            self.requested_offset
                .min((total - 1) / self.limit * self.limit)
        };
        let items = filtered.into_iter().skip(offset).take(self.limit).collect();
        (items, offset, total)
    }
}
