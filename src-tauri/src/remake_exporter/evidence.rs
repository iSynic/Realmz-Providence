use serde_json::{json, Map, Value};

const EVIDENCE_KEYS: [&str; 8] = [
    "provenance",
    "source",
    "recordIndex",
    "confidence",
    "sourceFile",
    "byteOffset",
    "byteLength",
    "sourceKind",
];

#[derive(Default)]
pub(crate) struct RuntimeEvidence {
    records: Vec<Value>,
}

impl RuntimeEvidence {
    pub(crate) fn separate_document(&mut self, document: &str, value: &mut Value) {
        self.separate_value(document, "", None, value);
    }

    pub(crate) fn into_sorted_records(mut self) -> Vec<Value> {
        self.records.sort_by(|left, right| {
            let left_key = left.get("key").and_then(Value::as_str).unwrap_or_default();
            let right_key = right
                .get("key")
                .and_then(Value::as_str)
                .unwrap_or_default();
            left_key.cmp(right_key).then_with(|| {
                left.get("path")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .cmp(
                        right
                            .get("path")
                            .and_then(Value::as_str)
                            .unwrap_or_default(),
                    )
            })
        });
        self.records
    }

    fn separate_value(
        &mut self,
        document: &str,
        path: &str,
        collection: Option<&str>,
        value: &mut Value,
    ) {
        match value {
            Value::Array(values) => {
                for (index, child) in values.iter_mut().enumerate() {
                    self.separate_value(
                        document,
                        &format!("{path}/{index}"),
                        collection,
                        child,
                    );
                }
            }
            Value::Object(object) => {
                self.separate_object(document, path, collection, object);
                let keys = object.keys().cloned().collect::<Vec<_>>();
                for key in keys {
                    let Some(child) = object.get_mut(&key) else {
                        continue;
                    };
                    let next_collection = if child.is_array() {
                        Some(key.as_str())
                    } else {
                        collection
                    };
                    self.separate_value(
                        document,
                        &format!("{path}/{}", escape_pointer(&key)),
                        next_collection,
                        child,
                    );
                }
            }
            _ => {}
        }
    }

    fn separate_object(
        &mut self,
        document: &str,
        path: &str,
        collection: Option<&str>,
        object: &mut Map<String, Value>,
    ) {
        let is_rule_table_selection = matches!(
            path,
            "/tableSelection/races" | "/tableSelection/castes"
        ) && object
            .get("source")
            .and_then(Value::as_str)
            .is_some_and(|source| matches!(source, "shared" | "scenario-local" | "unresolved"));
        let is_evidence_bearing = EVIDENCE_KEYS.iter().any(|key| {
            object.contains_key(*key) && !(*key == "source" && is_rule_table_selection)
        });
        if !is_evidence_bearing {
            return;
        }

        let mut metadata = Map::new();
        for key in EVIDENCE_KEYS {
            if key == "source" && is_rule_table_selection {
                continue;
            }
            if let Some(value) = object.remove(key) {
                metadata.insert(key.to_string(), value);
            }
        }
        if metadata.is_empty() {
            return;
        }

        let kind = collection.unwrap_or("field");
        let identity = object
            .get("id")
            .cloned()
            .unwrap_or_else(|| {
                Value::String(if path.is_empty() {
                    "#".to_string()
                } else {
                    format!("#{path}")
                })
            });
        let identity_text = identity
            .as_str()
            .map(str::to_owned)
            .unwrap_or_else(|| identity.to_string());
        self.records.push(json!({
            "key": format!("{kind}:{identity_text}"),
            "kind": kind,
            "id": identity,
            "document": document,
            "path": if path.is_empty() { "#".to_string() } else { format!("#{path}") },
            "metadata": metadata,
        }));
    }
}

fn escape_pointer(value: &str) -> String {
    value.replace('~', "~0").replace('/', "~1")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn separates_record_metadata_without_removing_gameplay_identity() {
        let mut value = json!({
            "triggers": [{
                "id": "Data DD:0:17",
                "source": "Data DD",
                "recordIndex": 17,
                "active": true,
                "provenance": {
                    "sourceFile": "Data DD",
                    "recordIndex": 17,
                    "byteOffset": 680,
                    "byteLength": 40,
                    "confidence": "source-backed"
                }
            }]
        });
        let mut evidence = RuntimeEvidence::default();
        evidence.separate_document("classic/scripts.json", &mut value);
        assert_eq!(value["triggers"][0]["id"], "Data DD:0:17");
        assert_eq!(value["triggers"][0]["active"], true);
        assert!(value["triggers"][0].get("source").is_none());
        assert!(value["triggers"][0].get("recordIndex").is_none());
        assert!(value["triggers"][0].get("provenance").is_none());

        let records = evidence.into_sorted_records();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0]["key"], "triggers:Data DD:0:17");
        assert_eq!(
            records[0]["metadata"]["provenance"]["byteOffset"],
            680
        );
    }

    #[test]
    fn separates_source_only_asset_metadata() {
        let mut value = json!({
            "icons": [{
                "id": "scenario-cicn-434",
                "resourceId": 434,
                "source": "Scenario resource fork: Scenario.rsrc"
            }]
        });
        let mut evidence = RuntimeEvidence::default();
        evidence.separate_document("classic/assets.json", &mut value);

        assert!(value["icons"][0].get("source").is_none());
        let records = evidence.into_sorted_records();
        assert_eq!(records[0]["key"], "icons:scenario-cicn-434");
        assert_eq!(
            records[0]["metadata"]["source"],
            "Scenario resource fork: Scenario.rsrc"
        );
    }

    #[test]
    fn retains_rule_table_source_as_runtime_selection() {
        let mut value = json!({
            "tableSelection": {
                "races": {"source": "scenario-local", "changedRecordIds": [19]},
                "castes": {"source": "shared"}
            }
        });
        let mut evidence = RuntimeEvidence::default();
        evidence.separate_document("classic/rules.json", &mut value);

        assert_eq!(value["tableSelection"]["races"]["source"], "scenario-local");
        assert_eq!(value["tableSelection"]["castes"]["source"], "shared");
        assert!(evidence.into_sorted_records().is_empty());
    }
}
