//! Authoring-only relationships omitted by runtime eligibility projections.
use super::{DiscoveryLink, DiscoveryRecord};
use crate::{
    model::{ClassicAction, ProjectSnapshot},
    references::ResolutionState,
};

pub(super) fn append(
    s: &ProjectSnapshot,
    records: &[DiscoveryRecord],
    links: &mut Vec<DiscoveryLink>,
) {
    let mut resolver = super::settings_links::Resolver::new(links);
    for (source, steps) in s
        .world
        .action_points
        .iter()
        .map(|r| (&r.identity.0, &r.actions))
        .chain(
            s.extra_action_points
                .iter()
                .map(|r| (&r.identity.0, &r.actions)),
        )
        .chain(
            s.simple_encounters
                .iter()
                .filter(|r| r.has_semantics())
                .map(|r| (&r.identity.0, &r.actions)),
        )
        .chain(
            s.complex_encounters
                .iter()
                .map(|r| (&r.identity.0, &r.actions)),
        )
    {
        actions(s, source, steps, records, links, &mut resolver);
    }
    for timed in &s.timed_encounters {
        if timed.day == 0 {
            add(
                records,
                links,
                &timed.identity.0,
                "door",
                "extra-action-point",
                timed.door,
                "Timed macro retained while day is zero",
                "inactive: day zero",
            );
        }
    }
    append_regions(s, records, links);
}

fn append_regions(
    s: &ProjectSnapshot,
    records: &[DiscoveryRecord],
    links: &mut Vec<DiscoveryLink>,
) {
    for map in &s.world.maps {
        let Some(runtime) = &map.runtime else {
            continue;
        };
        for region in &runtime.random_rectangles {
            for slot in 0..3 {
                if region.random_door_percent[slot] == 0 && region.random_doors[slot] != 0 {
                    add(
                        records,
                        links,
                        &region.identity.0,
                        &format!("randomDoors[{slot}]"),
                        "extra-action-point",
                        region.random_doors[slot],
                        "Random macro retained with zero chance",
                        "inactive: chance zero",
                    );
                }
            }
            let [low, high] = region.battle_range.map(i16::saturating_abs);
            if low > 0 && low <= high {
                // Endpoints already have exact individual descriptors. Interior values are potential choices.
                for battle in &s.battles {
                    if battle.native_id.0 > low as u32 && battle.native_id.0 < high as u32 {
                        add(
                            records,
                            links,
                            &region.identity.0,
                            "battleRange",
                            "battle",
                            battle.native_id.0 as i16,
                            &format!("Random battle in inclusive range {low}–{high}"),
                            "potential runtime choice",
                        );
                    }
                }
            }
        }
    }
}

fn actions(
    s: &ProjectSnapshot,
    source: &str,
    actions: &[ClassicAction],
    records: &[DiscoveryRecord],
    links: &mut Vec<DiscoveryLink>,
    resolver: &mut super::settings_links::Resolver,
) {
    for action in actions {
        let Some(row) = s
            .extra_codes
            .iter()
            .find(|r| i64::from(r.native_id.0) == i64::from(action.target_native_id))
        else {
            continue;
        };
        for field in crate::action_authoring::settings_target_fields(
            action.opcode(),
            row.values,
            crate::action_authoring::option_labels_present(s),
        ) {
            super::settings_links::append(s, source, action, field, records, links, resolver);
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn add(
    records: &[DiscoveryRecord],
    links: &mut Vec<DiscoveryLink>,
    source: &str,
    field: &str,
    kind: &str,
    id: i16,
    meaning: &str,
    activity: &str,
) {
    let owner = records.iter().find(|r| r.identity == source);
    let target = records
        .iter()
        .find(|r| r.kind == kind && r.native_id == id.to_string());
    links.push(DiscoveryLink {
        relationship: super::RelationshipKind::for_target(kind),
        contextual: false,
        occurrence: format!("{source}|{field}|{kind}|{id}"),
        source: source.into(),
        field: field.into(),
        target_kind: kind.into(),
        target_id: id.to_string(),
        target_identity: target.map(|r| r.identity.clone()),
        target_scope: Some("scenario".into()),
        source_label: owner
            .map(|record| super::labels::source_label(record, field))
            .unwrap_or_else(|| source.into()),
        target_label: target
            .map(|r| r.name.clone())
            .unwrap_or_else(|| format!("{kind} {id}")),
        meaning: meaning.into(),
        resolution: if target.is_some() {
            ResolutionState::Resolved
        } else {
            ResolutionState::Missing
        },
        root_reason: owner.and_then(|r| r.root_reason.clone()),
        activity: activity.into(),
        code_position: None,
        caller_context: None,
    });
}
