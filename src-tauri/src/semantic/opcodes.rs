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
            diagnostic_type: "dispatcher-noop".to_string(),
            severity: DiagnosticSeverity::Info,
            message: format!(
                "Action slot {} uses CODE {} (raw {}), which Realmz reads but ignores because newland.c has no dispatcher case.",
                action.slot, code, action.raw_code
            ),
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
    trigger: &TriggerRecord,
    counts: ReferenceCounts,
    semantics: &mut ActionSemantics,
) {
    let id = action.id.max(0) as usize;
    match normalize_opcode(action.code) {
        1 | 62 | 71 => {
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
        6 | 49 => semantics.targets.push(target(
            format!("shop:{id}"),
            "shop",
            "opens_shop",
            id < counts.shop,
        )),
        8 => add_same_map_action_point_target(&mut semantics.targets, action.id, trigger),
        39 => add_macro_target_allow_zero(&mut semantics.targets, action.id, None, "calls_macro"),
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
        2 => {
            add_battle_range_targets(&mut semantics.targets, values, counts);
            add_sound_target(&mut semantics.targets, values[2], Some(values), "plays_sound");
            if values[4] == 10 && values[2] >= 0 {
                add_macro_target_allow_zero(
                    &mut semantics.targets,
                    values[2],
                    Some(values),
                    "branches_on_revived_loss",
                );
            }
            add_message_target(&mut semantics.targets, values[3], counts, "shows_message");
        }
        48 => {
            add_battle_range_targets(&mut semantics.targets, values, counts);
            add_sound_target(&mut semantics.targets, values[2], Some(values), "plays_sound");
            add_message_target(&mut semantics.targets, values[3], counts, "shows_message");
            add_treasure_target(&mut semantics.targets, values[4], Some(values), counts, "gives_treasure");
        }
        56 => {
            add_battle_range_targets(&mut semantics.targets, values, counts);
            add_macro_target_allow_zero(
                &mut semantics.targets,
                values[2],
                Some(values),
                "branches_on_coward",
            );
            add_sound_target(&mut semantics.targets, values[3], Some(values), "plays_sound");
            add_message_target(&mut semantics.targets, values[4], counts, "shows_message");
        }
        107 => {
            add_battle_range_targets(&mut semantics.targets, values, counts);
            add_sound_target(&mut semantics.targets, values[2], Some(values), "plays_sound");
            add_message_target(&mut semantics.targets, values[3], counts, "shows_message");
            add_macro_target_allow_zero(
                &mut semantics.targets,
                values[4],
                Some(values),
                "branches_on_coward",
            );
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
            if values[2] >= 0 {
                add_macro_target_allow_zero(
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
            add_sound_target(&mut semantics.targets, values[3], Some(values), "plays_sound");
            add_message_target(
                &mut semantics.targets,
                values[4].abs(),
                counts,
                "shows_message",
            );
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
        19 => {
            add_message_target(&mut semantics.targets, values[0], counts, "shows_message");
            add_message_target(&mut semantics.targets, values[1], counts, "shows_message");
        }
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
            add_sound_target(&mut semantics.targets, values[3], Some(values), "plays_sound");
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
            add_zero_based_branch_target(
                &mut semantics.targets,
                &mut semantics.diagnostics,
                values[1],
                values[3],
                values,
                counts,
                "branches_true",
                action,
            );
            if values[2] == 0 {
                add_zero_based_branch_target(
                    &mut semantics.targets,
                    &mut semantics.diagnostics,
                    values[1],
                    values[4],
                    values,
                    counts,
                    "branches_false",
                    action,
                );
            } else if values[2] == 2 {
                add_message_target(&mut semantics.targets, values[4], counts, "shows_message");
            }
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
            add_macro_target_allow_zero(
                &mut semantics.targets,
                values[3],
                Some(values),
                "branches_true",
            );
            add_macro_target_allow_zero(
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
        }
        38 | 58 | 59 => add_force_branch_target(
            &mut semantics.targets,
            &mut semantics.diagnostics,
            values[2],
            values[3],
            values,
            counts,
            "branches_to",
            action,
        ),
        40 => add_branch_target(
            &mut semantics.targets,
            &mut semantics.diagnostics,
            values[1],
            values[2],
            values,
            counts,
            "branches_to",
            action,
        ),
        41 => semantics.targets.push(target_with_edcd(
            format!("encounter:simple:{}", values[0].max(0)),
            "simple encounter",
            "mutates_encounter_state",
            (values[0].max(0) as usize) < counts.simple,
            values,
        )),
        42 => add_force_branch_target(
            &mut semantics.targets,
            &mut semantics.diagnostics,
            values[2],
            values[3],
            values,
            counts,
            "branches_to",
            action,
        ),
        43 => {
            semantics.targets.push(target_with_edcd(
                "runtime-cache:CE".to_string(),
                "runtime cache",
                "alters_character_state",
                true,
                values,
            ));
            add_sound_target(&mut semantics.targets, values[3], Some(values), "plays_sound");
        }
        46 => {
            semantics.targets.push(target_with_edcd(
                format!("quest-flag:{}", values[0].max(0)),
                "quest flag",
                "reads_flag",
                true,
                values,
            ));
            add_force_branch_target(
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
        51 => {
            semantics.targets.push(target_with_edcd(
                format!("shop:{}", values[0].max(0)),
                "shop",
                "mutates_shop",
                (values[0].max(0) as usize) < counts.shop,
                values,
            ));
            semantics.targets.push(target_with_edcd(
                "runtime-cache:CS".to_string(),
                "runtime cache",
                "mutates_cache",
                true,
                values,
            ));
        }
        54 => semantics.targets.push(target_with_edcd(
            format!("time:{}", values[0].max(0)),
            "timed-encounter",
            "mutates_time_encounter",
            (values[0].max(0) as usize) < counts.timed || counts.timed == 0,
            values,
        )),
        55 => {
            add_macro_target_allow_zero(
                &mut semantics.targets,
                values[3],
                Some(values),
                "branches_true",
            );
            if values[1] == 1 {
                add_macro_target_allow_zero(
                    &mut semantics.targets,
                    values[4],
                    Some(values),
                    "branches_false",
                );
            } else if values[1] == 2 {
                add_message_target(&mut semantics.targets, values[4], counts, "shows_message");
            }
        }
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
        106 => semantics.targets.push(target_with_edcd(
            "runtime-cache:CL".to_string(),
            "runtime cache",
            "changes_rendering",
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
        64 => {
            add_macro_target_allow_zero(
                &mut semantics.targets,
                values[3],
                Some(values),
                "branches_true",
            );
            add_macro_target_allow_zero(
                &mut semantics.targets,
                values[4],
                Some(values),
                "branches_false",
            );
        }
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
            add_zero_based_branch_target(
                &mut semantics.targets,
                &mut semantics.diagnostics,
                values[1],
                values[3],
                values,
                counts,
                "branches_true",
                action,
            );
            add_zero_based_branch_target(
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
            add_zero_based_branch_target(
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
            if values[3] != 0 {
                add_sound_target(&mut semantics.targets, values[1], Some(values), "plays_sound");
            }
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
            if values[3] != 0 {
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
            if values[3] != 0 {
                add_zero_based_branch_target(
                    &mut semantics.targets,
                    &mut semantics.diagnostics,
                    values[2],
                    values[3],
                    values,
                    counts,
                    "branches_false",
                    action,
                );
            }
            if values[4] != 0 {
                add_zero_based_branch_target(
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
        }
        81 => {
            semantics.targets.push(target_with_edcd(
                "runtime-cache:CE".to_string(),
                "runtime cache",
                "reads_flag",
                true,
                values,
            ));
            add_macro_target_allow_zero(
                &mut semantics.targets,
                values[3],
                Some(values),
                "branches_true",
            );
            add_macro_target_allow_zero(
                &mut semantics.targets,
                values[4],
                Some(values),
                "branches_false",
            );
        }
        85 => {
            add_zero_based_branch_range_targets(
                &mut semantics.targets,
                &mut semantics.diagnostics,
                values[0],
                values[1],
                values[2],
                values,
                counts,
                "branches_to",
                action,
            );
            add_sound_target(&mut semantics.targets, values[3], Some(values), "plays_sound");
            add_message_target(&mut semantics.targets, values[4], counts, "shows_message");
        }
        86 => {
            let branch_mode = values[2];
            if values[3] != 0 {
                add_zero_based_branch_target(
                    &mut semantics.targets,
                    &mut semantics.diagnostics,
                    branch_mode,
                    values[3],
                    values,
                    counts,
                    "branches_true",
                    action,
                );
            }
            if values[4] != 0 {
                add_zero_based_branch_target(
                    &mut semantics.targets,
                    &mut semantics.diagnostics,
                    branch_mode,
                    values[4],
                    values,
                    counts,
                    "branches_false",
                    action,
                );
            }
        }
        87 => {
            let branch_mode = values[1];
            add_zero_based_branch_target(
                &mut semantics.targets,
                &mut semantics.diagnostics,
                branch_mode,
                values[3],
                values,
                counts,
                "branches_true",
                action,
            );
            if values[2] == 0 {
                add_zero_based_branch_target(
                    &mut semantics.targets,
                    &mut semantics.diagnostics,
                    branch_mode,
                    values[4],
                    values,
                    counts,
                    "branches_false",
                    action,
                );
            } else if values[2] == 2 {
                add_message_target(&mut semantics.targets, values[4], counts, "shows_message");
            }
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
            add_sound_target(&mut semantics.targets, values[1], Some(values), "plays_sound");
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
            add_sound_target(&mut semantics.targets, values[3], Some(values), "plays_sound");
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
            if values[2] == 2 {
                add_macro_range_targets(
                    &mut semantics.targets,
                    values[3],
                    values[4],
                    Some(values),
                    "calls_macro",
                );
            } else {
                add_macro_target_allow_zero(
                    &mut semantics.targets,
                    values[3],
                    Some(values),
                    "calls_macro",
                );
            }
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

fn add_sound_target(
    targets: &mut Vec<ActionTarget>,
    id: i16,
    values: Option<[i16; 5]>,
    role: &str,
) {
    if id != 0 {
        targets.push(target_with_optional_edcd(
            format!("resource:snd :{id}"),
            "sound resource",
            role,
            true,
            values,
        ));
    }
}

fn add_treasure_target(
    targets: &mut Vec<ActionTarget>,
    id: i16,
    values: Option<[i16; 5]>,
    counts: ReferenceCounts,
    role: &str,
) {
    if id > 0 {
        targets.push(target_with_optional_edcd(
            format!("treasure:{id}"),
            "treasure",
            role,
            (id as usize) < counts.treasure || counts.treasure == 0,
            values,
        ));
    }
}

fn add_macro_target_allow_zero(
    targets: &mut Vec<ActionTarget>,
    id: i16,
    values: Option<[i16; 5]>,
    role: &str,
) {
    if id >= 0 {
        targets.push(target_with_optional_edcd(
            format!("macro:{id}"),
            "macro",
            role,
            true,
            values,
        ));
    }
}

fn add_same_map_action_point_target(
    targets: &mut Vec<ActionTarget>,
    id: i16,
    trigger: &TriggerRecord,
) {
    if id < 0 {
        return;
    }
    let target_id = if let (Some(level_type), Some(level_index)) =
        (trigger.level_type, trigger.level_index)
    {
        format!(
            "trigger:{}:{}:{}",
            level_type.as_str(),
            level_index,
            id
        )
    } else {
        format!("trigger:current-map:{id}")
    };
    targets.push(target_with_optional_edcd(
        target_id,
        "action point",
        "copies_action_point",
        true,
        None,
    ));
}

fn add_macro_range_targets(
    targets: &mut Vec<ActionTarget>,
    low: i16,
    high: i16,
    values: Option<[i16; 5]>,
    role: &str,
) {
    if high < 0 {
        return;
    }
    let low = low.max(0);
    let high = high.max(low);
    let ids: Vec<i16> = if high.saturating_sub(low) > 32 {
        vec![low, high]
    } else {
        (low..=high).collect()
    };
    for id in ids {
        add_macro_target_allow_zero(targets, id, values, role);
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
    if id < 0 {
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

fn add_zero_based_branch_target(
    targets: &mut Vec<ActionTarget>,
    diagnostics: &mut Vec<ActionDiagnostic>,
    mode: i16,
    id: i16,
    values: [i16; 5],
    counts: ReferenceCounts,
    role: &str,
    action: &Action,
) {
    if id < 0 || mode == -1 {
        return;
    }
    let Some((target_id, kind, resolved)) = zero_based_branch_target(mode, id, counts) else {
        diagnostics.push(ActionDiagnostic {
            diagnostic_type: "unknown-branch-mode".to_string(),
            severity: DiagnosticSeverity::Warning,
            message: format!(
                "Opcode {} action slot {} uses undocumented zero-based branch mode {}",
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
    target.metadata.insert(
        "branchMode".to_string(),
        json!(zero_based_branch_mode_label(mode)),
    );
    targets.push(target);
}

fn add_force_branch_target(
    targets: &mut Vec<ActionTarget>,
    diagnostics: &mut Vec<ActionDiagnostic>,
    mode: i16,
    id: i16,
    values: [i16; 5],
    counts: ReferenceCounts,
    role: &str,
    action: &Action,
) {
    if id < 0 || matches!(mode, -1 | 1 | 2 | 3) {
        return;
    }
    let Some((target_id, kind, resolved)) = force_branch_target(mode, id, counts) else {
        diagnostics.push(ActionDiagnostic {
            diagnostic_type: "unknown-branch-mode".to_string(),
            severity: DiagnosticSeverity::Warning,
            message: format!(
                "Opcode {} action slot {} uses undocumented force-branch mode {}",
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
    target.metadata.insert(
        "branchMode".to_string(),
        json!(force_branch_mode_label(mode)),
    );
    targets.push(target);
}

fn add_zero_based_branch_range_targets(
    targets: &mut Vec<ActionTarget>,
    diagnostics: &mut Vec<ActionDiagnostic>,
    mode: i16,
    low: i16,
    high: i16,
    values: [i16; 5],
    counts: ReferenceCounts,
    role: &str,
    action: &Action,
) {
    if high < 0 || mode == -1 {
        return;
    }
    match mode {
        0 => add_macro_range_targets(targets, low, high, Some(values), role),
        1 => add_record_range_targets(
            targets,
            low,
            high,
            "encounter:simple",
            "simple encounter",
            counts.simple,
            Some(values),
            role,
        ),
        2 => add_record_range_targets(
            targets,
            low,
            high,
            "encounter:complex",
            "complex encounter",
            counts.complex,
            Some(values),
            role,
        ),
        _ => diagnostics.push(ActionDiagnostic {
            diagnostic_type: "unknown-branch-mode".to_string(),
            severity: DiagnosticSeverity::Warning,
            message: format!(
                "Opcode {} action slot {} uses undocumented zero-based branch mode {}",
                action.code, action.slot, mode
            ),
            target: None,
            data: metadata([
                ("slot", json!(action.slot)),
                ("code", json!(action.code)),
                ("branchMode", json!(mode)),
                ("branchLow", json!(low)),
                ("branchHigh", json!(high)),
            ]),
        }),
    }
}

fn add_record_range_targets(
    targets: &mut Vec<ActionTarget>,
    low: i16,
    high: i16,
    prefix: &str,
    kind: &str,
    count: usize,
    values: Option<[i16; 5]>,
    role: &str,
) {
    let low = low.max(0);
    let high = high.max(low);
    let ids: Vec<i16> = if high.saturating_sub(low) > 32 {
        vec![low, high]
    } else {
        (low..=high).collect()
    };
    for id in ids {
        targets.push(target_with_optional_edcd(
            format!("{prefix}:{id}"),
            kind,
            role,
            (id as usize) < count,
            values,
        ));
    }
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

fn zero_based_branch_target(
    mode: i16,
    id: i16,
    counts: ReferenceCounts,
) -> Option<(String, &'static str, bool)> {
    match mode {
        0 => Some((format!("macro:{id}"), "macro", true)),
        1 => Some((
            format!("encounter:simple:{id}"),
            "simple encounter",
            (id as usize) < counts.simple,
        )),
        2 => Some((
            format!("encounter:complex:{id}"),
            "complex encounter",
            (id as usize) < counts.complex,
        )),
        -1 => None,
        _ => None,
    }
}

fn force_branch_target(
    mode: i16,
    id: i16,
    _counts: ReferenceCounts,
) -> Option<(String, &'static str, bool)> {
    match mode {
        0 => Some((format!("macro:{id}"), "macro", true)),
        -1 | 1 | 2 | 3 => None,
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
        .map(|values| edcd_fields(shape.name, shape.fields, values))
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
            "random-region-shape-details",
            ["shapeX1", "shapeY1", "shapeX2", "shapeY2", "shapeFlags"],
            secondary_values,
        ));
    }
    object["opcode"] = json!(action.code);
    object
}

fn edcd_fields(shape: &str, labels: [&'static str; 5], values: [i16; 5]) -> Vec<Value> {
    labels
        .iter()
        .zip(values)
        .map(|(name, value)| {
            let mut field = json!({ "name": name, "value": value });
            if let Some(meaning) = branch_field_meaning(shape, name, value) {
                field["meaning"] = json!(meaning);
            }
            field
        })
        .collect()
}

fn branch_field_meaning(shape: &str, name: &str, value: i16) -> Option<&'static str> {
    let normalized_name = name.to_ascii_lowercase();
    if normalized_name == "failurebehavior" && shape == "picked-branch" {
        return Some(match value {
            0 => "stop",
            1 => "macro",
            2 => "message",
            _ => "undocumented",
        });
    }
    if !normalized_name.contains("branchmode") {
        return None;
    }
    Some(match shape {
        "force-branch" | "percent-branch" => force_branch_mode_label(value),
        "item-branch" | "item-charge-branch" | "false-true-branch" | "range-branch"
        | "random-branch" | "conditional-branch" => zero_based_branch_mode_label(value),
        _ => branch_mode_label(value),
    })
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

#[cfg(test)]
pub(super) fn has_newland_dispatcher_case(code: i16) -> bool {
    opcode_spec(normalize_opcode(code)).known
}

fn edcd_shape(code: i16) -> Option<EdcdShapeSpec> {
    Some(match code {
        2 => EdcdShapeSpec {
            name: "battle",
            fields: [
                "battleLow",
                "battleHigh",
                "soundOrReviveLossMacro",
                "message",
                "revivePartyFlag",
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
        19 => EdcdShapeSpec {
            name: "random-message",
            fields: ["messageLow", "messageHigh", "unused", "unused", "unused"],
        },
        20 | 45 => EdcdShapeSpec {
            name: "teleport",
            fields: ["levelOrKeep", "xOrKeep", "yOrKeep", "sound", "message"],
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
                "signedAbilityOrAttribute",
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
            fields: ["signedAmount", "failureMarker", "unused", "unused", "unused"],
        },
        37 => EdcdShapeSpec {
            name: "dungeon-move",
            fields: ["mode", "level", "x", "y", "signedHeading"],
        },
        38 | 46 | 58 | 59 => EdcdShapeSpec {
            name: "force-branch",
            fields: ["testA", "testB", "branchMode", "target", "slot"],
        },
        40 => EdcdShapeSpec {
            name: "party-condition-branch",
            fields: [
                "expectedState",
                "branchMode",
                "branchTarget",
                "condition",
                "unused",
            ],
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
        48 => EdcdShapeSpec {
            name: "selective-battle",
            fields: ["battleLow", "battleHigh", "sound", "message", "treasure"],
        },
        56 => EdcdShapeSpec {
            name: "battle-outcome-branch",
            fields: ["battleLow", "battleHigh", "cowardMacro", "sound", "message"],
        },
        107 => EdcdShapeSpec {
            name: "improved-selective-battle",
            fields: ["battleLow", "battleHigh", "sound", "message", "cowardMacro"],
        },
        50 => EdcdShapeSpec {
            name: "race-caste-gender-selector",
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
            fields: [
                "timedEncounter",
                "percentOrKeep",
                "incrementOrKeep",
                "resetDayFlag",
                "dayOffsetOrKeep",
            ],
        },
        51 => EdcdShapeSpec {
            name: "shop-mutation",
            fields: ["shop", "inflationDelta", "item", "stockDelta", "unused"],
        },
        55 => EdcdShapeSpec {
            name: "picked-branch",
            fields: [
                "pickedSelector",
                "failureBehavior",
                "unused",
                "successMacro",
                "failureTarget",
            ],
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
            fields: ["mode", "dayOrDelta", "hourOrDelta", "minuteOrDelta", "unused"],
        },
        64 => EdcdShapeSpec {
            name: "game-time-branch",
            fields: [
                "dayLimit",
                "hourLimit",
                "unused",
                "successMacro",
                "failureMacro",
            ],
        },
        65 => EdcdShapeSpec {
            name: "random-items",
            fields: ["countOrRandomLimit", "itemLow", "itemHigh", "unused", "unused"],
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
            fields: ["signedRollCount", "lowOrSound", "high", "playSound", "message"],
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
        86 => EdcdShapeSpec {
            name: "misc-conditional-branch",
            fields: [
                "testSelector",
                "signedTestValue",
                "branchMode",
                "trueTarget",
                "falseTarget",
            ],
        },
        87 => EdcdShapeSpec {
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
        106 => EdcdShapeSpec {
            name: "dark-level-state",
            fields: [
                "darkStatePlusOne",
                "stopIfAlready",
                "unused",
                "unused",
                "unused",
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
            fields: [
                "unused",
                "monster",
                "countOrRandomLimit",
                "sound",
                "traitorOverride",
            ],
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

fn zero_based_branch_mode_label(mode: i16) -> &'static str {
    match mode {
        -1 => "drop-stop",
        0 => "macro",
        1 => "simple-encounter",
        2 => "complex-encounter",
        _ => "undocumented",
    }
}

fn force_branch_mode_label(mode: i16) -> &'static str {
    match mode {
        -1 => "drop-stop",
        0 => "extra-action-point",
        1 => "inline-simple-result",
        2 => "inline-complex-result",
        3 => "exit-keep-codes",
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
    fn direct_macro_and_same_action_point_targets_follow_runtime_dispatch() {
        let jump = action_semantics(
            &dummy_action(39, 0),
            &dummy_trigger(),
            &BTreeMap::new(),
            ReferenceCounts::default(),
        );
        assert!(jump
            .targets
            .iter()
            .any(|target| target.id == "macro:0" && target.role == "calls_macro"));

        let same = action_semantics(
            &dummy_action(8, 12),
            &dummy_trigger(),
            &BTreeMap::new(),
            ReferenceCounts::default(),
        );
        assert!(same.targets.iter().any(|target| {
            target.id == "trigger:land:0:12" && target.role == "copies_action_point"
        }));
        assert!(!same.targets.iter().any(|target| target.id == "macro:12"));
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
        let zero_direct_macro = branch_target(1, 0, counts).unwrap();
        assert_eq!(zero_direct_macro.0, "macro:0");
        let zero_macro = zero_based_branch_target(0, 7, counts).unwrap();
        assert_eq!(zero_macro.0, "macro:7");
        let zero_based_macro_zero = zero_based_branch_target(0, 0, counts).unwrap();
        assert_eq!(zero_based_macro_zero.0, "macro:0");
        let zero_simple = zero_based_branch_target(1, 3, counts).unwrap();
        assert_eq!(zero_simple.0, "encounter:simple:3");
        let zero_simple_zero = zero_based_branch_target(1, 0, counts).unwrap();
        assert_eq!(zero_simple_zero.0, "encounter:simple:0");
        let force_macro = force_branch_target(0, 9, counts).unwrap();
        assert_eq!(force_macro.0, "macro:9");
        let force_macro_zero = force_branch_target(0, 0, counts).unwrap();
        assert_eq!(force_macro_zero.0, "macro:0");
        assert!(force_branch_target(1, 9, counts).is_none());
    }

    #[test]
    fn edcd_branch_conventions_follow_realmz_source() {
        let mut rows = BTreeMap::new();
        let counts = ReferenceCounts {
            simple: 20,
            complex: 20,
            ..ReferenceCounts::default()
        };

        rows.insert(1, [123, 0, 0, 7, 8]);
        let item_branch = action_semantics(&dummy_action(21, 1), &dummy_trigger(), &rows, counts);
        assert!(item_branch
            .targets
            .iter()
            .any(|target| target.id == "macro:7" && target.role == "branches_true"));
        assert!(item_branch
            .targets
            .iter()
            .any(|target| target.id == "macro:8" && target.role == "branches_false"));

        rows.clear();
        rows.insert(5, [123, 0, 2, 7, 44]);
        let item_branch_message =
            action_semantics(&dummy_action(21, 5), &dummy_trigger(), &rows, counts);
        assert!(item_branch_message
            .targets
            .iter()
            .any(|target| target.id == "message:44" && target.role == "shows_message"));
        assert!(!item_branch_message
            .targets
            .iter()
            .any(|target| target.id == "macro:44"));

        rows.clear();
        rows.insert(2, [0, 0, 0, 9, 0]);
        let force_branch = action_semantics(&dummy_action(38, 2), &dummy_trigger(), &rows, counts);
        assert!(force_branch
            .targets
            .iter()
            .any(|target| target.id == "macro:9" && target.role == "branches_to"));

        rows.clear();
        rows.insert(3, [0, 4, 6, 0, 0]);
        let random_branch = action_semantics(&dummy_action(85, 3), &dummy_trigger(), &rows, counts);
        for id in 4..=6 {
            assert!(random_branch
                .targets
                .iter()
                .any(|target| target.id == format!("macro:{id}")));
        }

        rows.clear();
        rows.insert(13, [0, 0, 0, 0, 0]);
        let random_branch_zero =
            action_semantics(&dummy_action(85, 13), &dummy_trigger(), &rows, counts);
        assert!(random_branch_zero
            .targets
            .iter()
            .any(|target| target.id == "macro:0" && target.role == "branches_to"));

        rows.clear();
        rows.insert(7, [0, 0, 0, 0, 0]);
        let action_data_patch =
            action_semantics(&dummy_action(7, 7), &dummy_trigger(), &rows, counts);
        assert!(action_data_patch
            .targets
            .iter()
            .any(|target| target.id == "macro:0" && target.role == "calls_macro"));

        rows.clear();
        rows.insert(31, [0, 0, 0, 0, 0]);
        let ability_branch =
            action_semantics(&dummy_action(31, 31), &dummy_trigger(), &rows, counts);
        assert!(ability_branch
            .targets
            .iter()
            .any(|target| target.id == "macro:0" && target.role == "branches_true"));
        assert!(ability_branch
            .targets
            .iter()
            .any(|target| target.id == "macro:0" && target.role == "branches_false"));

        rows.clear();
        rows.insert(77, [0, 0, 0, 0, 0]);
        let false_true_zero =
            action_semantics(&dummy_action(77, 77), &dummy_trigger(), &rows, counts);
        assert!(!false_true_zero
            .targets
            .iter()
            .any(|target| target.id == "macro:0"));

        rows.clear();
        rows.insert(86, [0, 0, 0, 0, 0]);
        let misc_conditional_zero =
            action_semantics(&dummy_action(86, 86), &dummy_trigger(), &rows, counts);
        assert!(!misc_conditional_zero
            .targets
            .iter()
            .any(|target| target.id == "macro:0"));

        rows.clear();
        rows.insert(6, [500, 0, 2, 11, 45]);
        let ally_branch_message =
            action_semantics(&dummy_action(87, 6), &dummy_trigger(), &rows, counts);
        assert!(ally_branch_message
            .targets
            .iter()
            .any(|target| target.id == "macro:11" && target.role == "branches_true"));
        assert!(ally_branch_message
            .targets
            .iter()
            .any(|target| target.id == "message:45" && target.role == "shows_message"));
        assert!(!ally_branch_message
            .targets
            .iter()
            .any(|target| target.id == "macro:45"));

        rows.clear();
        rows.insert(14, [500, 0, 0, 0, 0]);
        let ally_branch_zero =
            action_semantics(&dummy_action(87, 14), &dummy_trigger(), &rows, counts);
        assert!(ally_branch_zero
            .targets
            .iter()
            .any(|target| target.id == "macro:0" && target.role == "branches_true"));
        assert!(ally_branch_zero
            .targets
            .iter()
            .any(|target| target.id == "macro:0" && target.role == "branches_false"));

        rows.clear();
        rows.insert(4, [0, 0, 2, 10, 12]);
        let battle_macro = action_semantics(&dummy_action(126, 4), &dummy_trigger(), &rows, counts);
        for id in 10..=12 {
            assert!(battle_macro
                .targets
                .iter()
                .any(|target| target.id == format!("macro:{id}")));
        }

        rows.clear();
        rows.insert(15, [0, 0, 0, 0, 0]);
        let battle_macro_zero =
            action_semantics(&dummy_action(126, 15), &dummy_trigger(), &rows, counts);
        assert!(battle_macro_zero
            .targets
            .iter()
            .any(|target| target.id == "macro:0" && target.role == "calls_macro"));
    }

    #[test]
    fn action_data_patching_uses_extra_ap_source_row() {
        let mut rows = BTreeMap::new();
        rows.insert(1, [-1, 3, 0, 0, 2]);
        let simple_patch = action_semantics(
            &dummy_action(7, 1),
            &dummy_trigger(),
            &rows,
            ReferenceCounts::default(),
        );
        assert!(simple_patch
            .targets
            .iter()
            .any(|target| target.id == "macro:0" && target.role == "calls_macro"));
        assert!(simple_patch.targets.iter().any(|target| {
            target.id == "runtime-cache:CE" && target.role == "mutates_encounter_state"
        }));

        rows.insert(2, [4, 9, 12, 0, 0]);
        let trigger_patch = action_semantics(
            &dummy_action(7, 2),
            &dummy_trigger(),
            &rows,
            ReferenceCounts::default(),
        );
        assert!(trigger_patch
            .targets
            .iter()
            .any(|target| target.id == "macro:12" && target.role == "calls_macro"));
        assert!(trigger_patch
            .targets
            .iter()
            .any(|target| target.id == "runtime-cache:CL" && target.role == "mutates_trigger"));
    }

    #[test]
    fn trigger_mutation_edcd_does_not_create_macro_target() {
        let mut rows = BTreeMap::new();
        rows.insert(1, [4, 8, 0, -2, 6]);
        let semantics = action_semantics(
            &dummy_action(13, 1),
            &dummy_trigger(),
            &rows,
            ReferenceCounts::default(),
        );
        assert!(semantics
            .targets
            .iter()
            .any(|target| target.id == "runtime-cache:CD" && target.role == "mutates_trigger"));
        assert!(semantics
            .targets
            .iter()
            .any(|target| target.id == "runtime-cache:CD" && target.role == "mutates_cache"));
        assert!(!semantics
            .targets
            .iter()
            .any(|target| target.id.starts_with("macro:")));
    }

    #[test]
    fn fumble_uses_message_and_sound_only() {
        let mut rows = BTreeMap::new();
        rows.insert(12, [44, 655, 0, 0, 99]);
        let semantics = action_semantics(
            &dummy_action(122, 12),
            &dummy_trigger(),
            &rows,
            ReferenceCounts {
                message: 100,
                ..ReferenceCounts::default()
            },
        );

        assert!(semantics
            .targets
            .iter()
            .any(|target| target.id == "message:44" && target.role == "shows_message"));
        assert!(semantics
            .targets
            .iter()
            .any(|target| target.id == "resource:snd :655" && target.role == "plays_sound"));
        assert!(!semantics
            .targets
            .iter()
            .any(|target| target.id == "message:99"));
    }

    #[test]
    fn condition_and_spawn_rows_expose_sound_targets() {
        let mut rows = BTreeMap::new();

        rows.insert(15, [1, 1, 4, 611, -52]);
        let damage = action_semantics(
            &dummy_action(15, 15),
            &dummy_trigger(),
            &rows,
            ReferenceCounts {
                message: 100,
                ..ReferenceCounts::default()
            },
        );
        assert!(damage
            .targets
            .iter()
            .any(|target| target.id == "message:52" && target.role == "shows_message"));

        rows.clear();
        rows.insert(43, [0, 3, 10, 609, 0]);
        let condition = action_semantics(
            &dummy_action(43, 43),
            &dummy_trigger(),
            &rows,
            ReferenceCounts::default(),
        );
        assert!(condition.targets.iter().any(|target| {
            target.id == "resource:snd :609" && target.role == "plays_sound"
        }));

        rows.clear();
        rows.insert(124, [0, 17, 2, 610, -1]);
        let spawn = action_semantics(
            &dummy_action(124, 124),
            &dummy_trigger(),
            &rows,
            ReferenceCounts {
                monster: 100,
                ..ReferenceCounts::default()
            },
        );
        assert!(spawn
            .targets
            .iter()
            .any(|target| target.id == "monster:17" && target.role == "uses_monster"));
        assert!(spawn
            .targets
            .iter()
            .any(|target| target.id == "resource:snd :610" && target.role == "plays_sound"));
    }

    #[test]
    fn battle_shapes_keep_sound_branch_and_treasure_fields_distinct() {
        let counts = ReferenceCounts {
            battle: 100,
            message: 100,
            treasure: 100,
            ..ReferenceCounts::default()
        };
        let mut rows = BTreeMap::new();

        rows.insert(2, [1, 3, 605, 44, 0]);
        let battle = action_semantics(&dummy_action(2, 2), &dummy_trigger(), &rows, counts);
        assert!(battle
            .targets
            .iter()
            .any(|target| target.id == "resource:snd :605" && target.role == "plays_sound"));
        assert!(battle
            .targets
            .iter()
            .any(|target| target.id == "message:44" && target.role == "shows_message"));
        assert!(!battle
            .targets
            .iter()
            .any(|target| target.id == "macro:605"));

        rows.clear();
        rows.insert(2, [1, 3, 17, 44, 10]);
        let revive_battle = action_semantics(&dummy_action(2, 2), &dummy_trigger(), &rows, counts);
        assert!(revive_battle
            .targets
            .iter()
            .any(|target| target.id == "macro:17"
                && target.role == "branches_on_revived_loss"));

        rows.clear();
        rows.insert(48, [2, 4, 606, 45, 7]);
        let selective = action_semantics(&dummy_action(48, 48), &dummy_trigger(), &rows, counts);
        assert!(selective
            .targets
            .iter()
            .any(|target| target.id == "resource:snd :606"));
        assert!(selective
            .targets
            .iter()
            .any(|target| target.id == "treasure:7" && target.role == "gives_treasure"));

        rows.clear();
        rows.insert(56, [5, 0, 12, 607, 46]);
        let outcome = action_semantics(&dummy_action(56, 56), &dummy_trigger(), &rows, counts);
        assert!(outcome
            .targets
            .iter()
            .any(|target| target.id == "macro:12" && target.role == "branches_on_coward"));
        assert!(outcome
            .targets
            .iter()
            .any(|target| target.id == "resource:snd :607"));

        rows.clear();
        rows.insert(107, [6, 8, 608, 47, 13]);
        let improved = action_semantics(&dummy_action(107, 107), &dummy_trigger(), &rows, counts);
        assert!(improved
            .targets
            .iter()
            .any(|target| target.id == "resource:snd :608"));
        assert!(improved
            .targets
            .iter()
            .any(|target| target.id == "macro:13" && target.role == "branches_on_coward"));
    }

    #[test]
    fn dungeon_move_fields_are_coordinates_not_sound_or_message() {
        let mut rows = BTreeMap::new();
        rows.insert(37, [0, 2, 10, 11, -3]);
        let semantics = action_semantics(
            &dummy_action(37, 37),
            &dummy_trigger(),
            &rows,
            ReferenceCounts {
                message: 100,
                ..ReferenceCounts::default()
            },
        );
        let usage = semantics.edcd_usage.expect("dungeon move emits usage");
        assert_eq!(usage["shape"], json!("dungeon-move"));
        assert_eq!(usage["fields"][3]["name"], json!("y"));
        assert_eq!(usage["fields"][4]["name"], json!("signedHeading"));
        assert!(!semantics
            .targets
            .iter()
            .any(|target| target.kind == "message" || target.kind == "sound resource"));
    }

    #[test]
    fn signed_edcd_fields_keep_opcode_specific_branch_shapes() {
        let ability_pick = edcd_shape(30).expect("ability check shape");
        assert_eq!(ability_pick.fields[0], "signedAbilityOrAttribute");

        let random_items = edcd_shape(65).expect("random item shape");
        assert_eq!(random_items.fields[0], "countOrRandomLimit");

        let spell_points = edcd_shape(74).expect("spell point shape");
        assert_eq!(spell_points.fields[0], "signedRollCount");
        assert_eq!(spell_points.fields[1], "lowOrSound");

        let teleport = edcd_shape(20).expect("teleport shape");
        assert_eq!(teleport.fields[0], "levelOrKeep");
        assert_eq!(teleport.fields[1], "xOrKeep");

        let gold = edcd_shape(33).expect("gold shape");
        assert_eq!(gold.fields[0], "signedAmount");

        let timed = edcd_shape(54).expect("timed encounter shape");
        assert_eq!(timed.fields[1], "percentOrKeep");
        assert_eq!(timed.fields[4], "dayOffsetOrKeep");

        let clock = edcd_shape(63).expect("time mutation shape");
        assert_eq!(clock.fields[1], "dayOrDelta");

        let spawn = edcd_shape(124).expect("spawn shape");
        assert_eq!(spawn.fields[2], "countOrRandomLimit");

        let misc_branch = edcd_shape(86).expect("misc branch shape");
        assert_eq!(misc_branch.name, "misc-conditional-branch");
        assert_eq!(misc_branch.fields[1], "signedTestValue");
        assert_eq!(misc_branch.fields[2], "branchMode");

        let ally_branch = edcd_shape(87).expect("ally branch shape");
        assert_eq!(ally_branch.name, "conditional-branch");
        assert_eq!(ally_branch.fields[1], "branchModeOrValue");
        assert_eq!(ally_branch.fields[2], "falseBehavior");
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

    #[test]
    fn source_backed_edcd_shape_corrections_match_dispatcher() {
        let source_backed_edcd_opcodes = [
            -23, 2, 3, 7, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 30, 31, 33, 37, 38, 40, 41,
            42, 43, 45, 46, 48, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 63, 64, 65, 67, 68,
            69, 70, 72, 73, 74, 75, 76, 77, 78, 81, 85, 86, 87, 90, 92, 103, 106, 107, 108, 120,
            121, 122, 123, 124, 125, 126,
        ];
        for code in source_backed_edcd_opcodes {
            let spec = opcode_spec(code);
            assert!(
                spec.known,
                "opcode {code} should be a known dispatcher case"
            );
            assert!(
                spec.consumes_edcd,
                "opcode {code} should load Data EDCD according to the newland.c source audit"
            );
            assert!(
                edcd_shape(code).is_some(),
                "opcode {code} should have an EDCD shape"
            );
        }

        for direct_code in [8, 39] {
            let spec = opcode_spec(direct_code);
            assert!(spec.known);
            assert!(
                !spec.consumes_edcd,
                "opcode {direct_code} is a direct non-EDCD dispatcher case"
            );
        }

        let corrected_shapes = [
            (7, "action-data-patching"),
            (13, "trigger-mutation"),
            (19, "random-message"),
            (40, "party-condition-branch"),
            (51, "shop-mutation"),
            (50, "race-caste-gender-selector"),
            (52, "character-selector"),
            (55, "picked-branch"),
            (64, "game-time-branch"),
            (86, "misc-conditional-branch"),
            (106, "dark-level-state"),
        ];
        for (code, shape) in corrected_shapes {
            let spec = opcode_spec(code);
            assert!(spec.consumes_edcd, "opcode {code} should load Data EDCD");
            assert_eq!(edcd_shape(code).expect("shape").name, shape);
        }

        let action = dummy_action(39, 12);
        let semantics = action_semantics(
            &action,
            &dummy_trigger(),
            &BTreeMap::new(),
            ReferenceCounts::default(),
        );
        assert!(semantics.edcd_usage.is_none());
        assert!(semantics
            .targets
            .iter()
            .any(|target| target.id == "macro:12" && target.role == "calls_macro"));
    }

    #[test]
    fn nonzero_codes_without_dispatch_cases_are_noops() {
        let action = dummy_action(200, 0);
        let semantics = action_semantics(
            &action,
            &dummy_trigger(),
            &BTreeMap::new(),
            ReferenceCounts::default(),
        );
        let diagnostic = semantics
            .diagnostics
            .iter()
            .find(|diagnostic| diagnostic.diagnostic_type == "dispatcher-noop")
            .expect("unsupported dispatcher codes should be classified as no-ops");
        assert_eq!(diagnostic.severity, DiagnosticSeverity::Info);
        assert!(!has_newland_dispatcher_case(200));
        assert!(has_newland_dispatcher_case(1));
    }
}
