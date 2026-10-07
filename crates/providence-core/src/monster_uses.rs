//! Authoring uses retain runtime context rather than pretending every caller owns Normal.
use crate::action_authoring::{ActionTargetKind, direct_target_kind, settings_target_fields};
use crate::model::{ClassicAction, ProjectSnapshot, StableId};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterUse {
    pub source: StableId,
    pub field: String,
    pub target_id: u32,
    pub raw_value: i16,
    pub context: String,
    pub can_retarget: bool,
    pub slot: Option<u8>,
}

pub fn monster_uses(snapshot: &ProjectSnapshot) -> Vec<MonsterUse> {
    let mut uses = Vec::new();
    for battle in &snapshot.battles {
        for (index, raw) in battle.grid.iter().copied().enumerate() {
            if raw == 0 || raw == i16::MIN {
                continue;
            }
            uses.push(MonsterUse {
                source: battle.identity.clone(),
                field: format!("grid[{index}].monster"),
                target_id: raw.unsigned_abs() as u32,
                raw_value: raw,
                context: "Battle placement · difficulty selected at runtime".into(),
                can_retarget: true,
                slot: None,
            });
        }
    }
    for row in &snapshot.world.action_points {
        append_actions(snapshot, &row.identity, &row.actions, &mut uses);
    }
    for row in &snapshot.extra_action_points {
        append_actions(snapshot, &row.identity, &row.actions, &mut uses);
    }
    for row in snapshot
        .simple_encounters
        .iter()
        .filter(|row| row.has_semantics())
    {
        append_actions(snapshot, &row.identity, &row.actions, &mut uses);
    }
    for row in &snapshot.complex_encounters {
        append_actions(snapshot, &row.identity, &row.actions, &mut uses);
    }
    uses
}

fn append_actions(
    snapshot: &ProjectSnapshot,
    source: &StableId,
    actions: &[ClassicAction],
    uses: &mut Vec<MonsterUse>,
) {
    for action in actions {
        if direct_target_kind(action.opcode()) == Some(ActionTargetKind::Monster) {
            append(
                uses,
                source,
                action,
                format!("actions[{}].target", action.slot),
                action.target_native_id,
                "Ally creation · difficulty selected at runtime",
                true,
            );
        }
        let Some(row) = u32::try_from(action.target_native_id).ok().and_then(|id| {
            snapshot
                .extra_codes
                .iter()
                .find(|row| row.native_id.0 == id)
        }) else {
            continue;
        };
        for field in settings_target_fields(
            action.opcode(),
            row.values,
            crate::action_authoring::option_labels_present(snapshot),
        ) {
            if field.kind != ActionTargetKind::Monster {
                continue;
            }
            append(
                uses,
                source,
                action,
                format!("actions[{}].settings.{}", action.slot, field.key),
                field.value,
                "Script settings · caller determines runtime difficulty; repair shared settings in the owning step",
                false,
            );
        }
    }
}

fn append(
    uses: &mut Vec<MonsterUse>,
    source: &StableId,
    action: &ClassicAction,
    field: String,
    raw: i16,
    context: &str,
    can_retarget: bool,
) {
    if raw < 0 {
        return;
    }
    uses.push(MonsterUse {
        source: source.clone(),
        field,
        target_id: raw as u32,
        raw_value: raw,
        context: context.into(),
        can_retarget,
        slot: Some(action.slot),
    });
}
