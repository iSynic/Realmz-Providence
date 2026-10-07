use super::DiscoveryRecord;
use crate::model::ProjectSnapshot;
use serde::Serialize;
use serde_json::Value;
use std::{collections::BTreeMap, sync::OnceLock};

pub(super) fn records(s: &ProjectSnapshot) -> Vec<DiscoveryRecord> {
    let mut out = Vec::new();
    append_campaign(s, &mut out);
    append_text(s, &mut out);
    append_world(s, &mut out);
    append_scripts(s, &mut out);
    super::execution::records(s, &mut out);
    append_rules(s, &mut out);
    append_assets(s, &mut out);
    append_metadata(s, &mut out);
    out
}

fn append_campaign(s: &ProjectSnapshot, out: &mut Vec<DiscoveryRecord>) {
    push(
        out,
        "scenario",
        &s.project_id.0,
        "",
        s.campaign
            .as_ref()
            .map(|r| r.name.as_str())
            .unwrap_or("Scenario"),
        "scenario",
        &s.campaign,
    );
    out.last_mut().unwrap().root_reason = Some("Scenario startup".into());
}

fn append_text(s: &ProjectSnapshot, out: &mut Vec<DiscoveryRecord>) {
    for r in &s.messages {
        push(
            out,
            "message",
            &r.identity.0,
            r.native_id.0,
            &format!("String {}", r.native_id.0),
            "scenario",
            r,
        );
    }
    for r in &s.option_labels {
        push(
            out,
            "option-label",
            &r.identity.0,
            r.native_id.0,
            &r.text,
            "scenario",
            r,
        );
    }
    for id in 1..=126 {
        let label = s.quest_labels.iter().find(|r| r.id == id);
        push(
            out,
            "quest-flag",
            &format!("quest:{id}"),
            id,
            &label
                .map(|r| r.label.clone())
                .unwrap_or_else(|| format!("Quest {id}")),
            "scenario",
            &label,
        );
    }
}

fn append_world(s: &ProjectSnapshot, out: &mut Vec<DiscoveryRecord>) {
    for r in &s.world.maps {
        push(
            out,
            "map",
            &r.identity.0,
            r.native_index,
            &r.name,
            "scenario",
            &serde_json::json!({"name":r.name,"levelType":r.level_type,"identity":r.identity,"nativeIndex":r.native_index}),
        );
    }
    for r in &s.world.action_points {
        push(
            out,
            "action-point",
            &r.identity.0,
            r.record_index,
            &format!(
                "{} {} · Action Point {}{}",
                if r.level_type == crate::model::LevelType::Land {
                    "Land"
                } else {
                    "Dungeon"
                },
                r.level_index,
                r.record_index,
                r.coordinate
                    .map(|c| format!(" · ({}, {})", c.x, c.y))
                    .unwrap_or_else(|| " · Unplaced".into())
            ),
            "scenario",
            r,
        );
        if r.coordinate.is_some() {
            out.last_mut().unwrap().root_reason =
                Some("Placed map Action Point (chance is runtime eligibility)".into());
        }
    }
    for map in &s.world.maps {
        if let Some(runtime) = &map.runtime {
            for row in &runtime.random_rectangles {
                push(
                    out,
                    "random-rectangle",
                    &row.identity.0,
                    row.identity.0.rsplit(':').next().unwrap_or(""),
                    "Random encounter region",
                    "scenario",
                    row,
                );
                out.last_mut().unwrap().root_reason = Some("Map random encounter region".into());
            }
        }
    }
}

fn append_scripts(s: &ProjectSnapshot, out: &mut Vec<DiscoveryRecord>) {
    rows(out, "extra-action-point", &s.extra_action_points);
    rows(out, "simple-encounter", &s.simple_encounters);
    rows(out, "complex-encounter", &s.complex_encounters);
    rows(out, "rogue-encounter", &s.rogue_encounters);
    rows(out, "timed-encounter", &s.timed_encounters);
    rows(out, "player-map", &s.world.player_maps);
    rows(out, "battle", &s.battles);
    rows(out, "treasure", &s.treasures);
    rows(out, "shop", &s.shops);
    for set in &s.monster_sets {
        rows(out, "monster", &set.monsters);
    }
}

fn append_rules(s: &ProjectSnapshot, out: &mut Vec<DiscoveryRecord>) {
    for r in &s.item_rules {
        rule(out, "item", r, "stock");
    }
    for r in &s.scenario_item_rules {
        rule(out, "item", r, "scenario");
    }
    for r in &s.standard_spells {
        rule(out, "spell", r, "stock");
    }
    for r in &s.scenario_spells {
        rule(out, "spell", r, "scenario");
    }
    for r in &s.race_rules {
        rule(out, "race", r, "scenario");
        apply_rule_name(
            out.last_mut().unwrap(),
            s.rule_names
                .as_ref()
                .map(|names| names.race_names.as_slice()),
            r.definition.classic_id,
        );
    }
    for r in &s.caste_rules {
        rule(out, "caste", r, "scenario");
        apply_rule_name(
            out.last_mut().unwrap(),
            s.rule_names
                .as_ref()
                .map(|names| names.caste_names.as_slice()),
            r.definition.classic_id,
        );
    }
}

fn apply_rule_name(record: &mut DiscoveryRecord, names: Option<&[String]>, id: u8) {
    if let Some(name) = names
        .and_then(|names| names.get(usize::from(id.saturating_sub(1))))
        .filter(|name| !name.trim().is_empty())
    {
        record.name = name.clone();
    }
    if record.name.trim().is_empty() {
        let kind = if record.kind == "race" {
            crate::session::rule_authoring::RuleKind::Race
        } else {
            crate::session::rule_authoring::RuleKind::Caste
        };
        record.name = crate::rule_presentation::record_label(kind, id, "");
    }
}

fn append_assets(s: &ProjectSnapshot, out: &mut Vec<DiscoveryRecord>) {
    for r in &s.assets {
        let kind = match r
            .classic_resource
            .as_ref()
            .map(|k| k.resource_type.as_str())
        {
            Some("cicn") => "icon",
            Some("PICT") => "picture",
            Some("TEXT") => "text-resource",
            Some("snd ") => "sound",
            _ => &r.kind,
        };
        push(
            out,
            kind,
            &r.identity.0,
            r.classic_resource
                .as_ref()
                .map(|k| k.resource_id.to_string())
                .unwrap_or_default(),
            &r.label,
            "scenario",
            r,
        );
    }
}

fn append_metadata(s: &ProjectSnapshot, out: &mut Vec<DiscoveryRecord>) {
    for r in &s.script_descriptors {
        if let Some(row) = out.iter_mut().find(|row| row.identity == r.source.0) {
            row.name = if row.kind == "action-point" {
                format!("{} · {}", row.name, r.text)
            } else {
                r.text.clone()
            };
            row.fields.push(("descriptor".into(), r.text.clone()));
        }
    }
    for definition in crate::action_authoring::catalog().actions {
        push(
            out,
            "documentation",
            &format!("documentation:{}", definition.identity),
            definition.opcode,
            &definition.label,
            "docs",
            &definition,
        );
    }
}

fn rows<T: Serialize>(out: &mut Vec<DiscoveryRecord>, kind: &str, rows: &[T]) {
    for row in rows {
        let value = serde_json::to_value(row).unwrap();
        let id = value.get("nativeId").map(display).unwrap_or_default();
        let identity = value.get("identity").and_then(Value::as_str).unwrap_or("");
        let name = ["name", "displayName", "label", "text"]
            .iter()
            .find_map(|k| value.get(k).and_then(Value::as_str))
            .unwrap_or("");
        let name = if name.is_empty() {
            format!("{} {id}", kind.replace('-', " "))
        } else {
            name.into()
        };
        push(out, kind, identity, id, &name, "scenario", row);
        if kind == "timed-encounter" {
            out.last_mut().unwrap().root_reason = Some(format!(
                "{} event; eligibility is runtime state",
                kind.replace('-', " ")
            ));
        }
    }
}

fn rule<T: Serialize>(out: &mut Vec<DiscoveryRecord>, kind: &str, row: &T, scope: &str) {
    let value = serde_json::to_value(row).unwrap();
    let def = value.get("definition").unwrap_or(&value);
    let identity = def
        .get("id")
        .or_else(|| value.get("identity"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let id = def
        .get("classicId")
        .or_else(|| value.get("nativeId"))
        .map(display)
        .unwrap_or_default();
    let name = def
        .get("name")
        .or_else(|| def.get("identifiedName"))
        .and_then(Value::as_str)
        .unwrap_or(identity);
    push(out, kind, identity, id, name, scope, row);
}

fn push<T: Serialize>(
    out: &mut Vec<DiscoveryRecord>,
    kind: &str,
    identity: &str,
    id: impl ToString,
    name: &str,
    scope: &str,
    row: &T,
) {
    let mut fields = Vec::new();
    let value = serde_json::to_value(row).unwrap();
    text_fields("", &value, &mut fields);
    if let Some(actions) = value.get("actions").and_then(Value::as_array) {
        for action in actions {
            let code = action["rawOpcode"].as_i64().unwrap_or(0) as i16;
            let name = action_names()
                .get(&crate::action_authoring::normalize_opcode(code))
                .map(String::as_str)
                .unwrap_or("Unknown imported action");
            fields.push((
                format!("actions[{}]", action["slot"]),
                format!(
                    "{name} · code {code} · operand {}",
                    action["targetNativeId"]
                ),
            ));
        }
    }
    out.push(DiscoveryRecord {
        identity: identity.into(),
        kind: kind.into(),
        native_id: id.to_string(),
        name: name.into(),
        scope: scope.into(),
        root_reason: None,
        fields,
    });
}

fn action_names() -> &'static BTreeMap<i16, String> {
    static NAMES: OnceLock<BTreeMap<i16, String>> = OnceLock::new();
    NAMES.get_or_init(|| {
        crate::action_authoring::catalog()
            .actions
            .into_iter()
            .map(|d| (d.opcode, d.label))
            .collect()
    })
}

fn text_fields(path: &str, value: &Value, fields: &mut Vec<(String, String)>) {
    match value {
        Value::String(text) => fields.push((path.into(), text.clone())),
        Value::Array(rows) => {
            for (i, row) in rows.iter().enumerate() {
                text_fields(&format!("{path}[{i}]"), row, fields);
            }
        }
        Value::Object(values) => {
            for (key, value) in values {
                text_fields(
                    format!("{path}.{key}").trim_start_matches('.'),
                    value,
                    fields,
                );
            }
        }
        _ => (),
    }
}

fn display(value: &Value) -> String {
    value
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| value.to_string())
}
