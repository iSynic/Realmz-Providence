use crate::action_authoring::{
    ActionTargetContext, ActionTargetKind, ActionTargetQuery, ActionTargetStatus,
    list_targets_with_application,
};
use crate::model::ProjectSnapshot;
use crate::monster_reference_catalog::{
    MonsterReferenceChoice, MonsterReferencePage, MonsterReferenceQuery,
};
use crate::rebuilt::ApplicationMediaCatalog;

pub fn references(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &MonsterReferenceQuery,
) -> Result<MonsterReferencePage, String> {
    let mut rows = source_choices(snapshot, application, query)?;
    retain_current(&mut rows, query);
    Ok(page(rows, query))
}

fn source_choices(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    query: &MonsterReferenceQuery,
) -> Result<Vec<MonsterReferenceChoice>, String> {
    let kind = kind(&query.field)?;
    let mut source = ActionTargetQuery {
        kind,
        search: String::new(),
        cursor: None,
        limit: 128,
        context: ActionTargetContext::default(),
    };
    let mut rows = Vec::new();
    loop {
        let page = list_targets_with_application(snapshot, application, &source)?;
        for target in page.items {
            let Ok(value) = i16::try_from(target.value) else {
                continue;
            };
            if value == 0 && !query.field.starts_with("battle") {
                continue;
            }
            let choice = MonsterReferenceChoice {
                identity: format!("{}:{value}", target.identity.0),
                target_identity: Some(target.identity.0),
                value,
                label: target.label,
                detail: target.detail,
                ownership: if target.status == ActionTargetStatus::ApplicationResource {
                    "stock"
                } else {
                    "scenario"
                }
                .into(),
                available: true,
                reason: String::new(),
            };
            rows.push(choice.clone());
            if let Some(negative) = value.checked_neg().filter(|value| *value != 0) {
                let mut signed = choice;
                signed.value = negative;
                signed.identity =
                    format!("{}:{negative}", signed.target_identity.as_ref().unwrap());
                rows.push(signed);
            }
        }
        source.cursor = page.next_cursor;
        if source.cursor.is_none() {
            break;
        }
    }
    Ok(rows)
}

fn retain_current(rows: &mut Vec<MonsterReferenceChoice>, query: &MonsterReferenceQuery) {
    if !query.field.starts_with("battle") {
        rows.insert(
            0,
            MonsterReferenceChoice {
                identity: "none".into(),
                target_identity: None,
                value: 0,
                label: "None".into(),
                detail: "Clears only this local field on acceptance.".into(),
                ownership: "none".into(),
                available: true,
                reason: String::new(),
            },
        );
    }
    if !rows.iter().any(|row| row.value == query.current_value) {
        rows.push(MonsterReferenceChoice { identity: format!("missing:{}:{}", query.field, query.current_value),
            target_identity: None, value: query.current_value, label: format!("Missing {} {}", query.field, query.current_value),
            detail: "Cancel retains the exact current value.".into(), ownership: "scenario".into(), available: false,
            reason: "The exact reference is missing, ambiguous or has the wrong resource kind. Choose a valid target to repair it.".into() });
    }
}

pub fn kind(field: &str) -> Result<ActionTargetKind, String> {
    Ok(match field {
        "battleLow" | "battleHigh" => ActionTargetKind::Battle,
        "textId" => ActionTargetKind::Message,
        "soundId" => ActionTargetKind::Sound,
        "door0" | "door1" | "door2" => ActionTargetKind::ExtraActionPoint,
        _ => return Err("This field is not a region reference.".into()),
    })
}

fn page(
    mut rows: Vec<MonsterReferenceChoice>,
    query: &MonsterReferenceQuery,
) -> MonsterReferencePage {
    let needle = query.search.trim().to_lowercase();
    let exact = needle.parse::<i16>().ok();
    rows.sort_by_key(|row| (exact != Some(row.value), !row.available));
    let unavailable_total = rows.iter().filter(|row| !row.available).count();
    let rows: Vec<_> = rows
        .into_iter()
        .filter(|row| {
            (row.available
                || query.show_unavailable
                || (needle.is_empty() && row.value == query.current_value))
                && (query.ownership.is_empty()
                    || query.ownership == "all"
                    || query.ownership == row.ownership
                    || row.ownership == "none")
                && (needle.is_empty()
                    || exact == Some(row.value)
                    || format!("{} {} {}", row.label, row.value, row.detail)
                        .to_lowercase()
                        .contains(&needle))
        })
        .collect();
    let limit = query.limit.clamp(1, 128);
    let offset = if query.seek_current && needle.is_empty() {
        rows.iter()
            .position(|row| row.value == query.current_value)
            .map_or(0, |index| index / limit * limit)
    } else {
        query.offset
    };
    let total = rows.len();
    MonsterReferencePage {
        items: rows.into_iter().skip(offset).take(limit).collect(),
        offset,
        limit,
        total,
        unavailable_total,
    }
}
