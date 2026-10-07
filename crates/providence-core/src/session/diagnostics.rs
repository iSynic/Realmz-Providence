use crate::model::ProjectSnapshot;
use crate::references::FieldPath;
use crate::references::ReferenceDescriptor;
use crate::references::ResolutionState;
use crate::session::projections::references_for;
use crate::session::reference_targets::target_kind_slug;
use crate::validation::Diagnostic;
use crate::validation::Severity;
use crate::validation::action_settings;

#[cfg(test)]
mod preserved_item_use_tests;
mod source_preservation;

pub(crate) fn imported_runtime_diagnostics(snapshot: &ProjectSnapshot) -> Vec<Diagnostic> {
    let mut findings = timed_encounter_diagnostics(snapshot);
    findings.extend(rogue_encounter_diagnostics(snapshot));
    findings.extend(source_preservation::diagnostics(snapshot));
    findings
}

pub fn diagnostics_for(snapshot: &ProjectSnapshot) -> Vec<Diagnostic> {
    diagnostics_with_references(snapshot, &references_for(snapshot))
}

pub(super) fn diagnostics_with_references(
    snapshot: &ProjectSnapshot,
    references: &[ReferenceDescriptor],
) -> Vec<Diagnostic> {
    let mut diagnostics = diagnostics_from_references(snapshot, references);
    diagnostics.extend(action_settings::diagnostics(snapshot));
    diagnostics.extend(battle_diagnostics(snapshot));
    diagnostics.extend(complex_encounter_diagnostics(snapshot));
    diagnostics.extend(rogue_encounter_diagnostics(snapshot));
    diagnostics.extend(timed_encounter_diagnostics(snapshot));
    diagnostics.extend(source_preservation::diagnostics(snapshot));
    diagnostics
}

pub(super) fn timed_encounter_diagnostics(snapshot: &ProjectSnapshot) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();
    for encounter in &snapshot.timed_encounters {
        if !(0..=100).contains(&encounter.percent) {
            diagnostics.push(Diagnostic {
                code: "timed-encounter.percent.out-of-range".into(),
                severity: Severity::Warning,
                message: format!(
                    "Timed Encounter chance {} is outside 0 through 100.",
                    encounter.percent
                ),
                entity: Some(encounter.identity.clone()),
                field: Some(FieldPath("percent".into())),
            });
        }
        if encounter.location_kind != crate::model::TimedEncounterLocationKind::Any
            && encounter.required_level < 0
        {
            diagnostics.push(Diagnostic {
                code: "timed-encounter.location.invalid-level".into(),
                severity: imported_record_severity(snapshot, encounter.authored),
                message: "A location-gated Timed Encounter has a negative level. Castle does not treat this as any level; the imported condition is retained.".into(),
                entity: Some(encounter.identity.clone()),
                field: Some(FieldPath("requiredLevel".into())),
            });
        }
    }
    diagnostics
}

pub(super) fn rogue_encounter_diagnostics(snapshot: &ProjectSnapshot) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();
    for encounter in &snapshot.rogue_encounters {
        if encounter.low_damage != 0
            && encounter.high_damage != 0
            && encounter.low_damage > encounter.high_damage
        {
            diagnostics.push(Diagnostic {
                code: "rogue-encounter.damage.inverted".into(),
                severity: imported_record_severity(snapshot, encounter.authored),
                message: format!(
                    "Trap damage minimum {} exceeds maximum {}. The bounds are retained; runtime damage may differ from the intended interval.",
                    encounter.low_damage, encounter.high_damage
                ),
                entity: Some(encounter.identity.clone()),
                field: Some(FieldPath("lowDamage".into())),
            });
        }
        if encounter.type_flags[9] && encounter.low_damage == 0 && encounter.spell == 0 {
            diagnostics.push(Diagnostic {
                code: "rogue-encounter.trap.no-effect".into(),
                severity: Severity::Warning,
                message:
                    "Trap state is enabled, but neither trap damage nor a trap spell is configured."
                        .into(),
                entity: Some(encounter.identity.clone()),
                field: Some(FieldPath("typeFlags[9]".into())),
            });
        }
    }
    diagnostics
}

fn imported_record_severity(snapshot: &ProjectSnapshot, authored: bool) -> Severity {
    if !authored
        && matches!(
            snapshot.origin,
            crate::model::ProjectOrigin::Imported { .. }
        )
    {
        Severity::Warning
    } else {
        Severity::Error
    }
}

pub(super) fn complex_encounter_diagnostics(snapshot: &ProjectSnapshot) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();
    for encounter in &snapshot.complex_encounters {
        if encounter.action_result != 0 && encounter.groups.iter().all(|value| *value == 0) {
            diagnostics.push(Diagnostic {
                code: "complex-encounter.action.no-groups".into(),
                severity: Severity::Warning,
                message:
                    "Action result is enabled, but no required physical action groups are selected."
                        .into(),
                entity: Some(encounter.identity.clone()),
                field: Some(FieldPath("groups".into())),
            });
        }
        if encounter.word_result != 0 && encounter.texts[8].trim().is_empty() {
            diagnostics.push(Diagnostic {
                code: "complex-encounter.word.empty".into(),
                severity: Severity::Warning,
                message: "Word result is enabled, but the typed reply text is empty.".into(),
                entity: Some(encounter.identity.clone()),
                field: Some(FieldPath("texts[8]".into())),
            });
        }
        if encounter.thief
            && !snapshot
                .rogue_encounters
                .iter()
                .any(|row| row.native_id.0 as i32 == i32::from(encounter.thief_success))
        {
            diagnostics.push(Diagnostic {
                code: "complex-encounter.rogue.missing".into(),
                severity: Severity::Error,
                message: "Rogue action is enabled without a Data TD2 Rogue encounter target."
                    .into(),
                entity: Some(encounter.identity.clone()),
                field: Some(FieldPath("thiefSuccess".into())),
            });
        }
        append_complex_response_diagnostics(encounter, &mut diagnostics);
        if encounter.thief_fail != 0 {
            diagnostics.push(Diagnostic {
                code: "complex-encounter.rogue-reset.unconsumed".into(),
                severity: Severity::Information,
                message: "Rogue Reset Flag is preserved and compiler-owned, but current Realmz runtime evidence does not consume it.".into(),
                entity: Some(encounter.identity.clone()),
                field: Some(FieldPath("thiefFail".into())),
            });
        }
    }
    diagnostics
}

pub(super) fn battle_diagnostics(snapshot: &ProjectSnapshot) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();
    for battle in &snapshot.battles {
        let placed = battle.grid.iter().filter(|value| **value != 0).count();
        if placed == 0 {
            diagnostics.push(Diagnostic {
                code: "battle.empty".into(),
                severity: Severity::Warning,
                message: "Battle has no monster anchors.".into(),
                entity: Some(battle.identity.clone()),
                field: Some(FieldPath("grid".into())),
            });
        }
        if placed > crate::codecs::BATTLE_RUNTIME_MONSTER_LIMIT {
            diagnostics.push(Diagnostic {
                code: "battle.runtime-monster-limit".into(),
                severity: Severity::Warning,
                message: format!(
                    "Battle places {placed} monster anchors; Realmz loads at most {}.",
                    crate::codecs::BATTLE_RUNTIME_MONSTER_LIMIT
                ),
                entity: Some(battle.identity.clone()),
                field: Some(FieldPath("grid".into())),
            });
        }
        if battle.authored && !(1..=30).contains(&battle.distance) {
            diagnostics.push(Diagnostic {
                code: "battle.distance.unusual".into(),
                severity: Severity::Warning,
                message: format!(
                    "Battle distance {} is outside Divinity's documented 1-30 range.",
                    battle.distance
                ),
                entity: Some(battle.identity.clone()),
                field: Some(FieldPath("distance".into())),
            });
        }
        if battle.battle_macro > 0 {
            diagnostics.push(Diagnostic {
                code: "battle.macro.positive-import".into(),
                severity: Severity::Warning,
                message: "Positive imported Battle Macro is preserved, but Realmz executes the round macro only when this field is negative.".into(),
                entity: Some(battle.identity.clone()),
                field: Some(FieldPath("battleMacro".into())),
            });
        }
    }
    diagnostics
}

pub(super) fn diagnostics_from_references(
    snapshot: &ProjectSnapshot,
    references: &[ReferenceDescriptor],
) -> Vec<Diagnostic> {
    references
        .iter()
        .filter(|reference| {
            matches!(
                reference.resolution,
                ResolutionState::Missing | ResolutionState::Ambiguous
            )
        })
        .map(|reference| {
            preserved_item_use_restriction(snapshot, reference).unwrap_or_else(|| Diagnostic {
                code: format!(
                    "reference.{}.{}",
                    target_kind_slug(&reference.target_kind),
                    match reference.resolution {
                        ResolutionState::Ambiguous => "ambiguous",
                        _ => "missing",
                    }
                ),
                severity: if matches!(
                    snapshot.origin,
                    crate::model::ProjectOrigin::Imported { .. }
                ) && reference.resolution == ResolutionState::Missing
                {
                    Severity::Warning
                } else {
                    Severity::Error
                },
                message: format!(
                    "{} points to {:?} {:?} {}",
                    reference.field.0,
                    reference.resolution,
                    reference.target_kind,
                    crate::rule_presentation::identity_author_number(&reference.target_id)
                        .map(|id| id.to_string())
                        .unwrap_or_else(|| reference.target_id.clone())
                ),
                entity: Some(reference.source.clone()),
                field: Some(reference.field.clone()),
            })
        })
        .collect()
}

fn preserved_item_use_restriction(
    snapshot: &ProjectSnapshot,
    reference: &ReferenceDescriptor,
) -> Option<Diagnostic> {
    if !matches!(
        snapshot.origin,
        crate::model::ProjectOrigin::Imported { .. }
    ) || reference.target_kind != crate::references::TargetKind::Caste
        || reference.field.0 != "specificCasteId"
        || reference.target_id != "classic.caste.-32768"
        || !snapshot
            .item_rules
            .iter()
            .map(|row| &row.definition)
            .chain(
                snapshot
                    .scenario_item_rules
                    .iter()
                    .map(|row| &row.definition),
            )
            .any(|row| row.id == reference.source)
    {
        return None;
    }
    Some(Diagnostic {
        code: "item.caste.unmatchable-preserved".into(), severity: Severity::Information,
        message: "Preserved Caste restriction −32768: no normal caste matches. Castle rejects ordinary item use on paths that check this restriction; possession and script checks are separate.".into(),
        entity: Some(reference.source.clone()), field: Some(reference.field.clone()),
    })
}

fn append_complex_response_diagnostics(
    encounter: &crate::model::ComplexEncounter,
    diagnostics: &mut Vec<Diagnostic>,
) {
    for (slot, (&spell_id, &result)) in encounter
        .spell_ids
        .iter()
        .zip(encounter.spell_results.iter())
        .enumerate()
    {
        if spell_id == 0 && result != 0 {
            diagnostics.push(Diagnostic {
                code: "complex-encounter.spell.result-without-target".into(),
                severity: Severity::Warning,
                message: format!("Spell response {slot} has a result but no spell or class ID."),
                entity: Some(encounter.identity.clone()),
                field: Some(FieldPath(format!("spellResults[{slot}]"))),
            });
        }
    }
    for (slot, (&item_id, &result)) in encounter
        .item_ids
        .iter()
        .zip(encounter.item_results.iter())
        .enumerate()
    {
        if item_id == 0 && result != 0 {
            diagnostics.push(Diagnostic {
                code: "complex-encounter.item.result-without-target".into(),
                severity: Severity::Warning,
                message: format!("Item response {slot} has a result but no item ID."),
                entity: Some(encounter.identity.clone()),
                field: Some(FieldPath(format!("itemResults[{slot}]"))),
            });
        }
    }
}
