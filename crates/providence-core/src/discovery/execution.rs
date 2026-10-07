//! Encounter results are distinct caller owners. This graph describes authored
//! possible paths; runtime predicates still determine which path runs.
use super::{DiscoveryLink, DiscoveryRecord};
use crate::{
    model::{ClassicAction, ProjectSnapshot},
    references::ResolutionState,
};

pub(super) fn records(s: &ProjectSnapshot, out: &mut Vec<DiscoveryRecord>) {
    for identity in s
        .simple_encounters
        .iter()
        .filter(|r| r.has_semantics())
        .map(|r| &r.identity.0)
        .chain(s.complex_encounters.iter().map(|r| &r.identity.0))
    {
        for result in 0..4 {
            let id = format!("{identity}:result:{result}");
            let family = identity.split(':').next().unwrap_or_default();
            out.push(DiscoveryRecord {
                identity: id.clone(), native_id: id, kind: format!("{family}-result"),
                name: format!("{} · Result {}", identity.replace('-', " "), result + 1),
                scope: "scenario".into(), root_reason: None,
                fields: vec![("owner".into(), identity.clone()), ("result".into(), (result + 1).to_string()),
                    ("coverage".into(), "Authored choices and local branches; runtime predicates determine which path runs.".into())],
            });
        }
    }
}

pub(super) fn append(
    s: &ProjectSnapshot,
    records: &[DiscoveryRecord],
    links: &mut Vec<DiscoveryLink>,
) {
    simple_choices(s, records, links);
    complex_outcomes(s, records, links);
    complex_failures(s, records, links);
    rogue_returns(s, records, links);
    script_branches(s, records, links);
}

fn simple_choices(
    s: &ProjectSnapshot,
    records: &[DiscoveryRecord],
    links: &mut Vec<DiscoveryLink>,
) {
    for row in s.simple_encounters.iter().filter(|row| row.has_semantics()) {
        for (index, result) in row.choice_results.iter().enumerate() {
            if row.texts[index].trim().is_empty() {
                continue;
            }
            destination(
                records,
                links,
                &row.identity.0,
                format!("choiceResults[{index}]"),
                "simple-encounter",
                i16::from(*result) - 1,
                None,
                "Response choice",
            );
        }
    }
}

fn complex_outcomes(
    s: &ProjectSnapshot,
    records: &[DiscoveryRecord],
    links: &mut Vec<DiscoveryLink>,
) {
    for row in &s.complex_encounters {
        for (field, result) in [
            ("actionResult", row.action_result),
            ("wordResult", row.word_result),
        ] {
            if result > 0 {
                destination(
                    records,
                    links,
                    &row.identity.0,
                    field.into(),
                    "complex-encounter",
                    i16::from(result) - 1,
                    None,
                    "Encounter outcome",
                );
            }
        }
        for (prefix, results, ids) in [
            (
                "spellResults",
                row.spell_results.as_slice(),
                row.spell_ids.as_slice(),
            ),
            (
                "itemResults",
                row.item_results.as_slice(),
                row.item_ids.as_slice(),
            ),
        ] {
            for (index, result) in results.iter().enumerate() {
                let available = if prefix == "spellResults" {
                    spell_path(row)
                } else {
                    row.item_ids[0] != 0
                };
                if available && ids[index] != 0 && *result > 0 {
                    destination(
                        records,
                        links,
                        &row.identity.0,
                        format!("{prefix}[{index}]"),
                        "complex-encounter",
                        i16::from(*result) - 1,
                        None,
                        "Encounter outcome",
                    );
                }
            }
        }
    }
}

// Castle's unsuccessful word, spell, item and physical tests enter Result 4.
fn complex_failures(
    s: &ProjectSnapshot,
    records: &[DiscoveryRecord],
    links: &mut Vec<DiscoveryLink>,
) {
    for row in &s.complex_encounters {
        for (field, active, reason) in [
            (
                "wordResult",
                row.word_result != 0,
                "Incorrect word → Result 4",
            ),
            (
                "actionResult",
                row.action_result != 0,
                "Unmatched physical combination → Result 4",
            ),
            (
                "spellResults",
                spell_path(row),
                "Unmatched spell → Result 4",
            ),
            (
                "itemResults",
                row.item_ids[0] != 0,
                "Unmatched item → Result 4",
            ),
        ] {
            if !active {
                continue;
            }
            let mut link = result_link(
                records,
                &row.identity.0,
                &row.identity.0,
                field.into(),
                "complex-encounter",
                3,
                None,
                reason,
            );
            link.occurrence.push_str("|failure");
            links.push(link);
        }
    }
}

fn rogue_returns(s: &ProjectSnapshot, records: &[DiscoveryRecord], links: &mut Vec<DiscoveryLink>) {
    for owner in s.complex_encounters.iter().filter(|owner| owner.thief) {
        let Some(rogue) = s
            .rogue_encounters
            .iter()
            .find(|r| i64::from(r.native_id.0) == i64::from(owner.thief_success))
        else {
            continue;
        };
        for (prefix, codes) in [
            ("successCodes", rogue.success_codes),
            ("failureCodes", rogue.failure_codes),
        ] {
            for (slot, code) in codes.into_iter().enumerate() {
                let magic_success = spell_path(owner)
                    && prefix == "successCodes"
                    && ((slot == 2 && rogue.prompt_sounds[2] != 0)
                        || (slot == 6 && rogue.prompt_sounds[1] != 0));
                if code == 0 || (!rogue_action_possible(rogue, slot) && !magic_success) {
                    continue;
                }
                links.push(result_link(
                    records,
                    &rogue.identity.0,
                    &owner.identity.0,
                    format!("{prefix}[{slot}]"),
                    "complex-encounter",
                    i16::from(code) - 1,
                    None,
                    &rogue_return_meaning(rogue, owner.native_id.0, slot),
                ));
            }
        }
    }
}

fn script_branches(
    s: &ProjectSnapshot,
    records: &[DiscoveryRecord],
    links: &mut Vec<DiscoveryLink>,
) {
    for (source, actions) in s
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
        local_branches(s, records, links, source, actions);
    }
}

fn local_branches(
    s: &ProjectSnapshot,
    records: &[DiscoveryRecord],
    links: &mut Vec<DiscoveryLink>,
    source: &str,
    actions: &[ClassicAction],
) {
    for action in actions {
        let Some(row) = s
            .extra_codes
            .iter()
            .find(|r| i64::from(r.native_id.0) == i64::from(action.target_native_id))
        else {
            continue;
        };
        for field in crate::action_authoring::execution_target_fields(action.opcode(), row.values) {
            destination(
                records,
                links,
                source,
                format!("actions[{}].settings.{}", action.slot, field.key),
                field.family,
                field.result,
                field.code_position,
                "Local branch",
            );
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn destination(
    records: &[DiscoveryRecord],
    links: &mut Vec<DiscoveryLink>,
    source: &str,
    field: String,
    family: &str,
    result: i16,
    position: Option<i16>,
    meaning: &str,
) {
    links.push(result_link(
        records, source, source, field, family, result, position, meaning,
    ));
}

#[allow(clippy::too_many_arguments)]
fn result_link(
    records: &[DiscoveryRecord],
    source: &str,
    target_owner: &str,
    field: String,
    family: &str,
    result: i16,
    position: Option<i16>,
    meaning: &str,
) -> DiscoveryLink {
    let contextual = target_owner.split(':').next() != Some(family);
    let identity = format!("{target_owner}:result:{result}");
    let valid_position = position.is_none_or(|p| (0..8).contains(&p));
    let target = (!contextual && valid_position)
        .then(|| records.iter().find(|r| r.identity == identity))
        .flatten();
    let owner = records.iter().find(|r| r.identity == source);
    let position_text = position
        .map(|p| format!(" · code position {p}"))
        .unwrap_or_default();
    let eliminated = !contextual && result == -1 && field.starts_with("choiceResults[");
    DiscoveryLink {
        occurrence: format!("{source}|{field}|{family}-result|{identity}"), source: source.into(), field: field.clone(),
        target_kind: format!("{family}-result"), target_id: if contextual { result.to_string() } else { identity },
        target_identity: target.map(|r| r.identity.clone()), target_scope: Some("scenario".into()),
        source_label: owner.map(|r| super::labels::source_label(r, &field)).unwrap_or_else(|| source.into()),
        target_label: if eliminated { "Initially eliminated response".into() } else { format!("{} result {}{position_text}", family.replace('-', " "), result + 1) },
        meaning: format!("{meaning}{position_text}"), resolution: if target.is_some() { ResolutionState::Resolved } else { ResolutionState::Missing },
        root_reason: owner.and_then(|r| r.root_reason.clone()), code_position: position,
        caller_context: source.starts_with("rogue-encounter:").then(|| target_owner.to_owned()),
        activity: if !valid_position { "invalid: code position must be between 0 and 7" } else if contextual { "contextual: the executing caller supplies the current encounter; no record destination is inferred" } else if eliminated { "inactive: initially eliminated choice" } else { "authored possible path; runtime predicates apply" }.into(),
    }
}

pub(super) fn caller_position(link: &DiscoveryLink) -> Option<i16> {
    if !link.source.starts_with("simple-encounter:")
        && !link.source.starts_with("complex-encounter:")
    {
        return None;
    }
    link.field
        .split_once("actions[")
        .and_then(|(_, tail)| tail.split(']').next())
        .and_then(|slot| slot.parse::<i16>().ok())
        .map(|slot| slot % 8)
}

pub(super) fn caller_owner<'a>(
    index: &'a super::DiscoveryIndex,
    link: &DiscoveryLink,
) -> Option<&'a DiscoveryRecord> {
    let source = index.record(&link.source)?;
    if !matches!(
        source.kind.as_str(),
        "simple-encounter" | "complex-encounter"
    ) {
        return Some(source);
    }
    let slot = link
        .field
        .split_once("actions[")
        .and_then(|(_, tail)| tail.split(']').next())
        .and_then(|value| value.parse::<usize>().ok());
    slot.and_then(|slot| index.record(&format!("{}:result:{}", link.source, slot / 8)))
        .or(Some(source))
}

fn spell_path(row: &crate::model::ComplexEncounter) -> bool {
    // Castle also routes an activated scroll item through tryspell2, after the
    // item availability gate but without the casting button's first-slot gate.
    row.spell_ids[0] != 0 || row.item_ids[0] != 0
}

fn rogue_action_possible(row: &crate::model::RogueEncounter, slot: usize) -> bool {
    row.type_flags[slot]
        || (slot == 2
            && row.type_flags[9]
            && row.type_flags[1]
            && (row.success_codes[1] == 0 || row.native_id.0 > 0))
        || (slot == 6
            && row.type_flags[9]
            && row.type_flags[..8]
                .iter()
                .enumerate()
                .any(|(index, enabled)| index != 1 && *enabled))
}

fn rogue_return_meaning(row: &crate::model::RogueEncounter, owner: u32, slot: usize) -> String {
    let condition =
        if slot == 2 && !row.type_flags[2] && row.success_codes[1] != 0 && row.native_id.0 > 0 {
            "; possible on a later invocation after Detect enables Disarm and saves its flag"
        } else if !row.type_flags[slot] {
            "; possible after trap state changes or a configured magic success"
        } else {
            ""
        };
    format!("Rogue return to Complex Encounter {owner}{condition}")
}
