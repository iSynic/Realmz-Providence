//! New Project shares native initialization; MCP never invents stock definitions.
use providence_core::model::{ProjectSnapshot, StableId};
use providence_storage::{AuthoredProjectBaseline, ProjectStore};
use std::path::Path;

pub(super) fn create(
    path: &Path,
    project_id: StableId,
    options: &[String],
) -> Result<bool, String> {
    let rules = options
        .chunks_exact(2)
        .rev()
        .find(|pair| pair[0] == "--application-rules-root");
    if let Some(pair) = rules {
        let baseline = AuthoredProjectBaseline::read(&project_id.0, Path::new(&pair[1]))?;
        baseline.create(path.to_str().ok_or("project path must be valid Unicode")?)?;
    } else {
        ProjectStore::create_new(path, &ProjectSnapshot::new_authored(project_id))
            .map_err(|error| error.to_string())?;
    }
    Ok(rules.is_some())
}
