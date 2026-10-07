use super::{contracts::ReachabilityActionSite, navigation::reachability_result_program};
use providence_core::{
    codecs::{
        ACTION_POINT_LEVEL_BYTES, ACTION_POINT_RECORD_BYTES, COMPLEX_ENCOUNTER_RECORD_BYTES,
        EXTRA_ACTION_POINT_RECORD_BYTES, SIMPLE_ENCOUNTER_RECORD_BYTES,
    },
    model::{ActionPoint, ClassicAction, LevelType, ProjectSnapshot, StableId},
    rebuilt::rebuilt_v3_action_point_owner,
    references::ByteProvenance,
};

struct ActionFields {
    target: i16,
    opcode: i16,
    target_bytes: ByteProvenance,
    opcode_bytes: ByteProvenance,
}
#[derive(Clone, Copy)]
struct ActionRecordLayout {
    native_path: &'static str,
    record_bytes: usize,
    target_offset: usize,
    opcode_offset: usize,
    opcode_width: usize,
}
const EXTRA_ACTION_LAYOUT: ActionRecordLayout = ActionRecordLayout {
    native_path: "Data ED3",
    record_bytes: EXTRA_ACTION_POINT_RECORD_BYTES,
    target_offset: 24,
    opcode_offset: 8,
    opcode_width: 2,
};
const SIMPLE_LAYOUT: ActionRecordLayout = ActionRecordLayout {
    native_path: "Data ED",
    record_bytes: SIMPLE_ENCOUNTER_RECORD_BYTES,
    target_offset: 32,
    opcode_offset: 0,
    opcode_width: 1,
};
const COMPLEX_LAYOUT: ActionRecordLayout = ActionRecordLayout {
    native_path: "Data ED2",
    record_bytes: COMPLEX_ENCOUNTER_RECORD_BYTES,
    target_offset: 32,
    opcode_offset: 0,
    opcode_width: 1,
};

pub(super) fn reachability_action_site(
    snapshot: &ProjectSnapshot,
    runtime_source: &StableId,
    local_slot: u8,
) -> Option<ReachabilityActionSite> {
    let (source, slot) = runtime_action_source(snapshot, runtime_source, local_slot)?;
    let placed = runtime_source
        .0
        .starts_with("trigger:")
        .then(|| rebuilt_v3_action_point_owner(snapshot, runtime_source))
        .flatten();
    let source = placed.map(|owner| owner.identity.clone()).unwrap_or(source);
    let fields = if let Some(owner) = snapshot
        .world
        .action_points
        .iter()
        .find(|owner| owner.identity == source)
        .or(placed)
    {
        action_point_fields(owner, slot)?
    } else if let Some(owner) = snapshot
        .extra_action_points
        .iter()
        .find(|owner| owner.identity == source)
    {
        record_action_fields(&owner.actions, slot, owner.native_id.0, EXTRA_ACTION_LAYOUT)?
    } else if let Some(owner) = snapshot
        .simple_encounters
        .iter()
        .find(|owner| owner.identity == source)
    {
        record_action_fields(&owner.actions, slot, owner.native_id.0, SIMPLE_LAYOUT)?
    } else {
        let owner = snapshot
            .complex_encounters
            .iter()
            .find(|owner| owner.identity == source)?;
        record_action_fields(&owner.actions, slot, owner.native_id.0, COMPLEX_LAYOUT)?
    };
    Some(ReachabilityActionSite {
        source,
        slot,
        opcode: fields.opcode,
        extra_code_id: u32::try_from(fields.target).ok(),
        byte_provenance: fields.target_bytes,
        opcode_byte_provenance: fields.opcode_bytes,
    })
}

fn runtime_action_source(
    snapshot: &ProjectSnapshot,
    runtime_source: &StableId,
    local_slot: u8,
) -> Option<(StableId, u8)> {
    let (source, slot) = if runtime_source.0.starts_with("trigger:") {
        let owner = rebuilt_v3_action_point_owner(snapshot, runtime_source)?;
        (owner.identity.clone(), local_slot)
    } else if let Some(id) = runtime_source.0.strip_prefix("xap:") {
        (StableId(format!("extra-action-point:{id}")), local_slot)
    } else if let Some((id, result)) = reachability_result_program(&runtime_source.0, "simple:") {
        (
            StableId(format!("simple-encounter:{id}")),
            result * 8 + local_slot,
        )
    } else if let Some((id, result)) = reachability_result_program(&runtime_source.0, "complex:") {
        (
            StableId(format!("complex-encounter:{id}")),
            result * 8 + local_slot,
        )
    } else {
        return None;
    };
    Some((source, slot))
}

fn action_point_fields(owner: &ActionPoint, slot: u8) -> Option<ActionFields> {
    let action = owner.actions.iter().find(|action| action.slot == slot)?;
    let base = owner.level_index as usize * ACTION_POINT_LEVEL_BYTES
        + owner.record_index as usize * ACTION_POINT_RECORD_BYTES;
    let target_start = base + 24 + slot as usize * 2;
    let opcode_start = base + 8 + slot as usize * 2;
    let path = match owner.level_type {
        LevelType::Land => "Data DD",
        LevelType::Dungeon => "Data DDD",
    };
    let record_index = owner.level_index * 100 + u32::from(owner.record_index);
    Some(ActionFields {
        target: action.target_native_id,
        opcode: action.opcode(),
        target_bytes: ByteProvenance {
            native_path: path.into(),
            record_index,
            byte_start: target_start as u32,
            byte_end: target_start as u32 + 2,
        },
        opcode_bytes: ByteProvenance {
            native_path: path.into(),
            record_index,
            byte_start: opcode_start as u32,
            byte_end: opcode_start as u32 + 2,
        },
    })
}

fn record_action_fields(
    actions: &[ClassicAction],
    slot: u8,
    record_index: u32,
    layout: ActionRecordLayout,
) -> Option<ActionFields> {
    let action = actions.iter().find(|action| action.slot == slot)?;
    let base = record_index as usize * layout.record_bytes;
    let target_start = base + layout.target_offset + slot as usize * 2;
    let opcode_start = base + layout.opcode_offset + slot as usize * layout.opcode_width;
    Some(ActionFields {
        target: action.target_native_id,
        opcode: action.opcode(),
        target_bytes: ByteProvenance {
            native_path: layout.native_path.into(),
            record_index,
            byte_start: target_start as u32,
            byte_end: target_start as u32 + 2,
        },
        opcode_bytes: ByteProvenance {
            native_path: layout.native_path.into(),
            record_index,
            byte_start: opcode_start as u32,
            byte_end: (opcode_start + layout.opcode_width) as u32,
        },
    })
}
