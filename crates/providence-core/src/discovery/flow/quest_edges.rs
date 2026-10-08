use super::*;
use crate::discovery::{DiscoveryIndex, QuestOccurrence};

pub(super) fn covered(index: &DiscoveryIndex, link: &DiscoveryLink) -> bool {
    let slot = action_slot(&link.field);
    index.quests.iter().any(|q| {
        q.source == link.source
            && q.quest_id.to_string() == link.target_id
            && (q.field == link.field || (slot.is_some() && action_slot(&q.field) == slot))
    })
}

fn action_slot(field: &str) -> Option<&str> {
    field
        .strip_prefix("actions[")
        .and_then(|s| s.split(']').next())
}

pub(super) fn append(index: &DiscoveryIndex, graph: &mut FlowGraph) {
    for quest in &index.quests {
        let link = reference(quest, index);
        let Some(owner) = crate::discovery::execution::caller_owner(index, &link) else {
            continue;
        };
        let source = (owner.scope.clone(), owner.identity.clone());
        let target = ("scenario".into(), format!("quest:{}", quest.quest_id));
        let target = if graph.records.contains_key(&target) {
            target
        } else {
            graph.unresolved(&link, String::new())
        };
        for (enabled, relationship) in [
            (quest.checks, RelationshipKind::StateCheck),
            (quest.changes, RelationshipKind::StateChange),
            (!quest.checks && !quest.changes, RelationshipKind::Reference),
        ] {
            if !enabled {
                continue;
            }
            let mut link = link.clone();
            link.relationship = relationship;
            link.occurrence = format!(
                "{}|{}|{}|{:?}",
                quest.occurrence, quest.field, quest.quest_id, relationship
            );
            let (from, to) = if relationship == RelationshipKind::StateCheck {
                (target.clone(), source.clone())
            } else {
                (source.clone(), target.clone())
            };
            graph.connect(
                from,
                to,
                link,
                FlowDetails {
                    condition: graph::bounded(&quest.condition, 360),
                    effect: graph::bounded(&quest.effect, 360),
                    branch: graph::bounded(&quest.branch, 360),
                },
            );
        }
    }
}

fn reference(quest: &QuestOccurrence, index: &DiscoveryIndex) -> DiscoveryLink {
    let target = index.record(&format!("quest:{}", quest.quest_id));
    DiscoveryLink {
        relationship: RelationshipKind::Reference,
        contextual: false,
        occurrence: quest.occurrence.clone(),
        source: quest.source.clone(),
        field: quest.field.clone(),
        target_kind: "quest-flag".into(),
        target_id: quest.quest_id.to_string(),
        target_identity: target.map(|r| r.identity.clone()),
        target_scope: Some("scenario".into()),
        source_label: quest.source_label.clone(),
        target_label: target
            .map(|r| r.name.clone())
            .unwrap_or_else(|| format!("Quest {}", quest.quest_id)),
        meaning: if quest.checks && quest.changes {
            "Checks and changes a quest"
        } else if quest.checks {
            "Checks a quest"
        } else if quest.changes {
            "Changes a quest"
        } else {
            "Retains a quest operand without an effective check or change"
        }
        .into(),
        resolution: if target.is_some() {
            ResolutionState::Resolved
        } else {
            ResolutionState::Missing
        },
        root_reason: None,
        activity: "Authored state relationship; does not imply execution order".into(),
        code_position: None,
        caller_context: None,
    }
}
