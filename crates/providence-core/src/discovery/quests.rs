use crate::model::{ClassicAction, ProjectSnapshot};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestOccurrence {
    pub occurrence: String,
    pub source: String,
    pub source_label: String,
    pub field: String,
    pub quest_id: i16,
    pub checks: bool,
    pub changes: bool,
    pub effect: String,
    pub condition: String,
    pub branch: String,
}

pub(super) fn derive(
    s: &ProjectSnapshot,
    records: &[super::DiscoveryRecord],
) -> Vec<QuestOccurrence> {
    let mut out = Vec::new();
    for row in &s.world.action_points {
        actions(s, &row.identity.0, &row.actions, &mut out);
    }
    for row in &s.extra_action_points {
        actions(s, &row.identity.0, &row.actions, &mut out);
    }
    for row in &s.simple_encounters {
        if row.has_semantics() {
            actions(s, &row.identity.0, &row.actions, &mut out);
        }
    }
    for row in &s.complex_encounters {
        actions(s, &row.identity.0, &row.actions, &mut out);
    }
    for row in &s.timed_encounters {
        if row.required_quest >= 0 {
            out.push(QuestOccurrence {
                occurrence: format!("{}|requiredQuest", row.identity.0),
                source: row.identity.0.clone(),
                source_label: row.identity.0.clone(),
                field: "requiredQuest".into(),
                quest_id: row.required_quest,
                checks: true,
                changes: false,
                effect: String::new(),
                condition: "Required quest is enabled".into(),
                branch: "Timed event eligibility".into(),
            });
        }
    }
    for row in &mut out {
        if let Some(record) = records.iter().find(|r| r.identity == row.source) {
            row.source_label = super::labels::source_label(record, &row.field);
        }
    }
    out
}

fn actions(
    s: &ProjectSnapshot,
    source: &str,
    actions: &[ClassicAction],
    out: &mut Vec<QuestOccurrence>,
) {
    for a in actions {
        let opcode = a.opcode();
        if opcode == 47 && a.target_native_id != 0 {
            append_toggle(out, source, a);
            continue;
        }
        let Some(row) = s
            .extra_codes
            .iter()
            .find(|r| i64::from(r.native_id.0) == i64::from(a.target_native_id))
        else {
            continue;
        };
        let w = row.values;
        if opcode == 46 {
            append(
                out,
                source,
                a,
                w[0],
                matches!(w[1], 0 | 1),
                false,
                String::new(),
                condition(opcode, w),
                test_destinations(opcode, w),
            );
        } else if opcode == 76 {
            append_value_change(out, source, a, w);
        } else if opcode == 72 && (0..=127).contains(&w[0]) && (w[0]..=127).contains(&w[1]) {
            append_range(out, source, a, w);
        } else {
            for field in crate::action_authoring::settings_target_fields(
                opcode,
                w,
                crate::action_authoring::option_labels_present(s),
            ) {
                if field.kind == crate::action_authoring::ActionTargetKind::Quest {
                    append(
                        out,
                        source,
                        a,
                        field.value,
                        true,
                        false,
                        String::new(),
                        condition(opcode, w),
                        test_destinations(opcode, w),
                    );
                }
            }
        }
    }
}

fn append_range(out: &mut Vec<QuestOccurrence>, source: &str, a: &ClassicAction, w: [i16; 5]) {
    for id in w[0]..=w[1] {
        append(
            out,
            source,
            a,
            id,
            true,
            false,
            String::new(),
            format!("All quests {}–{} must be set (nonzero)", w[0], w[1]),
            branch(w[3], w[4], false),
        );
        if id == w[1] {
            out.last_mut().unwrap().field = format!("actions[{}].settings.testB", a.slot);
        }
    }
}

fn append_toggle(out: &mut Vec<QuestOccurrence>, source: &str, a: &ClassicAction) {
    append(
        out,
        source,
        a,
        a.target_native_id.saturating_abs(),
        false,
        true,
        if a.target_native_id < 0 {
            "Clear"
        } else {
            "Set"
        }
        .into(),
        String::new(),
        String::new(),
    );
}

fn append_value_change(
    out: &mut Vec<QuestOccurrence>,
    source: &str,
    a: &ClassicAction,
    w: [i16; 5],
) {
    append(
        out,
        source,
        a,
        w[0],
        w[3] != 0,
        w[0] < 100,
        if w[0] < 100 {
            format!("Add {:+}; clamp −127…127", w[1])
        } else {
            "Change ignored: this instruction changes only quest IDs below 100".into()
        },
        if w[3] != 0 {
            format!("Resulting quest value ≥ {}", w[3])
        } else {
            "Auto branch disabled".into()
        },
        if w[3] != 0 {
            branch(w[2].saturating_sub(1), w[4], false)
        } else {
            String::new()
        },
    );
}

#[allow(clippy::too_many_arguments)]
fn append(
    out: &mut Vec<QuestOccurrence>,
    source: &str,
    a: &ClassicAction,
    quest_id: i16,
    checks: bool,
    changes: bool,
    effect: String,
    condition: String,
    branch: String,
) {
    out.push(QuestOccurrence {
        occurrence: format!("{source}|actions[{}]", a.slot),
        source: source.into(),
        source_label: source.into(),
        field: format!(
            "actions[{}].{}",
            a.slot,
            if a.opcode() == 47 {
                "target"
            } else if matches!(a.opcode(), 46 | 72 | 77) {
                "settings.testA"
            } else {
                "settings.quest"
            }
        ),
        quest_id,
        checks,
        changes,
        effect,
        condition,
        branch,
    });
}

fn branch(mode: i16, id: i16, local_result: bool) -> String {
    match mode {
        0 => format!("XAP {id}"),
        1 if local_result => format!("Simple Encounter result {id} in current context"),
        2 if local_result => format!("Complex Encounter result {id} in current context"),
        1 => format!("Simple Encounter {id}"),
        2 => format!("Complex Encounter {id}"),
        _ => format!("Uncertain imported branch mode {mode}; destination {id}"),
    }
}

// Castle 491816ad newland.c:164-197, 2880-2930 supplies the effective tests.
fn condition(opcode: i16, w: [i16; 5]) -> String {
    match opcode {
        46 => match w[1] {
            0 => "Quest is not set (zero)".into(),
            1 => "Quest is set (nonzero)".into(),
            2 => "Always branch; quest value does not control this instruction".into(),
            value => format!("Retained unsupported quest test {value}"),
        },
        77 => format!("Quest value ≥ {}", w[1]),
        _ => "Uses this quest value".into(),
    }
}

fn test_destinations(opcode: i16, w: [i16; 5]) -> String {
    match opcode {
        46 => match w[2] {
            -1 => "Continue at final step".into(),
            3 => "Exit script and keep codes".into(),
            mode => format!("{} · code position {}", branch(mode, w[3], true), w[4]),
        },
        77 => format!(
            "False: {}; True: {}",
            optional_branch(w[2], w[3]),
            optional_branch(w[2], w[4])
        ),
        _ => String::new(),
    }
}

fn optional_branch(mode: i16, id: i16) -> String {
    if id == 0 {
        "Continue current script".into()
    } else {
        branch(mode, id, false)
    }
}

pub(super) fn mark_ignored_links(s: &ProjectSnapshot, links: &mut [super::DiscoveryLink]) {
    for link in links
        .iter_mut()
        .filter(|link| link.target_kind == "quest-flag")
    {
        let actions = s
            .world
            .action_points
            .iter()
            .find(|r| r.identity.0 == link.source)
            .map(|r| &r.actions)
            .or_else(|| {
                s.extra_action_points
                    .iter()
                    .find(|r| r.identity.0 == link.source)
                    .map(|r| &r.actions)
            })
            .or_else(|| {
                s.simple_encounters
                    .iter()
                    .find(|r| r.identity.0 == link.source)
                    .map(|r| &r.actions)
            })
            .or_else(|| {
                s.complex_encounters
                    .iter()
                    .find(|r| r.identity.0 == link.source)
                    .map(|r| &r.actions)
            });
        let slot = link
            .field
            .split_once("actions[")
            .and_then(|(_, tail)| tail.split(']').next())
            .and_then(|id| id.parse::<u8>().ok());
        let action = actions.and_then(|rows| {
            rows.iter()
                .find(|a| Some(a.slot) == slot && a.opcode() == 46)
        });
        let row = action.and_then(|a| {
            s.extra_codes
                .iter()
                .find(|r| i64::from(r.native_id.0) == i64::from(a.target_native_id))
        });
        if let Some(row) = row.filter(|r| !matches!(r.values[1], 0 | 1)) {
            link.activity = if row.values[1] == 2 {
                "ignored: unconditional branch"
            } else {
                "uncertain: unsupported imported test"
            }
            .into();
            link.meaning = "Retains a quest operand without an effective check".into();
        }
    }
}
