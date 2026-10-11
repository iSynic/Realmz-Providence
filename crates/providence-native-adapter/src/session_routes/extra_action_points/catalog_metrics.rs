use std::collections::BTreeMap;

use providence_core::model::StableId;
use providence_core::references::{ReferenceDescriptor, TargetKind};
use providence_core::validation::Diagnostic;

pub(super) struct CatalogMetrics {
    diagnostics: BTreeMap<StableId, Vec<Diagnostic>>,
    callers: BTreeMap<String, usize>,
}

impl CatalogMetrics {
    pub(super) fn new(diagnostics: Vec<Diagnostic>, references: Vec<ReferenceDescriptor>) -> Self {
        let mut indexed = Self {
            diagnostics: BTreeMap::new(),
            callers: BTreeMap::new(),
        };
        for diagnostic in diagnostics {
            if let Some(identity) = diagnostic.entity.clone() {
                indexed
                    .diagnostics
                    .entry(identity)
                    .or_default()
                    .push(diagnostic);
            }
        }
        for reference in references {
            if reference.target_kind == TargetKind::ExtraActionPoint {
                *indexed.callers.entry(reference.target_id).or_default() += 1;
            }
        }
        indexed
    }

    pub(super) fn diagnostics(&self, identity: &StableId) -> &[Diagnostic] {
        self.diagnostics.get(identity).map_or(&[], Vec::as_slice)
    }

    pub(super) fn callers(&self, native_id: u32) -> usize {
        self.callers
            .get(&native_id.to_string())
            .copied()
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests;
