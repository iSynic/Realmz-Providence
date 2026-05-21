use super::{inspect_resource_preview, ResourcePreviewStatus};
use crate::resource_fork::parse_resource_fork_entries;
use std::collections::BTreeMap;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceCompatibilityAudit {
    pub total: usize,
    pub by_type: BTreeMap<String, usize>,
    pub by_status: BTreeMap<String, usize>,
    pub issues: Vec<ResourceCompatibilityIssue>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceCompatibilityIssue {
    pub source: String,
    pub resource_type: String,
    pub resource_id: i16,
    pub status: ResourcePreviewStatus,
    pub code: String,
    pub message: String,
    pub variant: Option<String>,
}

pub fn audit_resource_fork(source: &str, bytes: &[u8]) -> ResourceCompatibilityAudit {
    let mut audit = ResourceCompatibilityAudit {
        total: 0,
        by_type: BTreeMap::new(),
        by_status: BTreeMap::new(),
        issues: Vec::new(),
    };
    for entry in parse_resource_fork_entries(bytes) {
        audit.total += 1;
        *audit
            .by_type
            .entry(entry.resource_type.clone())
            .or_default() += 1;
        let preview = inspect_resource_preview(&entry.resource_type, &entry.data).ok();
        if let Some(preview) = preview {
            *audit
                .by_status
                .entry(format!("{:?}", preview.status))
                .or_default() += 1;
            if matches!(
                preview.status,
                ResourcePreviewStatus::UnsupportedVariant
                    | ResourcePreviewStatus::Malformed
                    | ResourcePreviewStatus::MissingFallback
            ) {
                if let Some(diagnostic) = preview.diagnostics.first() {
                    audit.issues.push(ResourceCompatibilityIssue {
                        source: source.to_string(),
                        resource_type: entry.resource_type,
                        resource_id: entry.id,
                        status: preview.status,
                        code: diagnostic.code.clone(),
                        message: diagnostic.message.clone(),
                        variant: diagnostic.variant.clone(),
                    });
                }
            }
        }
    }
    audit
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;

    #[test]
    fn bundled_corpus_produces_structured_resource_outcomes() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("workspace")
            .join("public")
            .join("bundled-libraries");
        if !root.exists() {
            return;
        }
        let mut audited = 0usize;
        let mut issues = Vec::new();
        for path in walk(&root) {
            let Ok(bytes) = fs::read(&path) else {
                continue;
            };
            let audit = audit_resource_fork(&path.display().to_string(), &bytes);
            audited += audit.total;
            issues.extend(audit.issues);
        }
        assert!(audited > 0, "expected bundled resource corpus");
        for issue in issues {
            assert!(!issue.code.trim().is_empty());
            assert!(!issue.message.contains("not yet available"));
            assert!(!issue.message.contains("Unsupported preview"));
        }
    }

    fn walk(root: &Path) -> Vec<std::path::PathBuf> {
        let mut out = Vec::new();
        let Ok(entries) = fs::read_dir(root) else {
            return out;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                out.extend(walk(&path));
            } else {
                out.push(path);
            }
        }
        out
    }
}
