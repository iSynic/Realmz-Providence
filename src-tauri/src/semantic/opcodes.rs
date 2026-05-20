use crate::project::*;
use serde_json::{json, Value};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, Default)]
pub(super) struct ReferenceCounts {
    pub simple: usize,
    pub complex: usize,
    pub battle: usize,
    pub shop: usize,
    pub message: usize,
    pub monster: usize,
    pub treasure: usize,
    pub timed: usize,
}

#[derive(Debug, Clone)]
pub(super) struct ActionTarget {
    pub id: String,
    pub kind: String,
    pub role: String,
    pub resolved: bool,
    pub edcd_values: Option<[i16; 5]>,
    pub metadata: BTreeMap<String, Value>,
}

#[derive(Debug, Clone)]
pub(super) struct ActionDiagnostic {
    pub diagnostic_type: String,
    pub severity: DiagnosticSeverity,
    pub message: String,
    pub target: Option<String>,
    pub data: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Default)]
pub(super) struct ActionSemantics {
    pub targets: Vec<ActionTarget>,
    pub edcd_usage: Option<Value>,
    pub diagnostics: Vec<ActionDiagnostic>,
}

#[derive(Debug, Clone, Copy)]
struct OpcodeSpec {
    known: bool,
    consumes_edcd: bool,
}

#[derive(Debug, Clone, Copy)]
struct EdcdShapeSpec {
    name: &'static str,
    fields: [&'static str; 5],
}

pub(super) fn normalize_opcode(code: i16) -> i16 {
    if code < 0 && code != -14 && code != -23 {
        -code
    } else {
        code
    }
}

pub(super) fn action_semantics(
    action: &Action,
    trigger: &TriggerRecord,
    extra_rows: &BTreeMap<usize, [i16; 5]>,
    counts: ReferenceCounts,
) -> ActionSemantics {
    let mut semantics = ActionSemantics::default();
    let code = normalize_opcode(action.code);
    let spec = opcode_spec(code);

    if !spec.known && code != 0 {
        semantics.diagnostics.push(ActionDiagnostic {
            diagnostic_type: "unknown-opcode".to_string(),
            severity: DiagnosticSeverity::Warning,
            message: if code.abs() > 127 {
                format!(
                    "Action slot {} contains high-value unknown opcode {} (raw {})",
                    action.slot, code, action.raw_code
                )
            } else {
                format!(
                    "Action slot {} contains undocumented opcode {} (raw {})",
                    action.slot, code, action.raw_code
                )
            },
            target: None,
            data: metadata([
                ("slot", json!(action.slot)),
                ("code", json!(code)),
                ("rawCode", json!(action.raw_code)),
                ("id", json!(action.id)),
            ]),
        });
    }

    if spec.consumes_edcd {
        decode_edcd(action, trigger, extra_rows, counts, &mut semantics);
        return semantics;
    }

    add_direct_targets(action, trigger, counts, &mut semantics);
    semantics
}

fn decode_edcd(
    action: &Action,
    trigger: &TriggerRecord,
    extra_rows: &BTreeMap<usize, [i16; 5]>,
    counts: ReferenceCounts,
    semantics: &mut ActionSemantics,
) {
    let code = normalize_opcode(action.code);
    let row_id = action.id.max(0) as usize;
    let shape = edcd_shape(code).unwrap_or(EdcdShapeSpec {
        name: "undocumented-edcd",
        fields: ["param0", "param1", "param2", "param3", "param4"],
    });
    let row = extra_rows.get(&row_id).copied();
    let mut usage_diagnostics = Vec::new();

    semantics.targets.push(target(
        format!("record:Data EDCD:{row_id}"),
        "edcd row",
        "uses_parameter_row",
        extra_rows.contains_key(&row_id),
    ));

    let Some(values) = row else {
        let message = format!(
            "Opcode {} action slot {} references missing Data EDCD row {}",
            code, action.slot, row_id
        );
        usage_diagnostics.push(message.clone());
        semantics.diagnostics.push(ActionDiagnostic {
            diagnostic_type: "missing-edcd-row".to_string(),
            severity: DiagnosticSeverity::Warning,
            message,
            target: Some(format!("record:Data EDCD:{row_id}")),
            data: metadata([
                ("slot", json!(action.slot)),
                ("code", json!(code)),
                ("rowId", json!(row_id)),
                ("shape", json!(shape.name)),
            ]),
        });
        semantics.edcd_usage = Some(edcd_usage_json(
            action,
            row_id,
            shape,
            None,
            None,
            &[],
            usage_diagnostics,
        ));
        return;
    };

    add_edcd_targets(semantics, action, trigger, values, counts);

    let mut secondary = None;
    if code == 92 {
        let secondary_id = row_id + 1;
        if let Some(secondary_values) = extra_rows.get(&secondary_id).copied() {
            secondary = Some((secondary_id, secondary_values));
        } else {
            let message = format!(
                "Opcode 92 action slot {} is missing secondary Data EDCD row {} for random-region shape details",
                action.slot, secondary_id
            );
            usage_diagnostics.push(message.clone());
            semantics.diagnostics.push(ActionDiagnostic {
                diagnostic_type: "missing-secondary-edcd-row".to_string(),
                severity: DiagnosticSeverity::Warning,
                message,
                target: Some(format!("record:Data EDCD:{secondary_id}")),
                data: metadata([
                    ("slot", json!(action.slot)),
                    ("code", json!(code)),
                    ("primaryRowId", json!(row_id)),
                    ("secondaryRowId", json!(secondary_id)),
                ]),
            });
        }
    }

    semantics.edcd_usage = Some(edcd_usage_json(
        action,
        row_id,
        shape,
        Some(values),
        secondary,
        &semantics.targets,
        usage_diagnostics,
    ));
}

fn add_direct_targets(
    action: &Action,
    _trigger: &TriggerRecord,
    counts: ReferenceCounts,
    semantics: &mut ActionSemantics,
) {
    let id = action.id.max(0) as usize;
    match normalize_opcode(action.code) {
        1 | 19 | 62 | 71 => {
            add_message_target(&mut semantics.targets, action.id, counts, "shows_message")
        }
        4 => semantics.targets.push(target(
            format!("encounter:simple:{id}"),
            "simple encounter",
            "starts_encounter",
            id < counts.simple,
        )),
        5 => semantics.targets.push(target(
            format!("encounter:complex:{id}"),
            "complex encounter",
            "starts_encounter",
            id < counts.complex,
        )),
        6 | 49 | 51 => semantics.targets.push(target(
            format!("shop:{id}"),
            "shop",
            "opens_shop",
            id < counts.shop,
        )),
        8 | 40 | 55 | 64 | 85 => {
            add_macro_target(&mut semantics.targets, action.id, None, "calls_macro")
        }
        9 => semantics.targets.push(target(
            format!("resource:snd :{id}"),
            "sound resource",
            "uses_resource",
            true,
        )),
        10 => semantics.targets.push(target(
            format!("treasure:{id}"),
            "treasure",
            "gives_treasure",
            id < counts.treasure || counts.treasure == 0,
        )),
        27 => semantics.targets.push(target(
            format!("resource:PICT:{id}"),
            "picture resource",
            "uses_resource",
            true,
        )),
        29 | 97 => semantics.targets.push(target(
            format!("map-record:{id}"),
            "map record",
            "uses_map_record",
            true,
        )),
        35 => semantics.targets.push(target(
            format!("encounter:simple:{id}"),
            "simple encounter",
            "mutates_encounter_state",
            id < counts.simple,
        )),
        44 => semantics.targets.push(target(
            format!("encounter:complex:{id}"),
            "complex encounter",
            "mutates_encounter_state",
            id < counts.complex,
        )),
        47 => semantics.targets.push(target(
            format!("quest-flag:{id}"),
            "quest flag",
            "writes_flag",
            true,
        )),
        104 => semantics.targets.push(target(
            format!("encounter:simple:{id}"),
            "simple encounter",
            "mutates_encounter_state",
            id < counts.simple,
        )),
        106 => {
            semantics.targets.push(target(
                format!("map-record:{id}"),
                "map record",
                "changes_rendering",
                true,
            ));
            semantics.targets.push(target(
                "runtime-cache:CL".to_string(),
                "runtime cache",
                "mutates_cache",
                true,
            ));
        }
        127 => add_monster_target(
            &mut semantics.targets,
            action.id,
            None,
            counts,
            "uses_monster",
        ),
        _ => {}
    }
}

fn add_edcd_targets(
    semantics: &mut ActionSemantics,
    action: &Action,
    trigger: &TriggerRecord,
    values: [i16; 5],
    counts: ReferenceCounts,
) {
    let code = normalize_opcode(action.code);
    match code {
        2 | 48 | 56 | 107 => {
            add_battle_range_targets(&mut semantics.targets, values, counts);
            add_message_target(&mut semantics.targets, values[3], counts, "shows_message");
            if values[2] > 0 {
                add_macro_target(
                    &mut semantics.targets,
                    values[2],
                    Some(values),
                    "calls_macro",
                );
            }
        }
        3 => {
            add_branch_target(
                &mut semantics.targets,
                &mut semantics.diagnostics,
                values[1],
                values[2],
                values,
                counts,
                "branches_to",
                action,
            );
            add_message_target(&mut semantics.targets, values[3], counts, "shows_message");
            add_message_target(&mut semantics.targets, values[4], counts, "shows_message");
        }
        7 => {
            if values[2] > 0 {
                add_macro_target(
                    &mut semantics.targets,
                    values[2],
                    Some(values),
                    "calls_macro",
                );
            }
            let cache = cache_target_from_action_data(values[0], values[3]);
            semantics.targets.push(target_with_edcd(
                cache.clone(),
                "runtime cache",
                "mutates_cache",
                true,
                values,
            ));
            let mutation_role = if values[0] < 0 {
                "mutates_encounter_state"
            } else {
                "mutates_trigger"
            };
            semantics.targets.push(target_with_edcd(
                cache,
                "runtime cache",
                mutation_role,
                true,
                values,
            ));
        }
        12 => {
            let level_type = edcd_level_type(values[4], trigger.level_type);
            let level = values[0].max(0);
            semantics.targets.push(target_with_edcd(
                format!("map:{}:{level}", level_type.as_str()),
                "map",
                "mutates_tile",
                true,
                values,
            ));
            semantics.targets.push(target_with_edcd(
                format!("runtime-cache:{}", cache_for(level_type)),
                "runtime cache",
                "mutates_cache",
                true,
                values,
            ));
        }
        13 => {
            let cache = cache_target_for_trigger_mutation(values[3]);
            semantics.targets.push(target_with_edcd(
                cache.clone(),
                "runtime cache",
                "mutates_trigger",
                true,
                values,
            ));
            semantics.targets.push(target_with_edcd(
                cache,
                "runtime cache",
                "mutates_cache",
                true,
                values,
            ));
        }
        15 | 16 => {
            let role = if code == 15 {
                "alters_character_state"
            } else {
                "alters_party_state"
            };
            semantics.targets.push(target_with_edcd(
                "runtime-cache:CE".to_string(),
                "runtime cache",
                role,
                true,
                values,
            ));
            add_message_target(&mut semantics.targets, values[4], counts, "shows_message");
        }
        17 | 18 => semantics.targets.push(target_with_edcd(
            "runtime-cache:CE".to_string(),
            "runtime cache",
            if code == 17 {
                "alters_character_state"
            } else {
                "alters_party_state"
            },
            true,
            values,
        )),
        20 | 45 => {
            let level = values[0].max(0);
            let level_type = trigger.level_type.unwrap_or(LevelType::Land);
            semantics.targets.push(target_with_edcd(
                format!("map:{}:{level}", level_type.as_str()),
                "map",
                "uses_map_record",
                true,
                values,
            ));
            semantics.targets.push(target_with_edcd(
                format!("runtime-cache:{}", cache_for(level_type)),
                "runtime cache",
                "writes_runtime_state",
                true,
                values,
            ));
            add_message_target(&mut semantics.targets, values[4], counts, "shows_message");
        }
        21 => {
            semantics.targets.push(target_with_edcd(
                format!("treasure:{}", values[0].max(0)),
                "item or treasure reference",
                "reads_flag",
                true,
                values,
            ));
            add_branch_target(
                &mut semantics.targets,
                &mut semantics.diagnostics,
                values[1],
                values[3].max(values[4]),
                values,
                counts,
                "branches_to",
                action,
            );
        }
        22 => semantics.targets.push(target_with_edcd(
            "runtime-cache:CS".to_string(),
            "runtime cache",
            "alters_party_state",
            true,
            values,
        )),
        23 | -23 => {
            add_random_region_mutation(&mut semantics.targets, code, values, trigger);
            if values[3] >= 0 || values[4] >= 0 {
                add_battle_range_targets(
                    &mut semantics.targets,
                    [values[3], values[4], 0, 0, 0],
                    counts,
                );
            }
        }
        30 => semantics.targets.push(target_with_edcd(
            "runtime-cache:CE".to_string(),
            "runtime cache",
            "selects_characters",
            true,
            values,
        )),
        31 => {
            semantics.targets.push(target_with_edcd(
                "runtime-cache:CE".to_string(),
                "runtime cache",
                "selects_characters",
                true,
                values,
            ));
            add_macro_target(
                &mut semantics.targets,
                values[3],
                Some(values),
                "branches_true",
            );
            add_macro_target(
                &mut semantics.targets,
                values[4],
                Some(values),
                "branches_false",
            );
        }
        33 => semantics.targets.push(target_with_edcd(
            "runtime-cache:CS".to_string(),
            "runtime cache",
            "alters_party_state",
            true,
            values,
        )),
        37 => {
            semantics.targets.push(target_with_edcd(
                "runtime-cache:CD".to_string(),
                "runtime cache",
                "writes_runtime_state",
                true,
                values,
            ));
            add_message_target(&mut semantics.targets, values[4], counts, "shows_message");
        }
        38 | 58 | 59 => add_branch_target(
            &mut semantics.targets,
            &mut semantics.diagnostics,
            values[2],
            values[3],
            values,
            counts,
            "branches_to",
            action,
        ),
        39 => add_macro_target(
            &mut semantics.targets,
            values[0],
            Some(values),
            "calls_macro",
        ),
        41 => semantics.targets.push(target_with_edcd(
            format!("encounter:simple:{}", values[0].max(0)),
            "simple encounter",
            "mutates_encounter_state",
            (values[0].max(0) as usize) < counts.simple,
            values,
        )),
        42 => add_branch_target(
            &mut semantics.targets,
            &mut semantics.diagnostics,
            values[2],
            values[3],
            values,
            counts,
            "branches_to",
            action,
        ),
        43 => semantics.targets.push(target_with_edcd(
            "runtime-cache:CE".to_string(),
            "runtime cache",
            "alters_character_state",
            true,
            values,
        )),
        46 => {
            semantics.targets.push(target_with_edcd(
                format!("quest-flag:{}", values[0].max(0)),
                "quest flag",
                "reads_flag",
                true,
                values,
            ));
            add_branch_target(
                &mut semantics.targets,
                &mut semantics.diagnostics,
                values[2],
                values[3],
                values,
                counts,
                "branches_to",
                action,
            );
        }
        50 | 52 | 53 => semantics.targets.push(target_with_edcd(
            "runtime-cache:CE".to_string(),
            "runtime cache",
            "selects_characters",
            true,
            values,
        )),
        54 => semantics.targets.push(target_with_edcd(
            format!("time:{}", values[0].max(0)),
            "timed-encounter",
            "mutates_time_encounter",
            (values[0].max(0) as usize) < counts.timed || counts.timed == 0,
            values,
        )),
        57 => {
            semantics.targets.push(target_with_edcd(
                format!("map:land:{}", values[2].max(0)),
                "map",
                "changes_rendering",
                true,
                values,
            ));
            semantics.targets.push(target_with_edcd(
                "runtime-cache:CL".to_string(),
                "runtime cache",
                "mutates_cache",
                true,
                values,
            ));
        }
        60 | 68 | 69 | 70 | 90 | 103 | 108 => semantics.targets.push(target_with_edcd(
            "runtime-cache:CS".to_string(),
            "runtime cache",
            if matches!(code, 108) {
                "alters_character_state"
            } else {
                "writes_runtime_state"
            },
            true,
            values,
        )),
        61 => semantics.targets.push(target_with_edcd(
            cache_target_from_level_kind(values[0]),
            "runtime cache",
            "writes_runtime_state",
            true,
            values,
        )),
        63 => semantics.targets.push(target_with_edcd(
            "runtime-cache:CT".to_string(),
            "runtime cache",
            "writes_runtime_state",
            true,
            values,
        )),
        65 => semantics.targets.push(target_with_edcd(
            "runtime-cache:CS".to_string(),
            "runtime cache",
            "alters_party_state",
            true,
            values,
        )),
        67 => {
            semantics.targets.push(target_with_edcd(
                format!("treasure:{}", values[0].max(0)),
                "item or treasure reference",
                "reads_flag",
                true,
                values,
            ));
            add_branch_target(
                &mut semantics.targets,
                &mut semantics.diagnostics,
                values[1],
                values[3],
                values,
                counts,
                "branches_true",
                action,
            );
            add_branch_target(
                &mut semantics.targets,
                &mut semantics.diagnostics,
                values[1],
                values[4],
                values,
                counts,
                "branches_false",
                action,
            );
        }
        72 | 75 => {
            add_branch_target(
                &mut semantics.targets,
                &mut semantics.diagnostics,
                values[3],
                values[4],
                values,
                counts,
                "branches_false",
                action,
            );
        }
        73 => semantics.targets.push(target_with_edcd(
            format!("shop:{}", values[0].max(0)),
            "shop",
            "opens_shop",
            (values[0].max(0) as usize) < counts.shop,
            values,
        )),
        74 => {
            semantics.targets.push(target_with_edcd(
                "runtime-cache:CS".to_string(),
                "runtime cache",
                "alters_party_state",
                true,
                values,
            ));
            add_message_target(&mut semantics.targets, values[4], counts, "shows_message");
        }
        76 => {
            semantics.targets.push(target_with_edcd(
                format!("quest-flag:{}", values[0].max(0)),
                "quest flag",
                "writes_flag",
                true,
                values,
            ));
            add_branch_target(
                &mut semantics.targets,
                &mut semantics.diagnostics,
                values[2],
                values[4],
                values,
                counts,
                "branches_to",
                action,
            );
        }
        77 | 78 => {
            semantics.targets.push(target_with_edcd(
                format!("quest-flag:{}", values[0].max(0)),
                if code == 77 {
                    "quest flag"
                } else {
                    "tile parameter"
                },
                "reads_flag",
                true,
                values,
            ));
            add_branch_target(
                &mut semantics.targets,
                &mut semantics.diagnostics,
                values[2],
                values[3],
                values,
                counts,
                "branches_false",
                action,
            );
            add_branch_target(
                &mut semantics.targets,
                &mut semantics.diagnostics,
                values[2],
                values[4],
                values,
                counts,
                "branches_true",
                action,
            );
        }
        81 => {
            semantics.targets.push(target_with_edcd(
                "runtime-cache:CE".to_string(),
                "runtime cache",
                "reads_flag",
                true,
                values,
            ));
            add_macro_target(
                &mut semantics.targets,
                values[3],
                Some(values),
                "branches_true",
            );
            add_macro_target(
                &mut semantics.targets,
                values[4],
                Some(values),
                "branches_false",
            );
        }
        85 => {
            add_branch_target(
                &mut semantics.targets,
                &mut semantics.diagnostics,
                values[0],
                values[3],
                values,
                counts,
                "branches_to",
                action,
            );
            add_message_target(&mut semantics.targets, values[4], counts, "shows_message");
        }
        86 | 87 => {
            add_branch_target(
                &mut semantics.targets,
                &mut semantics.diagnostics,
                values[1],
                values[3],
                values,
                counts,
                "branches_true",
                action,
            );
            add_branch_target(
                &mut semantics.targets,
                &mut semantics.diagnostics,
                values[1],
                values[4],
                values,
                counts,
                "branches_false",
                action,
            );
        }
        92 => add_random_region_mutation(&mut semantics.targets, code, values, trigger),
        120 => {
            add_monster_target(
                &mut semantics.targets,
                values[1],
                Some(values),
                counts,
                "uses_monster",
            );
            if values[3] > 0 {
                semantics.targets.push(target_with_edcd(
                    format!("resource:cicn:{}", values[3]),
                    "icon resource",
                    "uses_resource",
                    true,
                    values,
                ));
            }
            semantics.targets.push(target_with_edcd(
                "runtime-cache:CE".to_string(),
                "runtime cache",
                "mutates_cache",
                true,
                values,
            ));
        }
        121 => semantics.targets.push(target_with_edcd(
            "runtime-cache:CE".to_string(),
            "runtime cache",
            "writes_runtime_state",
            true,
            values,
        )),
        122 => {
            add_message_target(&mut semantics.targets, values[0], counts, "shows_message");
            add_message_target(&mut semantics.targets, values[4], counts, "shows_message");
        }
        123 => {
            for value in values {
                add_monster_target(
                    &mut semantics.targets,
                    value,
                    Some(values),
                    counts,
                    "uses_monster",
                );
            }
        }
        124 => {
            add_monster_target(
                &mut semantics.targets,
                values[1],
                Some(values),
                counts,
                "uses_monster",
            );
            semantics.targets.push(target_with_edcd(
                "runtime-cache:CE".to_string(),
                "runtime cache",
                "mutates_encounter_state",
                true,
                values,
            ));
        }
        125 => {
            add_monster_target(
                &mut semantics.targets,
                values[0],
                Some(values),
                counts,
                "uses_monster",
            );
            semantics.targets.push(target_with_edcd(
                "runtime-cache:CE".to_string(),
                "runtime cache",
                "mutates_encounter_state",
                true,
                values,
            ));
        }
        126 => {
            add_macro_target(
                &mut semantics.targets,
                values[3],
                Some(values),
                "calls_macro",
            );
            add_macro_target(
                &mut semantics.targets,
                values[4],
                Some(values),
                "calls_macro",
            );
        }
        _ => {}
    }
}

fn add_random_region_mutation(
    targets: &mut Vec<ActionTarget>,
    code: i16,
    values: [i16; 5],
    trigger: &TriggerRecord,
) {
    let level_type = if code == -23 || values[2] != 0 {
        LevelType::Dungeon
    } else {
        trigger.level_type.unwrap_or(LevelType::Land)
    };
    let level = values[0].max(0);
    let rect = values[1].max(0);
    targets.push(target_with_edcd(
        format!("random:{}:{level}:{rect}", level_type.as_str()),
        "random-region",
        "mutates_random_region",
        true,
        values,
    ));
    targets.push(target_with_edcd(
        format!("runtime-cache:{}", cache_for(level_type)),
        "runtime cache",
        "mutates_cache",
        true,
        values,
    ));
}

fn add_battle_range_targets(
    targets: &mut Vec<ActionTarget>,
    values: [i16; 5],
    counts: ReferenceCounts,
) {
    let low = values[0].abs() as usize;
    let high = values[1].max(values[0]).abs() as usize;
    let high = high.max(low);
    let battles: Vec<usize> = if high.saturating_sub(low) > 32 {
        vec![low, high]
    } else {
        (low..=high).collect()
    };
    for battle in battles {
        targets.push(target_with_edcd(
            format!("battle:{battle}"),
            "battle",
            "starts_battle",
            battle < counts.battle,
            values,
        ));
    }
}

fn add_message_target(
    targets: &mut Vec<ActionTarget>,
    id: i16,
    counts: ReferenceCounts,
    role: &str,
) {
    if id > 0 {
        targets.push(target_with_optional_edcd(
            format!("message:{id}"),
            "message",
            role,
            (id as usize) < counts.message,
            None,
        ));
    }
}

fn add_macro_target(
    targets: &mut Vec<ActionTarget>,
    id: i16,
    values: Option<[i16; 5]>,
    role: &str,
) {
    if id > 0 {
        targets.push(target_with_optional_edcd(
            format!("macro:{id}"),
            "macro",
            role,
            true,
            values,
        ));
    }
}

fn add_monster_target(
    targets: &mut Vec<ActionTarget>,
    id: i16,
    values: Option<[i16; 5]>,
    counts: ReferenceCounts,
    role: &str,
) {
    if id > 0 {
        targets.push(target_with_optional_edcd(
            format!("monster:{id}"),
            "monster",
            role,
            (id as usize) < counts.monster || counts.monster == 0,
            values,
        ));
    }
}

fn add_branch_target(
    targets: &mut Vec<ActionTarget>,
    diagnostics: &mut Vec<ActionDiagnostic>,
    mode: i16,
    id: i16,
    values: [i16; 5],
    counts: ReferenceCounts,
    role: &str,
    action: &Action,
) {
    if id <= 0 {
        return;
    }
    if matches!(mode, -1 | 0) {
        return;
    }
    let Some((target_id, kind, resolved)) = branch_target(mode, id, counts) else {
        diagnostics.push(ActionDiagnostic {
            diagnostic_type: "unknown-branch-mode".to_string(),
            severity: DiagnosticSeverity::Warning,
            message: format!(
                "Opcode {} action slot {} uses undocumented branch mode {}",
                action.code, action.slot, mode
            ),
            target: None,
            data: metadata([
                ("slot", json!(action.slot)),
                ("code", json!(action.code)),
                ("branchMode", json!(mode)),
                ("branchTarget", json!(id)),
            ]),
        });
        return;
    };
    let mut target = target_with_edcd(target_id, kind, role, resolved, values);
    target
        .metadata
        .insert("branchMode".to_string(), json!(branch_mode_label(mode)));
    targets.push(target);
}

fn branch_target(
    mode: i16,
    id: i16,
    counts: ReferenceCounts,
) -> Option<(String, &'static str, bool)> {
    match mode {
        0 => None,
        1 => Some((format!("macro:{id}"), "macro", true)),
        2 => Some((
            format!("encounter:simple:{id}"),
            "simple encounter",
            (id as usize) < counts.simple,
        )),
        3 => Some((
            format!("encounter:complex:{id}"),
            "complex encounter",
            (id as usize) < counts.complex,
        )),
        -1 => None,
        _ => None,
    }
}

fn edcd_usage_json(
    action: &Action,
    row_id: usize,
    shape: EdcdShapeSpec,
    values: Option<[i16; 5]>,
    secondary: Option<(usize, [i16; 5])>,
    targets: &[ActionTarget],
    diagnostics: Vec<String>,
) -> Value {
    let fields = values
        .map(|values| edcd_fields(shape.fields, values))
        .unwrap_or_default();
    let target_hints: Vec<Value> = targets
        .iter()
        .filter(|target| target.role != "uses_parameter_row")
        .map(|target| {
            json!({
                "id": target.id,
                "kind": target.kind,
                "linkKind": target.role,
                "resolved": target.resolved
            })
        })
        .collect();
    let mut object = json!({
        "rowId": row_id,
        "shape": shape.name,
        "fields": fields,
        "targetHints": target_hints,
        "confidence": "source-backed",
        "diagnostics": diagnostics,
        "summary": usage_summary(shape.name, shape.fields, values)
    });
    if let Some((secondary_id, secondary_values)) = secondary {
        object["secondaryRowId"] = json!(secondary_id);
        object["secondaryShape"] = json!("random-region-shape-details");
        object["secondaryFields"] = json!(edcd_fields(
            ["shapeX1", "shapeY1", "shapeX2", "shapeY2", "shapeFlags"],
            secondary_values,
        ));
    }
    object["opcode"] = json!(action.code);
    object
}

fn edcd_fields(labels: [&'static str; 5], values: [i16; 5]) -> Vec<Value> {
    labels
        .iter()
        .zip(values)
        .map(|(name, value)| {
            let mut field = json!({ "name": name, "value": value });
            if name.to_ascii_lowercase().contains("branch")
                || name.to_ascii_lowercase().contains("behavior")
            {
                field["meaning"] = json!(branch_mode_label(value));
            }
            field
        })
        .collect()
}

fn usage_summary(shape: &str, fields: [&'static str; 5], values: Option<[i16; 5]>) -> String {
    let Some(values) = values else {
        return format!("{shape}: missing EDCD row");
    };
    let named_values: Vec<String> = fields
        .iter()
        .zip(values)
        .map(|(name, value)| format!("{name}={value}"))
        .collect();
    format!("{shape}: {}", named_values.join(", "))
}

fn opcode_spec(code: i16) -> OpcodeSpec {
    OpcodeSpec {
        known: matches!(
            code,
            -23 | -14 | 0 | 1..=78 | 81..=108 | 111 | 112 | 119..=127
        ),
        consumes_edcd: edcd_shape(code).is_some(),
    }
}

fn edcd_shape(code: i16) -> Option<EdcdShapeSpec> {
    Some(match code {
        2 => EdcdShapeSpec {
            name: "battle",
            fields: [
                "battleLow",
                "battleHigh",
                "soundOrReviveMacro",
                "message",
                "bootyMode",
            ],
        },
        3 => EdcdShapeSpec {
            name: "choice",
            fields: [
                "replyPolarity",
                "branchMode",
                "branchTarget",
                "promptA",
                "promptB",
            ],
        },
        7 => EdcdShapeSpec {
            name: "action-data-patching",
            fields: [
                "levelOrCache",
                "targetRecord",
                "macro",
                "levelKind",
                "resultSlot",
            ],
        },
        12 => EdcdShapeSpec {
            name: "tile-mutation",
            fields: [
                "level",
                "xOrDungeonY",
                "yOrDungeonX",
                "tileValue",
                "isDungeon",
            ],
        },
        13 => EdcdShapeSpec {
            name: "trigger-mutation",
            fields: [
                "level",
                "singleTrigger",
                "percent",
                "rangeStartWithSign",
                "rangeEnd",
            ],
        },
        15 | 16 => EdcdShapeSpec {
            name: "damage-heal",
            fields: ["multiplier", "low", "high", "sound", "message"],
        },
        17 | 18 => EdcdShapeSpec {
            name: "spell-cast",
            fields: ["spell", "powerLevel", "saveAdjust", "forceAffect", "unused"],
        },
        20 | 45 => EdcdShapeSpec {
            name: "teleport",
            fields: ["level", "x", "y", "sound", "message"],
        },
        21 => EdcdShapeSpec {
            name: "item-branch",
            fields: [
                "item",
                "branchMode",
                "missingBehavior",
                "hasTarget",
                "missingTarget",
            ],
        },
        22 => EdcdShapeSpec {
            name: "item-mutation",
            fields: [
                "item",
                "maxMatches",
                "mode",
                "chargeDelta",
                "replacementItem",
            ],
        },
        23 | -23 => EdcdShapeSpec {
            name: "random-region-mutation",
            fields: [
                "level",
                "randomRegion",
                "percent",
                "battleLowOrKeep",
                "battleHighOrKeep",
            ],
        },
        30 => EdcdShapeSpec {
            name: "ability-check-pick",
            fields: [
                "abilityOrAttribute",
                "adjustment",
                "sourceSet",
                "attributeFlag",
                "unused",
            ],
        },
        31 => EdcdShapeSpec {
            name: "ability-check-branch",
            fields: [
                "abilityOrAttribute",
                "adjustment",
                "attributeFlag",
                "successMacro",
                "failureMacro",
            ],
        },
        33 => EdcdShapeSpec {
            name: "gold",
            fields: ["amount", "failureMarker", "unused", "unused", "unused"],
        },
        37 => EdcdShapeSpec {
            name: "dungeon-move",
            fields: ["mode", "xOrDirection", "yOrDirection", "sound", "message"],
        },
        38 | 46 | 58 | 59 => EdcdShapeSpec {
            name: "force-branch",
            fields: ["testA", "testB", "branchMode", "target", "slot"],
        },
        39 => EdcdShapeSpec {
            name: "extended-door-codes",
            fields: ["macro", "unused", "unused", "unused", "unused"],
        },
        41 => EdcdShapeSpec {
            name: "encounter-mutation",
            fields: [
                "simpleEncounter",
                "oneBasedChoiceSlot",
                "unused",
                "unused",
                "unused",
            ],
        },
        42 => EdcdShapeSpec {
            name: "percent-branch",
            fields: ["percent", "successBehavior", "branchMode", "target", "slot"],
        },
        43 => EdcdShapeSpec {
            name: "condition",
            fields: ["scope", "condition", "durationOrDelta", "sound", "unused"],
        },
        48 | 56 | 107 => EdcdShapeSpec {
            name: "battle-variant",
            fields: [
                "battleLow",
                "battleHigh",
                "branchOrSound",
                "message",
                "extra",
            ],
        },
        50 => EdcdShapeSpec {
            name: "character-selector",
            fields: [
                "selector",
                "gender",
                "raceCasteOrClass",
                "unused",
                "livingOnly",
            ],
        },
        52 => EdcdShapeSpec {
            name: "character-selector",
            fields: ["selector", "value", "sourceSet", "unused", "unused"],
        },
        53 => EdcdShapeSpec {
            name: "caste-selector",
            fields: ["exactCaste", "casteGroup", "sourceSet", "unused", "unused"],
        },
        54 => EdcdShapeSpec {
            name: "timed-encounter-mutation",
            fields: ["timedEncounter", "mode", "dayOrInterval", "hour", "minute"],
        },
        57 => EdcdShapeSpec {
            name: "render-mutation",
            fields: ["landlook", "isDark", "targetLandLevel", "unused", "unused"],
        },
        60 => EdcdShapeSpec {
            name: "party-money-state",
            fields: ["moneyType", "pickedOnly", "unused", "unused", "unused"],
        },
        61 => EdcdShapeSpec {
            name: "position-shift",
            fields: ["legacyLevel", "xShift", "yShift", "randomize", "unused"],
        },
        63 => EdcdShapeSpec {
            name: "time-mutation",
            fields: ["mode", "day", "hour", "minute", "unused"],
        },
        65 => EdcdShapeSpec {
            name: "random-items",
            fields: ["count", "itemLow", "itemHigh", "unused", "unused"],
        },
        67 => EdcdShapeSpec {
            name: "item-charge-branch",
            fields: [
                "item",
                "branchMode",
                "minimumCharges",
                "successTarget",
                "failureTarget",
            ],
        },
        68 => EdcdShapeSpec {
            name: "fatigue",
            fields: ["mode", "unused", "percent", "unused", "unused"],
        },
        69 => EdcdShapeSpec {
            name: "spell-flags",
            fields: [
                "spellcasting",
                "monstercasting",
                "spellcharging",
                "unused",
                "unused",
            ],
        },
        70 => EdcdShapeSpec {
            name: "save-restore-position",
            fields: ["mode", "unused", "unused", "unused", "unused"],
        },
        72 | 75 => EdcdShapeSpec {
            name: "range-branch",
            fields: ["testA", "testB", "falseBehavior", "branchMode", "target"],
        },
        73 => EdcdShapeSpec {
            name: "restricted-shop",
            fields: ["shop", "range1Low", "range1High", "range2Low", "range2High"],
        },
        74 => EdcdShapeSpec {
            name: "spell-points",
            fields: ["rollCount", "low", "high", "playSound", "message"],
        },
        76 => EdcdShapeSpec {
            name: "quest-value",
            fields: ["quest", "delta", "branchMode", "threshold", "target"],
        },
        77 | 78 => EdcdShapeSpec {
            name: "false-true-branch",
            fields: ["testA", "testB", "branchMode", "falseTarget", "trueTarget"],
        },
        81 => EdcdShapeSpec {
            name: "condition-branch",
            fields: [
                "condition",
                "characterSelector",
                "unused",
                "trueMacro",
                "falseMacro",
            ],
        },
        85 => EdcdShapeSpec {
            name: "random-branch",
            fields: ["branchMode", "rangeLow", "rangeHigh", "sound", "message"],
        },
        86 | 87 => EdcdShapeSpec {
            name: "conditional-branch",
            fields: [
                "testSelector",
                "branchModeOrValue",
                "falseBehavior",
                "trueTarget",
                "falseTarget",
            ],
        },
        90 => EdcdShapeSpec {
            name: "party-state",
            fields: ["amount", "scope", "unused", "unused", "unused"],
        },
        92 => EdcdShapeSpec {
            name: "random-region-shape-mutation",
            fields: ["level", "rect", "isDungeon", "percentDelta", "shapeMode"],
        },
        103 => EdcdShapeSpec {
            name: "boat-camp-state",
            fields: [
                "mode",
                "statusValue",
                "branchModeOrBehavior",
                "targetOrValueA",
                "targetOrValueB",
            ],
        },
        108 => EdcdShapeSpec {
            name: "selected-character-state",
            fields: ["statSelector", "delta", "unused", "unused", "unused"],
        },
        120 => EdcdShapeSpec {
            name: "combat-monster-mutation",
            fields: [
                "targetClass",
                "monsterId",
                "count",
                "replacementIcon",
                "traitorOverride",
            ],
        },
        121 => EdcdShapeSpec {
            name: "unused-edcd-load",
            fields: ["unused0", "unused1", "unused2", "unused3", "unused4"],
        },
        122 => EdcdShapeSpec {
            name: "fumble",
            fields: ["message", "sound", "unused", "unused", "unused"],
        },
        123 => EdcdShapeSpec {
            name: "rout",
            fields: ["monster1", "monster2", "monster3", "monster4", "monster5"],
        },
        124 => EdcdShapeSpec {
            name: "spawn",
            fields: ["unused", "monster", "count", "sound", "traitorOverride"],
        },
        125 => EdcdShapeSpec {
            name: "destroy-related",
            fields: [
                "monsterId",
                "maxCount",
                "unused",
                "unused",
                "includeTraitorSide",
            ],
        },
        126 => EdcdShapeSpec {
            name: "battle-macro",
            fields: [
                "mode",
                "roundOrPercent",
                "repeatMode",
                "macroLow",
                "macroHigh",
            ],
        },
        _ => return None,
    })
}

fn branch_mode_label(mode: i16) -> &'static str {
    match mode {
        -1 => "drop-stop",
        0 => "keep-current",
        1 => "macro",
        2 => "simple-encounter",
        3 => "complex-encounter",
        _ => "undocumented",
    }
}

fn cache_target_from_action_data(cache_or_level: i16, level_kind: i16) -> String {
    match cache_or_level {
        -1 => "runtime-cache:CE".to_string(),
        -2 => "runtime-cache:CE2".to_string(),
        _ => cache_target_from_level_kind(level_kind),
    }
}

fn cache_target_from_level_kind(level_kind: i16) -> String {
    if level_kind != 0 {
        "runtime-cache:CD".to_string()
    } else {
        "runtime-cache:CL".to_string()
    }
}

fn cache_target_for_trigger_mutation(range_start_with_sign: i16) -> String {
    if range_start_with_sign < 0 {
        "runtime-cache:CD".to_string()
    } else {
        "runtime-cache:CL".to_string()
    }
}

fn edcd_level_type(flag: i16, fallback: Option<LevelType>) -> LevelType {
    if flag != 0 {
        LevelType::Dungeon
    } else {
        fallback.unwrap_or(LevelType::Land)
    }
}

fn cache_for(level_type: LevelType) -> &'static str {
    match level_type {
        LevelType::Land => "CL",
        LevelType::Dungeon => "CD",
    }
}

fn target(id: String, kind: &str, role: &str, resolved: bool) -> ActionTarget {
    ActionTarget {
        id,
        kind: kind.to_string(),
        role: role.to_string(),
        resolved,
        edcd_values: None,
        metadata: BTreeMap::new(),
    }
}

fn target_with_edcd(
    id: String,
    kind: &str,
    role: &str,
    resolved: bool,
    edcd_values: [i16; 5],
) -> ActionTarget {
    target_with_optional_edcd(id, kind, role, resolved, Some(edcd_values))
}

fn target_with_optional_edcd(
    id: String,
    kind: &str,
    role: &str,
    resolved: bool,
    edcd_values: Option<[i16; 5]>,
) -> ActionTarget {
    ActionTarget {
        id,
        kind: kind.to_string(),
        role: role.to_string(),
        resolved,
        edcd_values,
        metadata: BTreeMap::new(),
    }
}

fn metadata<const N: usize>(entries: [(&str, Value); N]) -> BTreeMap<String, Value> {
    entries
        .into_iter()
        .map(|(key, value)| (key.to_string(), value))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_action(code: i16, id: i16) -> Action {
        Action {
            slot: 2,
            raw_code: code,
            code: normalize_opcode(code),
            id,
            label: "test".to_string(),
            category: ActionCategory::Unknown,
            gosub: code < 0 && code != -14 && code != -23,
        }
    }

    fn dummy_trigger() -> TriggerRecord {
        TriggerRecord {
            id: "trigger:test".to_string(),
            source: "Data DD".to_string(),
            level_type: Some(LevelType::Land),
            level_index: Some(0),
            record_index: 0,
            active: true,
            doorid: 0,
            landid: 0,
            target_x: 0,
            target_y: 0,
            percent: 100,
            coordinate: None,
            actions: Vec::new(),
            provenance: Provenance {
                source_file: "Data DD".to_string(),
                record_index: 0,
                byte_offset: 0,
                byte_length: 40,
                confidence: Confidence::Confirmed,
            },
        }
    }

    #[test]
    fn normalizes_negative_gosub_but_preserves_exceptions() {
        assert_eq!(normalize_opcode(-8), 8);
        assert_eq!(normalize_opcode(-14), -14);
        assert_eq!(normalize_opcode(-23), -23);
    }

    #[test]
    fn branch_modes_resolve_documented_targets() {
        let counts = ReferenceCounts {
            simple: 4,
            complex: 5,
            ..ReferenceCounts::default()
        };
        let macro_target = branch_target(1, 7, counts).unwrap();
        assert_eq!(macro_target.0, "macro:7");
        let simple_target = branch_target(2, 3, counts).unwrap();
        assert_eq!(simple_target.0, "encounter:simple:3");
        assert!(simple_target.2);
        let complex_target = branch_target(3, 9, counts).unwrap();
        assert_eq!(complex_target.0, "encounter:complex:9");
        assert!(!complex_target.2);
        assert!(branch_target(0, 1, counts).is_none());
        assert!(branch_target(-1, 1, counts).is_none());
    }

    #[test]
    fn opcode_92_reads_secondary_edcd_row() {
        let mut rows = BTreeMap::new();
        rows.insert(10, [1, 2, 0, 15, 1]);
        rows.insert(11, [3, 4, 5, 6, 7]);
        let action = dummy_action(92, 10);
        let semantics =
            action_semantics(&action, &dummy_trigger(), &rows, ReferenceCounts::default());
        let usage = semantics
            .edcd_usage
            .expect("opcode 92 should emit edcd usage");
        assert_eq!(usage["rowId"], json!(10));
        assert_eq!(usage["secondaryRowId"], json!(11));
        assert!(semantics
            .targets
            .iter()
            .any(|target| target.role == "mutates_random_region"));
    }

    #[test]
    fn opcode_92_missing_secondary_row_is_diagnostic() {
        let mut rows = BTreeMap::new();
        rows.insert(10, [1, 2, 0, 15, 1]);
        let action = dummy_action(92, 10);
        let semantics =
            action_semantics(&action, &dummy_trigger(), &rows, ReferenceCounts::default());
        assert!(semantics
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.diagnostic_type == "missing-secondary-edcd-row"));
    }

    #[test]
    fn missing_edcd_row_is_diagnostic() {
        let action = dummy_action(2, 999);
        let semantics = action_semantics(
            &action,
            &dummy_trigger(),
            &BTreeMap::new(),
            ReferenceCounts::default(),
        );
        assert!(semantics
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.diagnostic_type == "missing-edcd-row"));
        let usage = semantics.edcd_usage.expect("missing row still emits usage");
        assert_eq!(usage["shape"], json!("battle"));
    }
}
