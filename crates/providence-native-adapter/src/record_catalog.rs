use providence_core::{
    discovery::DiscoveryLink,
    model::{ProjectSnapshot, StableId},
    session::EditorSession,
};
use serde_json::{Value, json};
use std::collections::BTreeMap;

#[cfg(test)]
use providence_core::{
    codecs::{CODEC_REGISTRY, NativeFileFamily},
    model::LevelType,
};

#[cfg(test)]
mod link_tests;
mod rows;

const DEFAULT_PAGE_SIZE: usize = 64;
const MAX_PAGE_SIZE: usize = 128;
const SUMMARY_CHARACTERS: usize = 96;

#[derive(Clone)]
struct RecordRow {
    identity: StableId,
    label: String,
    record_type: &'static str,
    native_path: String,
    record_index: u64,
    byte_start: u64,
    byte_end: u64,
    document_kind: &'static str,
    open_command: &'static str,
    summary: String,
}

pub(crate) fn record_list(session: &EditorSession, params: &Value) -> Result<Value, String> {
    let query = filter_value(params, "query", "").to_lowercase();
    let record_type = filter_value(params, "recordType", "all");
    let native_path = filter_value(params, "nativePath", "all");
    let index = session.discovery();
    let diagnostics = session.diagnostics();
    let inventory = build_rows(session.snapshot());
    let facets = catalog_facets(&inventory)?;
    let unfiltered_total = inventory.len();
    let mut rows = inventory
        .into_iter()
        .filter(|row| record_type == "all" || row.record_type == record_type)
        .filter(|row| native_path == "all" || row.native_path == native_path)
        .filter(|row| row_matches_query(row, &query))
        .collect::<Vec<_>>();
    rows.sort_by(|left, right| {
        (
            left.native_path.as_str(),
            left.record_index,
            left.identity.0.as_str(),
        )
            .cmp(&(
                right.native_path.as_str(),
                right.record_index,
                right.identity.0.as_str(),
            ))
    });
    let total = rows.len();
    let (offset, limit) = page(params);
    let items = rows
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(|row| catalog_row(session, index, &diagnostics, &row))
        .collect::<Vec<_>>();

    Ok(json!({
        "revision": session.revision(),
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": total,
        "truncated": offset.saturating_add(limit) < total,
        "unfilteredTotal": unfiltered_total,
        "facets": facets,
    }))
}

fn catalog_row(
    session: &EditorSession,
    index: &providence_core::discovery::DiscoveryIndex,
    diagnostics: &[providence_core::validation::Diagnostic],
    row: &RecordRow,
) -> Value {
    let ambiguous = diagnostic_owner_ambiguous(session.snapshot(), row);
    let outgoing = if ambiguous {
        0
    } else {
        index.outgoing(&row.identity.0).len()
    };
    let incoming = incoming_links(index, row).len();
    let problems = if ambiguous {
        0
    } else {
        diagnostics
            .iter()
            .filter(|finding| finding.entity.as_ref() == Some(&row.identity))
            .count()
    };
    let mut projection = row_projection(row, outgoing, incoming, problems);
    owner_navigation(session.snapshot(), row, &mut projection);
    projection["sourceRetained"] = json!(source_retained(session.snapshot(), &row.native_path));
    projection
}

fn resolve_row(session: &EditorSession, params: &Value) -> Result<RecordRow, String> {
    let identity = params
        .get("identity")
        .and_then(Value::as_str)
        .ok_or_else(|| "record.open requires identity".to_string())?;
    let matches = build_rows(session.snapshot())
        .into_iter()
        .filter(|row| {
            row.identity.0 == identity
                && params["recordType"]
                    .as_str()
                    .is_none_or(|kind| kind == row.record_type)
        })
        .collect::<Vec<_>>();
    let row = match matches.as_slice() {
        [row] => row.clone(),
        [] => return Err(format!("Decoded record '{identity}' was not found")),
        _ => {
            return Err(format!(
                "Decoded record '{identity}' has multiple source owners. Choose its record type explicitly."
            ));
        }
    };
    Ok(row)
}

pub(crate) fn record_open(session: &EditorSession, params: &Value) -> Result<Value, String> {
    let row = resolve_row(session, params)?;
    let index = session.discovery();
    let references = &index.links;
    let diagnostics = session.diagnostics();
    let ambiguous = diagnostic_owner_ambiguous(session.snapshot(), &row);
    let outgoing = references
        .iter()
        .filter(|reference| reference.source == row.identity.0 && !ambiguous)
        .cloned()
        .collect::<Vec<_>>();
    let incoming = incoming_links(index, &row);
    let problems = diagnostics
        .into_iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&row.identity) && !ambiguous)
        .collect::<Vec<_>>();
    let (offset, limit) = page(params);

    let mut record = row_projection(&row, outgoing.len(), incoming.len(), problems.len());
    owner_navigation(session.snapshot(), &row, &mut record);
    record["sourceRetained"] = json!(source_retained(session.snapshot(), &row.native_path));
    Ok(json!({
        "revision": session.revision(),
        "record": record,
        "outgoingReferences": outgoing.iter().skip(offset).take(limit).map(reference_projection).collect::<Vec<_>>(),
        "incomingReferences": incoming.iter().skip(offset).take(limit).map(|reference| reference_projection(reference)).collect::<Vec<_>>(),
        "problems": problems.iter().skip(offset).take(limit).collect::<Vec<_>>(),
        "paging": {
            "offset": offset,
            "limit": limit,
            "outgoingTotal": outgoing.len(),
            "incomingTotal": incoming.len(),
            "problemTotal": problems.len(),
            "outgoingTruncated": offset.saturating_add(limit) < outgoing.len(),
            "incomingTruncated": offset.saturating_add(limit) < incoming.len(),
            "problemsTruncated": offset.saturating_add(limit) < problems.len(),
        },
        "canonicalRecordIncluded": false,
    }))
}

pub(crate) fn decoded_count(snapshot: &ProjectSnapshot, native_path: &str) -> usize {
    build_rows(snapshot)
        .iter()
        .filter(|row| row.native_path == native_path)
        .count()
}

fn source_retained(snapshot: &ProjectSnapshot, native_path: &str) -> bool {
    snapshot
        .classic_sources
        .iter()
        .filter(|source| source.native_path == native_path)
        .count()
        == 1
}

fn build_rows(snapshot: &ProjectSnapshot) -> Vec<RecordRow> {
    let mut rows = Vec::new();
    rows::append_messages(snapshot, &mut rows);
    rows::append_option_labels(snapshot, &mut rows);
    rows::append_world_maps(snapshot, &mut rows);
    rows::append_world_action_points(snapshot, &mut rows);
    rows::append_extra_action_points(snapshot, &mut rows);
    rows::append_extra_codes(snapshot, &mut rows);
    rows::append_world_player_maps(snapshot, &mut rows);
    rows::append_simple_encounters(snapshot, &mut rows);
    rows::append_complex_encounters(snapshot, &mut rows);
    rows::append_rogue_encounters(snapshot, &mut rows);
    rows::append_timed_encounters(snapshot, &mut rows);
    rows::append_race_rules(snapshot, &mut rows);
    rows::append_caste_rules(snapshot, &mut rows);
    rows::append_item_rules(snapshot, &mut rows);
    rows::append_scenario_item_rules(snapshot, &mut rows);
    rows::append_standard_spells(snapshot, &mut rows);
    rows::append_scenario_spells(snapshot, &mut rows);
    rows::append_monster_sets(snapshot, &mut rows);
    rows::append_monster_descriptions(snapshot, &mut rows);
    rows::append_battles(snapshot, &mut rows);
    rows::append_treasures(snapshot, &mut rows);
    rows::append_shops(snapshot, &mut rows);
    rows
}

fn row_projection(row: &RecordRow, outgoing: usize, incoming: usize, problems: usize) -> Value {
    json!({
        "identity": row.identity,
        "label": row.label,
        "recordType": row.record_type,
        "nativePath": row.native_path,
        "recordIndex": row.record_index,
        "byteStart": row.byte_start,
        "byteEnd": row.byte_end,
        "byteLength": row.byte_end.saturating_sub(row.byte_start),
        "summary": row.summary,
        "discoveryScope": record_scope(row),
        "outgoingReferences": outgoing,
        "incomingReferences": incoming,
        "problems": problems,
        "navigation": {
            "documentKind": row.document_kind,
            "command": row.open_command,
            "identity": row.identity,
        },
    })
}

fn row_matches_query(row: &RecordRow, query: &str) -> bool {
    query.is_empty()
        || row.identity.0.to_lowercase().contains(query)
        || row.label.to_lowercase().contains(query)
        || row.record_type.contains(query)
        || row.native_path.to_lowercase().contains(query)
        || row.record_index.to_string().contains(query)
        || row.byte_start.to_string().contains(query)
        || row.byte_end.to_string().contains(query)
        || row.summary.to_lowercase().contains(query)
}

fn filter_value<'a>(params: &'a Value, key: &str, fallback: &'a str) -> &'a str {
    params
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or(fallback)
        .trim()
}

fn catalog_facets(rows: &[RecordRow]) -> Result<Value, String> {
    let mut sources = BTreeMap::new();
    let mut types = BTreeMap::new();
    for row in rows {
        *sources.entry(row.native_path.as_str()).or_insert(0_usize) += 1;
        *types.entry(row.record_type).or_insert(0_usize) += 1;
    }
    if sources.len() > MAX_PAGE_SIZE || types.len() > MAX_PAGE_SIZE {
        return Err("Decoded record facets exceed the bounded catalog contract".into());
    }
    let project = |entries: BTreeMap<&str, usize>| {
        entries
            .into_iter()
            .map(|(value, count)| json!({"value": value, "count": count}))
            .collect::<Vec<_>>()
    };
    Ok(json!({"nativePaths": project(sources), "recordTypes": project(types)}))
}

fn page(params: &Value) -> (usize, usize) {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(DEFAULT_PAGE_SIZE as u64)
        .clamp(1, MAX_PAGE_SIZE as u64) as usize;
    (offset, limit)
}

fn reference_projection(reference: &DiscoveryLink) -> Value {
    serde_json::to_value(reference).expect("typed discovery link is serializable")
}

fn owner_navigation(snapshot: &ProjectSnapshot, row: &RecordRow, value: &mut Value) {
    let shadowed = match row.record_type {
        "standard-item" => snapshot
            .scenario_item_rules
            .iter()
            .any(|r| r.definition.id == row.identity),
        "standard-spell" => snapshot
            .scenario_spells
            .iter()
            .any(|r| r.definition.id == row.identity),
        _ => false,
    };
    value["owningEditorAvailable"] = json!(!shadowed);
    value["diagnosticOwnershipAmbiguous"] = json!(diagnostic_owner_ambiguous(snapshot, row));
    value["owningEditorReason"] = json!(if shadowed {
        "This Stock definition is shadowed by a Scenario definition with the same identity. Select the Scenario row to edit the effective record; Stock Find Uses stays scoped to Stock."
    } else {
        ""
    });
}

fn diagnostic_owner_ambiguous(snapshot: &ProjectSnapshot, row: &RecordRow) -> bool {
    match row.record_type {
        "standard-item" | "scenario-item" => {
            snapshot
                .item_rules
                .iter()
                .any(|r| r.definition.id == row.identity)
                && snapshot
                    .scenario_item_rules
                    .iter()
                    .any(|r| r.definition.id == row.identity)
        }
        "standard-spell" | "scenario-spell" => {
            snapshot
                .standard_spells
                .iter()
                .any(|r| r.definition.id == row.identity)
                && snapshot
                    .scenario_spells
                    .iter()
                    .any(|r| r.definition.id == row.identity)
        }
        _ => false,
    }
}

fn record_scope(row: &RecordRow) -> &'static str {
    if row.record_type.starts_with("standard-") {
        "stock"
    } else {
        "scenario"
    }
}

fn incoming_links<'a>(
    index: &'a providence_core::discovery::DiscoveryIndex,
    row: &RecordRow,
) -> Vec<&'a DiscoveryLink> {
    index
        .records
        .iter()
        .find(|record| record.identity == row.identity.0 && record.scope == record_scope(row))
        .map(|record| index.incoming_record(record))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use providence_core::model::{
        CLASSIC_MAP_SIZE, MapLevel, NativeRecordId, ProjectSnapshot, ScenarioMessage, WorldModel,
    };

    #[test]
    fn record_catalog_pages_geometry_and_opens_only_audit_state() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("records".into()));
        snapshot.messages.push(ScenarioMessage {
            identity: StableId("message:7".into()),
            native_id: NativeRecordId(7),
            text: "A deliberately long but readable source-backed message summary.".into(),
            authored: true,
        });
        snapshot.world = WorldModel {
            maps: vec![MapLevel {
                identity: StableId("land:2".into()),
                level_type: LevelType::Land,
                native_index: 2,
                name: "Western Reaches".into(),
                tiles: vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
                runtime: None,
            }],
            ..WorldModel::default()
        };
        let session = EditorSession::new(snapshot);

        let listed = record_list(
            &session,
            &json!({"nativePath": "Data SD2", "query": "message", "limit": 500}),
        )
        .expect("bounded decoded records");
        assert_eq!(listed["total"], 1);
        assert_eq!(listed["limit"], 128);
        assert_eq!(listed["items"][0]["identity"], "message:7");
        assert_eq!(listed["items"][0]["byteStart"], 7 * 256);
        assert_eq!(listed["items"][0]["byteEnd"], 8 * 256);
        assert_eq!(listed["unfilteredTotal"], 2);
        assert_eq!(listed["facets"]["nativePaths"].as_array().unwrap().len(), 2);
        assert_eq!(listed["items"][0]["sourceRetained"], false);
        let range = record_list(&session, &json!({"query": "1792"})).unwrap();
        assert_eq!(range["items"][0]["identity"], "message:7");
        assert_eq!(decoded_count(session.snapshot(), "Data SD2"), 1);
        assert_eq!(decoded_count(session.snapshot(), "Global"), 0);
        assert!(listed.get("project").is_none());
        assert!(listed.get("snapshot").is_none());

        let opened =
            record_open(&session, &json!({"identity": "land:2"})).expect("single audit record");
        assert_eq!(opened["record"]["byteStart"], 2 * 90 * 90 * 2);
        assert_eq!(opened["record"]["navigation"]["command"], "map.open");
        assert_eq!(opened["canonicalRecordIncluded"], false);
        assert!(opened.get("project").is_none());
        assert!(opened.get("snapshot").is_none());
    }

    #[test]
    fn codec_registry_remains_the_record_geometry_denominator() {
        let registered = CODEC_REGISTRY
            .iter()
            .map(|codec| codec.family)
            .collect::<std::collections::BTreeSet<_>>();
        for family in [
            NativeFileFamily::ScenarioMessages,
            NativeFileFamily::LandMaps,
            NativeFileFamily::DungeonMaps,
            NativeFileFamily::BattleRecords,
            NativeFileFamily::ShopRecords,
        ] {
            assert!(registered.contains(&family));
        }
    }
}
