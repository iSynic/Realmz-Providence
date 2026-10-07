use super::contracts::{ReachabilityActionSite, ReachabilityAuthoringSite};
use providence_core::{
    codecs::EXTRA_CODE_RECORD_BYTES,
    model::StableId,
    rebuilt::RebuiltV3ReachabilityTarget,
    references::{ByteProvenance, RepairAction},
};
use serde_json::json;
pub(super) fn reachability_inline_branch_layout(
    opcode: i16,
) -> Option<(&'static str, u8, u8, &'static str)> {
    match opcode {
        3 => Some(("values[1..=2]", 1, 2, "choice")),
        38 | 42 | 46 | 58 | 59 => Some(("values[2..=3]", 2, 3, "force")),
        _ => None,
    }
}

pub(super) fn reachability_extra_code_field(field: &str) -> Option<(String, Option<(u8, u8)>)> {
    if field.ends_with(".battleRange") {
        return Some(("values[0..=1]".into(), Some((0, 1))));
    }
    let inside = field.split(".extraCode[").nth(1)?.strip_suffix(']')?;
    if let Some((start, end)) = inside.split_once("..=") {
        let start = start.parse().ok()?;
        let end = end.parse().ok()?;
        Some((format!("values[{start}..={end}]"), Some((start, end))))
    } else {
        let index = inside.parse().ok()?;
        Some((format!("values[{index}]"), Some((index, index))))
    }
}

pub(super) fn inline_branch_site(
    action: &ReachabilityActionSite,
    target: &RebuiltV3ReachabilityTarget,
) -> Option<ReachabilityAuthoringSite> {
    let extra_code_id = action.extra_code_id?;
    let source = StableId(format!("extra-code:{extra_code_id}"));
    if matches!(
        target,
        RebuiltV3ReachabilityTarget::Invalid(value)
            if value.starts_with("inline encounter result mode ")
    ) && let Some((field, start, end, layout)) = reachability_inline_branch_layout(action.opcode)
    {
        return Some(ReachabilityAuthoringSite {
            source: source.clone(),
            field: field.into(),
            byte_provenance: Some(ByteProvenance {
                native_path: "Data EDCD".into(),
                record_index: extra_code_id,
                byte_start: extra_code_id * EXTRA_CODE_RECORD_BYTES as u32 + u32::from(start) * 2,
                byte_end: extra_code_id * EXTRA_CODE_RECORD_BYTES as u32 + (u32::from(end) + 1) * 2,
            }),
            repair_actions: vec![RepairAction::Retarget],
            repair: Some(json!({
                "method": "extra-code-branch.retarget",
                "params": {"source": source, "layout": layout},
                "targetParameters": ["mode", "targetId"],
            })),
        });
    }

    None
}

pub(super) fn extra_code_site(
    action: &ReachabilityActionSite,
    field_path: &str,
    target: &RebuiltV3ReachabilityTarget,
) -> Option<ReachabilityAuthoringSite> {
    let extra_code_id = action.extra_code_id?;
    let source = StableId(format!("extra-code:{extra_code_id}"));
    let (field, range) =
        reachability_extra_code_field(field_path).unwrap_or_else(|| ("values".into(), None));
    let byte_provenance = range.map(|(start, end)| ByteProvenance {
        native_path: "Data EDCD".into(),
        record_index: extra_code_id,
        byte_start: extra_code_id * EXTRA_CODE_RECORD_BYTES as u32 + u32::from(start) * 2,
        byte_end: extra_code_id * EXTRA_CODE_RECORD_BYTES as u32 + (u32::from(end) + 1) * 2,
    });
    let repair = range.and_then(|(start, end)| {
        if start == end {
            Some(json!({
                "method": "extra-code-value.retarget",
                "params": {"source": source, "index": start},
                "targetParameter": "targetId",
            }))
        } else if (start, end) == (0, 1) && field_path.ends_with(".battleRange") {
            Some(json!({
                "method": "extra-code-battle-range.retarget",
                "params": {"source": source},
                "targetParameters": ["lowId", "highId"],
            }))
        } else {
            None
        }
    });
    Some(ReachabilityAuthoringSite {
        source,
        field,
        byte_provenance,
        repair_actions: if matches!(*target, RebuiltV3ReachabilityTarget::Invalid(_)) {
            vec![RepairAction::Retarget]
        } else {
            vec![RepairAction::Retarget, RepairAction::CreateTarget]
        },
        repair,
    })
}

pub(super) fn message_extra_code_site(
    action: &ReachabilityActionSite,
    field_path: &str,
) -> Option<ReachabilityAuthoringSite> {
    let extra_code_id = action.extra_code_id?;
    let (field, range) = reachability_extra_code_field(field_path)?;
    let source = StableId(format!("extra-code:{extra_code_id}"));
    let byte_provenance = range.map(|(start, end)| ByteProvenance {
        native_path: "Data EDCD".into(),
        record_index: extra_code_id,
        byte_start: extra_code_id * EXTRA_CODE_RECORD_BYTES as u32 + u32::from(start) * 2,
        byte_end: extra_code_id * EXTRA_CODE_RECORD_BYTES as u32 + (u32::from(end) + 1) * 2,
    });
    let repair = range.and_then(|(start, end)| {
        (start == end).then(|| {
            json!({
                "method": "extra-code-value.retarget",
                "params": {"source": source, "index": start},
                "targetParameter": "targetId",
            })
        })
    });
    Some(ReachabilityAuthoringSite {
        source,
        field,
        byte_provenance,
        repair_actions: vec![RepairAction::Retarget, RepairAction::CreateTarget],
        repair,
    })
}
