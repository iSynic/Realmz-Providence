use crate::{model::StableId, references::FieldPath, validation::Diagnostic};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub(super) struct GroupedFindings {
    pub rows: Vec<Diagnostic>,
    pub members: BTreeMap<String, Vec<Diagnostic>>,
    pub identities: BTreeMap<String, String>,
}

impl GroupedFindings {
    pub fn members_for(&self, finding: &Diagnostic) -> Option<&[Diagnostic]> {
        self.identities
            .get(&row_key(finding))
            .and_then(|identity| self.members.get(identity))
            .map(Vec::as_slice)
    }
}

pub(super) fn row_key(finding: &Diagnostic) -> String {
    format!(
        "{}|{}|{}",
        finding.code,
        finding.entity.as_ref().map_or("", |id| id.0.as_str()),
        finding.field.as_ref().map_or("", |field| field.0.as_str())
    )
}

pub(super) fn group(
    findings: Vec<Diagnostic>,
    targets: &BTreeMap<(StableId, FieldPath), String>,
) -> GroupedFindings {
    let mut grouped = GroupedFindings {
        rows: Vec::new(),
        members: BTreeMap::new(),
        identities: BTreeMap::new(),
    };
    let mut groups = BTreeMap::<String, Vec<Diagnostic>>::new();
    for finding in findings {
        if let Some(key) = group_key(&finding, targets) {
            groups.entry(key).or_default().push(finding);
        } else {
            grouped.rows.push(finding);
        }
    }
    for (key, group) in groups {
        if group.len() == 1 {
            grouped.rows.extend(group);
            continue;
        }
        let identity = format!("{:x}", Sha256::digest(key.as_bytes()));
        let mut representative = group[0].clone();
        representative.message = format!("{} occurrences. {}", group.len(), representative.message);
        grouped
            .identities
            .insert(row_key(&representative), identity.clone());
        grouped.members.insert(identity, group);
        grouped.rows.push(representative);
    }
    grouped
        .rows
        .sort_by(|a, b| (&a.code, &a.entity, &a.field).cmp(&(&b.code, &b.entity, &b.field)));
    grouped
}

fn group_key(
    finding: &Diagnostic,
    targets: &BTreeMap<(StableId, FieldPath), String>,
) -> Option<String> {
    if !finding.code.starts_with("reference.") {
        return None;
    }
    let (entity, field) = finding.entity.as_ref().zip(finding.field.as_ref())?;
    let target = targets.get(&(entity.clone(), field.clone()))?;
    let artwork = matches!(
        finding.code.as_str(),
        "reference.icon.missing"
            | "reference.picture.missing"
            | "reference.special-land-tile.missing"
            | "reference.landlook.missing"
    );
    Some(format!(
        "{}|{}|{}",
        finding.code,
        entity.0,
        if artwork { target } else { &field.0 }
    ))
}
