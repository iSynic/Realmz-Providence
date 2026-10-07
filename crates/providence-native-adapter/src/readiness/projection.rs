use super::*;

pub(crate) fn readiness_projection(
    revision: Revision,
    readiness: &TargetCompatibility,
    problems: &[Value],
    problem_count: usize,
    params: &Value,
) -> Result<Value, String> {
    if let Some(identity) = params.get("groupIdentity").and_then(Value::as_str) {
        return members(revision, readiness, params, identity);
    }
    let offset = read_offset(params, "offset");
    let limit = read_limit(params, "limit", 100, 200);
    let problem_offset = read_offset(params, "problemOffset");
    let problem_limit = read_limit(params, "problemLimit", 200, 200);
    let warning_offset = read_offset(params, "warningOffset");
    let warning_limit = read_limit(params, "warningLimit", 200, 200);
    let groups = blocker_code_groups(&readiness.blockers)
        .into_iter()
        .map(|(code, count)| json!({ "code": code, "count": count }))
        .collect::<Vec<_>>();
    let total = readiness.blockers.len();
    let warning_groups = blocker_code_groups(&readiness.warnings)
        .into_iter()
        .map(|(code, count)| json!({ "code": code, "count": count }))
        .collect::<Vec<_>>();
    let warning_total = readiness.warnings.len();
    let blockers = page(&readiness.blockers, offset, limit, true);
    let projected_problems = problems
        .iter()
        .skip(problem_offset)
        .take(problem_limit)
        .collect::<Vec<_>>();
    let warnings = page(&readiness.warnings, warning_offset, warning_limit, false);
    Ok(json!({
        "revision": revision,
        "target": readiness.target,
        "status": readiness.status,
        "blockerCount": total,
        "blockerOccurrenceCount": readiness.blockers.iter().map(|finding| finding.group.as_ref().map_or(1, |group| group.occurrence_count)).sum::<usize>(),
        "groupCount": groups.len(),
        "groups": groups,
        "blockers": blockers,
        "warningCount": warning_total,
        "warningOccurrenceCount": readiness.warnings.iter().map(|finding| finding.group.as_ref().map_or(1, |group| group.occurrence_count)).sum::<usize>(),
        "warningGroupCount": warning_groups.len(),
        "warningGroups": warning_groups,
        "warnings": warnings,
        "warningOffset": warning_offset,
        "warningLimit": warning_limit,
        "warningsTruncated": warning_offset.saturating_add(warning_limit) < warning_total,
        "problemCount": problem_count,
        "problems": projected_problems,
        "problemOffset": problem_offset,
        "problemLimit": problem_limit,
        "problemsTruncated": problem_offset.saturating_add(problem_limit) < problem_count,
        "offset": offset,
        "limit": limit,
        "truncated": offset.saturating_add(limit) < total,
    }))
}

fn members(
    revision: Revision,
    readiness: &TargetCompatibility,
    params: &Value,
    identity: &str,
) -> Result<Value, String> {
    let finding = readiness
        .warnings
        .iter()
        .chain(&readiness.blockers)
        .find(|finding| {
            finding
                .group
                .as_ref()
                .is_some_and(|group| group.identity == identity)
        })
        .ok_or("Finding group is no longer available; refresh readiness.")?;
    let group = finding.group.as_ref().expect("matched group");
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    Ok(
        json!({"revision": revision, "groupIdentity": identity, "source": finding.entity,
            "field":group.field, "targetKind":group.target_kind, "occurrenceCount":group.occurrence_count,
            "offset":offset, "limit":limit, "members":group.members.iter().skip(offset).take(limit).collect::<Vec<_>>(),
            "truncated":offset.saturating_add(limit)<group.occurrence_count}),
    )
}

fn read_offset(params: &Value, key: &str) -> usize {
    params.get(key).and_then(Value::as_u64).unwrap_or(0) as usize
}
fn read_limit(params: &Value, key: &str, default: u64, maximum: u64) -> usize {
    params
        .get(key)
        .and_then(Value::as_u64)
        .unwrap_or(default)
        .clamp(1, maximum) as usize
}

fn page(rows: &[CompatibilityBlocker], offset: usize, limit: usize, blocking: bool) -> Vec<Value> {
    rows.iter()
        .skip(offset)
        .take(limit)
        .map(|finding| {
            let mut value = serde_json::to_value(finding).expect("compatibility finding");
            let presentation = finding
                .group
                .as_ref()
                .is_some_and(|group| group.target_kind == "artwork");
            let severity = if blocking {
                providence_core::validation::Severity::Error
            } else {
                providence_core::validation::Severity::Warning
            };
            let impact = providence_core::validation::presentation::impact(
                &finding.code,
                severity,
                false,
                presentation,
            );
            value["targetImpact"] = json!(impact);
            value["relevance"] = json!(if impact
                == providence_core::validation::presentation::FindingImpact::PreservationDetail
            {
                "preservation-detail"
            } else {
                "actionable"
            });
            value["occurrenceCount"] = json!(
                finding
                    .group
                    .as_ref()
                    .map_or(1, |group| group.occurrence_count)
            );
            value
        })
        .collect()
}
