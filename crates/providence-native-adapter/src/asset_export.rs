//! Read-only catalog selection; export review binds ownership and exact payloads.
mod catalog;
mod conversion;
mod original;
#[cfg(test)]
mod tests;
mod writing;

use crate::{catalogs::CatalogViews, request_params::required_string};
use providence_core::{model::AssetDescriptor, session::EditorSession};
use providence_storage::ProjectStore;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

const OUTPUT_CONTRACT: &str = "original-and-converted-v2";

pub(super) const CATEGORIES: [(&str, &str); 10] = [
    ("pictures", "Pictures"),
    ("icons", "Icons"),
    ("portraits", "Portraits"),
    ("monster-artwork", "Monster artwork"),
    ("tilesets", "Map and battle tilesets"),
    ("special-land", "Special Land"),
    ("sounds", "Sounds"),
    ("music", "Music"),
    ("text", "Text and styles"),
    ("other", "Other resources"),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum Scope {
    Scenario,
    Library,
    Stock,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Selection {
    pub scopes: Vec<Scope>,
    pub categories: Vec<String>,
    pub identity: Option<String>,
    pub originals: bool,
    pub converted: bool,
}

#[derive(Clone, Serialize)]
struct Entry {
    pub scope: Scope,
    pub asset: AssetDescriptor,
    pub source_original: Option<SourceOriginal>,
    #[serde(skip)]
    pub store: catalog::StoreKind,
}

#[derive(Clone, Serialize)]
struct SourceOriginal {
    blob: providence_core::model::BlobId,
    byte_length: u64,
    mime_type: String,
}

pub(crate) fn dispatch(
    session: &EditorSession,
    project: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let inventory = catalog::Inventory::load(session, project, catalogs)?;
    match method {
        "asset-export.describe" => Ok(inventory.describe()),
        "asset-export.plan" => {
            let selection = selection(params)?;
            let entries = inventory.select(&selection)?;
            Ok(plan(&inventory, &selection, &entries))
        }
        "asset-export.write" => {
            let selection = selection(params)?;
            let entries = inventory.select(&selection)?;
            let prepared = plan(&inventory, &selection, &entries);
            if params["reviewHash"] != prepared["reviewHash"] {
                return Err("Assets or export options changed. Review the export again.".into());
            }
            writing::export(
                &inventory,
                &selection,
                &entries,
                &prepared,
                &required_string(params, "directory")?,
            )
        }
        _ => Err(format!("Unknown asset export command '{method}'")),
    }
}

fn selection(params: &Value) -> Result<Selection, String> {
    let mut selected: Selection = serde_json::from_value(params["selection"].clone())
        .map_err(|e| format!("Choose export scopes, categories and formats: {e}"))?;
    selected.scopes.sort();
    selected.scopes.dedup();
    selected.categories.sort();
    selected.categories.dedup();
    if selected.scopes.is_empty() || selected.categories.is_empty() {
        return Err("Select at least one scope and category.".into());
    }
    if !selected.originals && !selected.converted {
        return Err("Select original files, converted files, or both.".into());
    }
    if selected
        .categories
        .iter()
        .any(|id| !CATEGORIES.iter().any(|(key, _)| key == id))
    {
        return Err("An export category is unavailable. Reopen the export dialog.".into());
    }
    if selected.identity.is_some() && selected.scopes.len() != 1 {
        return Err("Individual export requires one source scope.".into());
    }
    Ok(selected)
}

fn plan(inventory: &catalog::Inventory<'_>, selected: &Selection, entries: &[Entry]) -> Value {
    let intent = json!({"outputContract":OUTPUT_CONTRACT,"selection":selected,"revision":inventory.revision,
        "libraryRevision":inventory.library_revision,"entries":entries});
    let hash = format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&intent).expect("export intent"))
    );
    let convertible = entries
        .iter()
        .filter(|entry| conversion::extension(&entry.asset).is_some())
        .count();
    json!({"reviewHash":hash,"revision":inventory.revision,"libraryRevision":inventory.library_revision,
        "assets":entries.len(),"convertible":convertible,
        "unsupportedConversions":if selected.converted { entries.len()-convertible } else {0},
        "categories":CATEGORIES.iter().map(|(id,label)| json!({"id":id,"label":label,
            "count":entries.iter().filter(|entry| catalog::category(&entry.asset)==*id).count()})).collect::<Vec<_>>(),
        "selectionLabel":if selected.identity.is_some() { entries[0].asset.label.clone() } else { "Selected asset categories".into() }})
}
