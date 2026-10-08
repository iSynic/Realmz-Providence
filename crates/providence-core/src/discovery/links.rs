use super::DiscoveryRecord;
use crate::{
    model::ProjectSnapshot,
    references::{ReferenceDescriptor, ResolutionState},
};
use serde::Serialize;
use std::collections::BTreeMap;

struct RecordLookup<'a> {
    identities: BTreeMap<&'a str, &'a DiscoveryRecord>,
    targets: BTreeMap<(&'a str, &'a str), Vec<&'a DiscoveryRecord>>,
    opcodes: BTreeMap<(&'a str, u8), i16>,
}

impl<'a> RecordLookup<'a> {
    fn new(records: &'a [DiscoveryRecord], snapshot: &'a ProjectSnapshot) -> Self {
        let mut lookup = Self {
            identities: BTreeMap::new(),
            targets: BTreeMap::new(),
            opcodes: BTreeMap::new(),
        };
        for row in records {
            lookup.identities.insert(&row.identity, row);
            lookup
                .targets
                .entry((&row.kind, &row.native_id))
                .or_default()
                .push(row);
        }
        for (owner, actions) in snapshot
            .world
            .action_points
            .iter()
            .map(|r| (&r.identity.0, &r.actions))
            .chain(
                snapshot
                    .extra_action_points
                    .iter()
                    .map(|r| (&r.identity.0, &r.actions)),
            )
            .chain(
                snapshot
                    .simple_encounters
                    .iter()
                    .map(|r| (&r.identity.0, &r.actions)),
            )
            .chain(
                snapshot
                    .complex_encounters
                    .iter()
                    .map(|r| (&r.identity.0, &r.actions)),
            )
        {
            for action in actions {
                lookup.opcodes.insert((owner, action.slot), action.opcode());
            }
        }
        lookup
    }

    fn record(&self, identity: &str) -> Option<&'a DiscoveryRecord> {
        self.identities.get(identity).copied()
    }

    fn target(&self, kind: &str, id: &str) -> Option<&'a DiscoveryRecord> {
        let kind = if matches!(kind, "monster-appearance" | "special-land-tile") {
            "icon"
        } else {
            kind
        };
        if let Some(row) = self.record(id).filter(|row| row.kind == kind) {
            return Some(row);
        }
        self.targets
            .get(&(kind, id))
            .into_iter()
            .flatten()
            .min_by_key(|row| row.scope != "scenario")
            .copied()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryLink {
    pub relationship: super::RelationshipKind,
    pub contextual: bool,
    pub occurrence: String,
    pub source: String,
    pub field: String,
    pub target_kind: String,
    pub target_id: String,
    pub target_identity: Option<String>,
    pub target_scope: Option<String>,
    pub source_label: String,
    pub target_label: String,
    pub meaning: String,
    pub resolution: ResolutionState,
    pub root_reason: Option<String>,
    pub activity: String,
    pub code_position: Option<i16>,
    pub caller_context: Option<String>,
}

pub(super) fn derive(
    s: &ProjectSnapshot,
    refs: &[ReferenceDescriptor],
    records: &[DiscoveryRecord],
) -> Vec<DiscoveryLink> {
    let lookup = RecordLookup::new(records, s);
    let mut links: Vec<_> = refs
        .iter()
        .filter(|r| !matches!(r.target_kind, crate::references::TargetKind::Monster))
        .map(|r| from_reference(s, r, &lookup))
        .collect();
    super::supplement::append(s, records, &mut links);
    super::execution::append(s, records, &mut links);
    super::quests::mark_ignored_links(s, &mut links);
    for r in crate::monster_uses::monster_uses(s) {
        let target = lookup.target("monster", &r.target_id.to_string());
        let source = lookup.record(&r.source.0);
        let source_label = source
            .map(|record| super::labels::source_label(record, &r.field))
            .unwrap_or_else(|| r.source.0.clone());
        links.push(DiscoveryLink {
            relationship: super::RelationshipKind::Reference,
            contextual: false,
            occurrence: format!("{}|{}|monster|{}", r.source.0, r.field, r.target_id),
            source: r.source.0.clone(),
            field: r.field,
            target_kind: "monster".into(),
            target_id: r.target_id.to_string(),
            target_identity: None, // A runtime-selected set is not a Normal-owned definition.
            target_scope: Some("scenario".into()),
            source_label,
            target_label: format!("Monster {} · runtime difficulty", r.target_id),
            meaning: r.context,
            resolution: if target.is_some() {
                ResolutionState::Resolved
            } else {
                ResolutionState::Missing
            },
            root_reason: source.and_then(|r| r.root_reason.clone()),
            activity: "authored".into(),
            code_position: None,
            caller_context: None,
        });
    }
    links.sort_by(|a, b| a.occurrence.cmp(&b.occurrence));
    links.dedup_by(|a, b| a.occurrence == b.occurrence);
    links
}

fn direct_ap_target<'a>(
    s: &ProjectSnapshot,
    r: &ReferenceDescriptor,
    lookup: &RecordLookup<'a>,
) -> Option<&'a DiscoveryRecord> {
    let caller = s
        .world
        .action_points
        .iter()
        .find(|ap| ap.identity == r.source)?;
    let target_id = r.target_id.parse::<i32>().ok()?;
    let target = s.world.action_points.iter().find(|ap| {
        ap.level_type == caller.level_type
            && ap.level_index == caller.level_index
            && i32::from(ap.record_index) == target_id
    })?;
    lookup.record(&target.identity.0)
}

fn from_reference(
    s: &ProjectSnapshot,
    r: &ReferenceDescriptor,
    lookup: &RecordLookup<'_>,
) -> DiscoveryLink {
    let kind = serde_json::to_value(&r.target_kind)
        .unwrap()
        .as_str()
        .unwrap()
        .to_owned();
    let map_relative = kind == "action-point"
        && r.field.0.ends_with(".target")
        && !r.target_id.starts_with("action-point:");
    let target = if map_relative {
        direct_ap_target(s, r, lookup)
    } else {
        lookup.target(&kind, &r.target_id)
    };
    let source = lookup.record(&r.source.0);
    let field = r.field.0.clone();
    DiscoveryLink {
        relationship: relationship(r, &kind, lookup),
        contextual: map_relative
            && lookup
                .record(&r.source.0)
                .is_none_or(|r| r.kind != "action-point"),
        occurrence: format!("{}|{}|{kind}|{}", r.source.0, field, r.target_id),
        source: r.source.0.clone(),
        field,
        target_kind: kind.clone(),
        target_id: target
            .map(|r| r.native_id.clone())
            .unwrap_or_else(|| r.target_id.clone()),
        target_identity: (r.resolution == ResolutionState::Resolved)
            .then(|| target.map(|r| r.identity.clone()))
            .flatten(),
        target_scope: if r.resolution == ResolutionState::StockFallback {
            Some("stock".into())
        } else {
            target.map(|r| r.scope.clone())
        },
        source_label: source
            .map(|record| super::labels::source_label(record, &r.field.0))
            .unwrap_or_else(|| r.source.0.clone()),
        target_label: target
            .filter(|r| !r.name.trim().is_empty())
            .map(|r| r.name.clone())
            .unwrap_or_else(|| format!("{} {}", kind.replace('-', " "), r.target_id)),
        meaning: meaning(&kind, &r.field.0).into(),
        code_position: None,
        caller_context: None,
        resolution: r.resolution.clone(),
        root_reason: root_reason(source, &r.field.0),
        activity: reference_activity(s, r, map_relative).into(),
    }
}

fn relationship(
    reference: &ReferenceDescriptor,
    kind: &str,
    lookup: &RecordLookup<'_>,
) -> super::RelationshipKind {
    if eligibility_link(&reference.field.0) {
        return super::RelationshipKind::Eligibility;
    }
    let opcode = reference
        .field
        .0
        .strip_prefix("actions[")
        .and_then(|v| v.split(']').next())
        .and_then(|v| v.parse::<u8>().ok())
        .and_then(|slot| lookup.opcodes.get(&(reference.source.0.as_str(), slot)))
        .copied();
    super::RelationshipKind::for_action(opcode, kind)
}

pub(super) fn eligibility_link(field: &str) -> bool {
    field.starts_with("eligibleRaceIds[") || field.starts_with("eligibleCasteIds[")
}

fn root_reason(source: Option<&DiscoveryRecord>, field: &str) -> Option<String> {
    if field.starts_with("scenarioApplication.hooks.") {
        Some(format!(
            "Global {} hook",
            field.rsplit('.').next().unwrap_or("")
        ))
    } else {
        source.and_then(|r| r.root_reason.clone())
    }
}

fn meaning(kind: &str, field: &str) -> &'static str {
    if eligibility_link(field) {
        return "Permits this combination";
    }
    match kind {
        "message" => "Displays a string",
        "extra-action-point" => "Calls a macro",
        "simple-encounter" | "complex-encounter" | "rogue-encounter" => "Uses an encounter",
        "battle" => "Uses a battle",
        "shop" => "Offers a shop",
        "quest-flag" => "Uses a quest",
        "item" => "Uses an item",
        "spell" => "Uses a spell",
        "map" => "Uses a map",
        _ => "References this field",
    }
}

fn reference_activity(
    s: &ProjectSnapshot,
    r: &ReferenceDescriptor,
    map_relative: bool,
) -> &'static str {
    if map_relative
        && !s
            .world
            .action_points
            .iter()
            .any(|ap| ap.identity == r.source)
    {
        "contextual: destination depends on the active map"
    } else {
        "authored"
    }
}
