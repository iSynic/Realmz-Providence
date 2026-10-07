//! Reuse the audited active-word inventory for every shared-row consumer.
use super::{DiscoveryLink, DiscoveryRecord};
use crate::{
    action_authoring::{ActionTargetContext, ActionTargetKind, SettingsTargetField},
    model::{ClassicAction, ProjectSnapshot, StableId},
    references::ResolutionState,
};
use std::collections::{BTreeMap, BTreeSet};

pub(super) struct Resolver {
    seen: BTreeSet<(String, String, String)>,
    previews: BTreeMap<(String, i16, String), Option<crate::action_authoring::ActionTarget>>,
}

impl Resolver {
    pub(super) fn new(links: &[DiscoveryLink]) -> Self {
        Self {
            seen: links
                .iter()
                .map(|r| (r.source.clone(), r.field.clone(), r.target_kind.clone()))
                .collect(),
            previews: BTreeMap::new(),
        }
    }

    fn preview(
        &mut self,
        s: &ProjectSnapshot,
        field: &SettingsTargetField,
        context: &ActionTargetContext,
        kind: &str,
    ) -> Option<crate::action_authoring::ActionTarget> {
        let address = if matches!(
            field.kind,
            ActionTargetKind::Map
                | ActionTargetKind::MapTile
                | ActionTargetKind::SameMapActionPoint
                | ActionTargetKind::RandomRectangle
        ) {
            format!("{:?}", context)
        } else {
            String::new()
        };
        self.previews
            .entry((kind.into(), field.value, address))
            .or_insert_with(|| {
                crate::action_authoring::target_preview(s, field.kind, field.value, context)
            })
            .clone()
    }
}

pub(super) fn append(
    s: &ProjectSnapshot,
    source: &str,
    action: &ClassicAction,
    field: SettingsTargetField,
    records: &[DiscoveryRecord],
    links: &mut Vec<DiscoveryLink>,
    resolver: &mut Resolver,
) {
    // Monster callers have their own runtime difficulty contract; quests include ranges.
    if matches!(
        field.kind,
        ActionTargetKind::Monster | ActionTargetKind::Quest
    ) {
        return;
    }
    let kind = match field.kind {
        ActionTargetKind::SameMapActionPoint => "action-point".into(),
        _ => serde_json::to_value(field.kind)
            .unwrap()
            .as_str()
            .unwrap()
            .to_owned(),
    };
    let path = format!("actions[{}].settings.{}", action.slot, field.key);
    if !resolver
        .seen
        .insert((source.into(), path.clone(), kind.clone()))
    {
        return;
    }
    let words = s
        .extra_codes
        .iter()
        .find(|row| i64::from(row.native_id.0) == i64::from(action.target_native_id))
        .map(|row| row.values)
        .unwrap_or_default();
    let context = crate::action_authoring::settings_context(
        s,
        action.opcode(),
        words,
        &source_context(s, source),
        Some(field.kind),
    );
    let preview = resolver.preview(s, &field, &context, &kind);
    links.push(describe_link(
        s, source, action, &field, records, &kind, &path, &context, preview,
    ));
}

#[allow(clippy::too_many_arguments)]
fn describe_link(
    s: &ProjectSnapshot,
    source: &str,
    action: &ClassicAction,
    field: &SettingsTargetField,
    records: &[DiscoveryRecord],
    kind: &str,
    path: &str,
    context: &ActionTargetContext,
    preview: Option<crate::action_authoring::ActionTarget>,
) -> DiscoveryLink {
    let target = preview
        .as_ref()
        .and_then(|p| records.iter().find(|r| r.identity == p.identity.0));
    let owner = records.iter().find(|r| r.identity == source);
    let (identity, scope, resolution) = resolve(s, field, preview.as_ref(), target);
    let id = target
        .map(|r| r.native_id.clone())
        .unwrap_or_else(|| lookup_id(field.kind, field.value).to_string());
    DiscoveryLink {
        occurrence: format!("{source}|{path}|{kind}|{id}"),
        source: source.into(),
        field: path.into(),
        target_kind: kind.into(),
        target_id: id,
        target_identity: identity,
        target_scope: scope,
        source_label: owner
            .map(|r| super::labels::source_label(r, &format!("actions[{}]", action.slot)))
            .unwrap_or_else(|| source.into()),
        target_label: preview
            .as_ref()
            .map(|p| p.label.clone())
            .unwrap_or_else(|| format!("{} {}", kind.replace('-', " "), field.value)),
        meaning: if field.kind == ActionTargetKind::TimedEncounter {
            "Changes a Timed Encounter schedule".into()
        } else {
            format!("Uses {}", kind.replace('-', " "))
        },
        resolution,
        root_reason: owner.and_then(|r| r.root_reason.clone()),
        code_position: None,
        caller_context: None,
        activity: if field.kind == ActionTargetKind::SameMapActionPoint
            && context.map_identity.is_none()
        {
            "contextual: destination depends on the active map"
        } else {
            "authored"
        }
        .into(),
    }
}

fn source_context(s: &ProjectSnapshot, source: &str) -> ActionTargetContext {
    s.world
        .action_points
        .iter()
        .find(|ap| ap.identity.0 == source)
        .map(|ap| ActionTargetContext {
            map_identity: Some(StableId(format!(
                "{}:{}",
                if ap.level_type == crate::model::LevelType::Land {
                    "land"
                } else {
                    "dungeon"
                },
                ap.level_index
            ))),
            level_type: Some(ap.level_type),
        })
        .unwrap_or_default()
}

fn lookup_id(kind: ActionTargetKind, value: i16) -> i32 {
    let value = i32::from(value);
    if matches!(
        kind,
        ActionTargetKind::Message
            | ActionTargetKind::OptionLabel
            | ActionTargetKind::PlayerMap
            | ActionTargetKind::Battle
            | ActionTargetKind::Shop
            | ActionTargetKind::Sound
            | ActionTargetKind::Quest
    ) {
        value.abs()
    } else {
        value
    }
}

fn resolve(
    s: &ProjectSnapshot,
    field: &SettingsTargetField,
    preview: Option<&crate::action_authoring::ActionTarget>,
    target: Option<&DiscoveryRecord>,
) -> (Option<String>, Option<String>, ResolutionState) {
    use crate::resource_resolution::{ScenarioResourceResolution, scenario_resource};
    let media = match field.kind {
        ActionTargetKind::Sound => Some(("snd ", "sound")),
        ActionTargetKind::Picture => Some(("PICT", "picture")),
        ActionTargetKind::TextResource => Some(("TEXT", "text-resource")),
        ActionTargetKind::MonsterAppearance => Some(("cicn", "icon")),
        _ => None,
    };
    if let Some((resource_type, kind)) = media {
        let key = crate::model::ClassicResourceKey {
            resource_type: resource_type.into(),
            resource_id: lookup_id(field.kind, field.value),
        };
        return match scenario_resource(s, &key, kind) {
            ScenarioResourceResolution::Resolved(asset) => (
                Some(asset.identity.0.clone()),
                Some("scenario".into()),
                ResolutionState::Resolved,
            ),
            ScenarioResourceResolution::Missing => {
                (None, Some("stock".into()), ResolutionState::StockFallback)
            }
            ScenarioResourceResolution::Ambiguous => {
                (None, Some("scenario".into()), ResolutionState::Ambiguous)
            }
            ScenarioResourceResolution::WrongKind => {
                (None, Some("scenario".into()), ResolutionState::Missing)
            }
        };
    }
    (
        preview.map(|p| p.identity.0.clone()),
        target.map(|r| r.scope.clone()),
        if preview.is_some() {
            ResolutionState::Resolved
        } else {
            ResolutionState::Missing
        },
    )
}
