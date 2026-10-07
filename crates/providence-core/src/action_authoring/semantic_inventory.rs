//! Pinned, executable authoring vocabulary for every cataloged action.
//!
//! The fixture is a deliberately narrowed projection of Providence's audited opcode
//! crosswalk. It excludes generated reports and runtime artifacts while retaining the
//! author labels, explanations, target families, and evidence status used by forms.

use super::{ActionSemanticInventoryEntry, DONOR_COMMIT};
use serde::Deserialize;
use std::sync::OnceLock;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InventoryFixture {
    schema_version: u8,
    donor_commit: String,
    donor_paths: Vec<String>,
    actions: Vec<ActionSemanticInventoryEntry>,
}

static INVENTORY: OnceLock<InventoryFixture> = OnceLock::new();

pub fn semantic_inventory() -> &'static [ActionSemanticInventoryEntry] {
    &fixture().actions
}

pub(super) fn semantic_entry(opcode: i16) -> Option<&'static ActionSemanticInventoryEntry> {
    semantic_inventory()
        .iter()
        .find(|entry| entry.opcode == opcode)
}

pub(super) fn donor_paths() -> &'static [String] {
    &fixture().donor_paths
}

fn fixture() -> &'static InventoryFixture {
    INVENTORY.get_or_init(|| {
        let mut parsed: InventoryFixture = serde_json::from_str(include_str!(
            "fixtures/providence-56ac232c-action-semantics.json"
        ))
        .expect("pinned action semantic inventory must remain valid JSON");
        assert_eq!(
            parsed.schema_version, 2,
            "unsupported semantic inventory schema"
        );
        assert_eq!(parsed.donor_commit, DONOR_COMMIT, "semantic donor drift");
        reconcile_classic_fields(&mut parsed.actions);
        parsed
    })
}

fn reconcile_classic_fields(actions: &mut [ActionSemanticInventoryEntry]) {
    // newland.c:2573 enters branch/forcebranch; these are not unused gold words.
    if let Some(gold) = actions.iter_mut().find(|entry| entry.opcode == 33) {
        for (index, key, label) in [
            (2, "branchMode", "Branch Mode"),
            (3, "target", "Destination"),
            (4, "slot", "Code Position"),
        ] {
            let field = &mut gold.fields[index];
            field.internal_name = key.into();
            field.label = label.into();
            field.preserved = false;
        }
    }
}
