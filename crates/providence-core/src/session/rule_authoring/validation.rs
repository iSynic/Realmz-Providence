use super::*;
use crate::codecs::{decode_caste_rules, decode_race_rules};

// Unchanged malformed imported pairs remain evidence; new edits must be coherent.
pub(super) fn validate_changed_ranges(
    draft: &RuleRecordDraft,
    sources: &RuleAuthoringSources<'_>,
    baseline: &RuleAuthoringBaseline<'_>,
) -> Result<(), String> {
    let index = usize::from(
        draft
            .copy_source
            .as_ref()
            .map_or(draft.edit.classic_id(), |copy| copy.classic_id)
            - 1,
    );
    let stock_copy = draft
        .copy_source
        .as_ref()
        .is_some_and(|copy| copy.scope == "stock");
    let newly_blank = draft.allocation && draft.copy_source.is_none();
    validate_edit_ranges(
        &draft.edit,
        sources,
        baseline,
        index,
        stock_copy,
        newly_blank,
    )
}

fn validate_edit_ranges(
    edit: &RuleEdit,
    sources: &RuleAuthoringSources<'_>,
    baseline: &RuleAuthoringBaseline<'_>,
    index: usize,
    stock_copy: bool,
    newly_blank: bool,
) -> Result<(), String> {
    match edit {
        RuleEdit::Race { definition } => validate_race_ranges(
            definition,
            if stock_copy {
                baseline.race
            } else {
                sources.race
            },
            index,
            newly_blank,
        ),
        RuleEdit::Caste { definition, .. } => validate_caste_ranges(
            definition,
            if stock_copy {
                baseline.caste
            } else {
                sources.caste
            },
            index,
            newly_blank,
        ),
    }
}

fn validate_race_ranges(
    definition: &crate::model::RaceRuleDefinition,
    source: &[u8],
    index: usize,
    allocation: bool,
) -> Result<(), String> {
    let previous = decode_race_rules(source, None).rules;
    let before = &previous
        .get(index)
        .ok_or("The Race source row is missing")?
        .definition;
    pairs(
        "Attribute limits",
        &definition.attribute_limits,
        &before.attribute_limits,
        allocation,
    )?;
    for (row, age) in definition.age_ranges.iter().enumerate() {
        pairs(
            &format!("Age band {}", row + 1),
            age,
            before.age_ranges.get(row).map(Vec::as_slice).unwrap_or(&[]),
            allocation,
        )?;
    }
    Ok(())
}

fn validate_caste_ranges(
    definition: &crate::model::CasteRuleDefinition,
    source: &[u8],
    index: usize,
    allocation: bool,
) -> Result<(), String> {
    let previous = decode_caste_rules(source, None).rules;
    let before = &previous
        .get(index)
        .ok_or("The Caste source row is missing")?
        .definition;
    pairs(
        "Attribute limits",
        &definition.attribute_limits,
        &before.attribute_limits,
        allocation,
    )?;
    casting_ranges(
        &definition.spellcaster_rows,
        &before.spellcaster_rows,
        allocation,
    )
}

fn casting_ranges(rows: &[Vec<i32>], before: &[Vec<i32>], allocation: bool) -> Result<(), String> {
    for (row, casting) in rows.iter().enumerate() {
        if casting.len() != 3 {
            return Err("Each casting row requires enabled, start level and maximum level.".into());
        }
        if casting[0] != 0 {
            pairs(
                &format!("Casting row {} levels", row + 1),
                &casting[1..],
                before.get(row).map(|v| &v[1..]).unwrap_or(&[]),
                allocation,
            )?;
        }
    }
    Ok(())
}

fn pairs(label: &str, values: &[i32], before: &[i32], allocation: bool) -> Result<(), String> {
    if !values.len().is_multiple_of(2) {
        return Err(format!("{label} requires minimum/maximum pairs."));
    }
    for (index, pair) in values.chunks_exact(2).enumerate() {
        let changed = allocation || before.get(index * 2..index * 2 + 2) != Some(pair);
        if changed && pair[0] > pair[1] {
            return Err(format!(
                "{label} pair {}: minimum cannot exceed maximum. Your draft is retained.",
                index + 1
            ));
        }
    }
    Ok(())
}
