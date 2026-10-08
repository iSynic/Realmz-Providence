use providence_core::{
    session::Revision,
    validation::{
        Diagnostic, Severity,
        findings::{CATEGORIES, category, matches_query, severity_slot},
    },
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::BTreeMap;
mod query;
use query::Query;

pub(crate) fn project(
    diagnostics: impl AsRef<[Diagnostic]>,
    revision: Revision,
    application_fallbacks: usize,
    params: &Value,
) -> Result<Value, String> {
    project_with_members(
        diagnostics,
        revision,
        application_fallbacks,
        params,
        |_, _| false,
    )
}

pub(crate) fn project_with_members(
    diagnostics: impl AsRef<[Diagnostic]>,
    revision: Revision,
    application_fallbacks: usize,
    params: &Value,
    member_matches: impl Fn(&Diagnostic, &str) -> bool,
) -> Result<Value, String> {
    project_with_rows(
        diagnostics,
        revision,
        application_fallbacks,
        params,
        member_matches,
        |_| false,
        |finding| serde_json::to_value(finding).expect("diagnostic"),
    )
}

pub(crate) fn project_with_rows(
    diagnostics: impl AsRef<[Diagnostic]>,
    revision: Revision,
    application_fallbacks: usize,
    params: &Value,
    member_matches: impl Fn(&Diagnostic, &str) -> bool,
    has_no_callers: impl Fn(&Diagnostic) -> bool,
    project_row: impl Fn(&Diagnostic) -> Value,
) -> Result<Value, String> {
    let diagnostics = diagnostics.as_ref();
    let query = Query::parse(params)?;
    let matching = diagnostics
        .iter()
        .filter(|finding| {
            !query.excludes(finding)
                && !(query.hide_uncalled_warnings
                    && finding.severity == Severity::Warning
                    && has_no_callers(finding))
                && !query
                    .severity
                    .is_some_and(|severity| severity != finding.severity)
                && (matches_query(finding, &query.text) || member_matches(finding, &query.text))
        })
        .collect::<Vec<_>>();
    let counts = code_counts(&matching);
    let group_total = counts.len();
    let groups = group_page(counts, query.group_offset, query.group_limit);
    let rows = matching
        .iter()
        .copied()
        .filter(|finding| query.in_group(finding))
        .collect::<Vec<_>>();
    let total = rows.len();
    let selected_index = query.selected_index(&rows);
    let offset = query.page_offset(total, selected_index);
    let items = rows
        .into_iter()
        .skip(offset)
        .take(query.limit)
        .map(project_row)
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": revision,
        "items": items, "offset": offset, "limit": query.limit, "total": total,
        "truncated": offset.saturating_add(query.limit) < total,
        "unfilteredTotal": diagnostics.len(), "matchedBeforeGroup": matching.len(),
        "unfilteredCounts": severity_counts(diagnostics.iter()), "selectionIndex": selected_index,
        "groups": groups, "groupOffset": query.group_offset, "groupLimit": query.group_limit,
        "groupTotal": group_total, "groupsTruncated": query.group_offset.saturating_add(query.group_limit) < group_total,
        "applicationFallbacks": application_fallbacks, "categories": category_counts(&matching),
        "temporaryHiddenCount": diagnostics.iter().filter(|row| query.excludes(row) || (query.hide_uncalled_warnings && row.severity == Severity::Warning && has_no_callers(row))).count(),
        "availableCodes": diagnostics.iter().map(|row| row.code.as_str()).collect::<std::collections::BTreeSet<_>>(),
    }))
}

fn severity_counts<'a>(rows: impl Iterator<Item = &'a Diagnostic>) -> Value {
    let mut counts = [0; 3];
    for finding in rows {
        counts[severity_slot(finding.severity)] += 1;
    }
    json!({"errors":counts[0], "warnings":counts[1], "information":counts[2]})
}

fn code_counts<'a>(rows: &[&'a Diagnostic]) -> BTreeMap<&'a str, [usize; 3]> {
    let mut counts = BTreeMap::<&str, [usize; 3]>::new();
    for finding in rows {
        counts.entry(&finding.code).or_default()[severity_slot(finding.severity)] += 1;
    }
    counts
}

fn group_page(counts: BTreeMap<&str, [usize; 3]>, offset: usize, limit: usize) -> Vec<Value> {
    counts
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(|(code, counts)| {
            json!({"code":code, "total":counts.iter().sum::<usize>(),
            "errors":counts[0], "warnings":counts[1], "information":counts[2]})
        })
        .collect()
}

fn category_counts(rows: &[&Diagnostic]) -> Vec<Value> {
    CATEGORIES
        .iter()
        .map(|(id, label)| {
            let mut counts = [0usize; 3];
            for finding in rows.iter().filter(|finding| category(&finding.code) == *id) {
                counts[severity_slot(finding.severity)] += 1;
            }
            json!({"id":id, "label":label, "total":counts.iter().sum::<usize>(),
            "errors":counts[0], "warnings":counts[1], "information":counts[2]})
        })
        .collect()
}

#[cfg(test)]
mod tests;
