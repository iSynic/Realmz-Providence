use super::*;
use providence_core::model::{BlobId, StableId};
use std::collections::BTreeSet;
use std::path::Path;

#[derive(Clone, Copy)]
pub(super) enum StoreKind {
    Project,
    Personal,
    Reference,
    Application,
}

pub(super) struct Inventory<'a> {
    pub revision: u64,
    pub library_revision: Option<u64>,
    pub entries: Vec<Entry>,
    project: Option<&'a ProjectStore>,
    catalogs: CatalogViews<'a>,
    configured: Vec<Scope>,
}

impl<'a> Inventory<'a> {
    pub fn load(
        session: &EditorSession,
        project: Option<&'a ProjectStore>,
        catalogs: CatalogViews<'a>,
    ) -> Result<Self, String> {
        let mut inventory = Self {
            revision: session.revision().0,
            library_revision: None,
            entries: Vec::new(),
            project,
            catalogs,
            configured: Vec::new(),
        };
        if project.is_some() {
            inventory.configured.push(Scope::Scenario);
            for asset in &session.snapshot().assets {
                inventory.push(Scope::Scenario, asset.clone(), StoreKind::Project);
            }
        }
        inventory.library()?;
        if let Some(catalog) = catalogs.application_media {
            inventory.configured.push(Scope::Stock);
            for entry in &catalog.assets {
                inventory.push(
                    Scope::Stock,
                    entry.descriptor.clone(),
                    StoreKind::Application,
                );
            }
        }
        inventory
            .entries
            .sort_by(|a, b| (a.scope, &a.asset.identity).cmp(&(b.scope, &b.asset.identity)));
        let mut seen = BTreeSet::new();
        for entry in &inventory.entries {
            if !seen.insert((entry.scope, entry.asset.identity.clone())) {
                return Err(format!(
                    "Asset '{}' has ambiguous catalog identity.",
                    entry.asset.identity.0
                ));
            }
        }
        Ok(inventory)
    }

    fn library(&mut self) -> Result<(), String> {
        if self.catalogs.personal_library.is_some() || self.catalogs.reference_catalog.is_some() {
            self.configured.push(Scope::Library);
        }
        if let Some(store) = self.catalogs.personal_library {
            let library = store.load_manifest().map_err(|e| e.to_string())?;
            self.library_revision = Some(library.revision());
            for entry in library.assets() {
                if let Some(media) = &entry.media {
                    let mut primary = media.primary.clone();
                    primary.identity = entry.identity.clone();
                    primary.label = entry.name.clone();
                    self.push(Scope::Library, primary, StoreKind::Personal);
                    self.entries
                        .last_mut()
                        .expect("personal entry")
                        .source_original = Some(SourceOriginal {
                        blob: entry.original.clone(),
                        byte_length: entry.byte_length,
                        mime_type: entry.mime_type.clone(),
                    });
                    if let Some(companion) = &media.companion {
                        let mut asset = companion.clone();
                        asset.identity = StableId(format!("{}:companion", entry.identity.0));
                        self.push(Scope::Library, asset, StoreKind::Personal);
                    }
                } else {
                    self.push(Scope::Library, original_asset(entry), StoreKind::Personal);
                }
            }
        }
        if let Some(catalog) = self.catalogs.reference_catalog {
            for entry in &catalog.assets {
                self.push(
                    Scope::Library,
                    entry.descriptor.clone(),
                    StoreKind::Reference,
                );
            }
        }
        Ok(())
    }

    fn push(&mut self, scope: Scope, asset: AssetDescriptor, store: StoreKind) {
        self.entries.push(Entry {
            scope,
            asset,
            source_original: None,
            store,
        });
    }

    pub fn select(&self, selection: &Selection) -> Result<Vec<Entry>, String> {
        if selection.scopes.contains(&Scope::Stock) {
            let store = self
                .catalogs
                .application_media_store
                .ok_or("Stock library unavailable")?;
            let current = store.load_catalog().map_err(|error| error.to_string())?;
            if self.catalogs.application_media != Some(&current) {
                return Err("Stock catalog changed; reopen before exporting.".into());
            }
        }
        if selection
            .scopes
            .iter()
            .any(|scope| !self.configured.contains(scope))
        {
            return Err(
                "A selected source is unavailable. Open its scenario or library first.".into(),
            );
        }
        let entries: Vec<_> = self
            .entries
            .iter()
            .filter(|entry| {
                selection.scopes.contains(&entry.scope)
                    && selection
                        .categories
                        .iter()
                        .any(|id| id == category(&entry.asset))
                    && self.individual_match(entry, selection)
            })
            .cloned()
            .collect();
        if entries.is_empty() {
            return Err("No assets match the selected export options.".into());
        }
        Ok(entries)
    }

    fn individual_match(&self, entry: &Entry, selection: &Selection) -> bool {
        let Some(id) = &selection.identity else {
            return true;
        };
        if entry.asset.identity.0 == *id || entry.asset.identity.0 == format!("{id}:companion") {
            return true;
        }
        let Some(primary) = self
            .entries
            .iter()
            .find(|candidate| candidate.scope == entry.scope && candidate.asset.identity.0 == *id)
        else {
            return false;
        };
        let (Some(key), Some(paired)) = (
            &primary.asset.classic_resource,
            &entry.asset.classic_resource,
        ) else {
            return false;
        };
        entry.scope == Scope::Scenario
            && key.resource_id == paired.resource_id
            && matches!(
                (key.resource_type.as_str(), paired.resource_type.as_str()),
                ("TEXT", "styl") | ("styl", "TEXT")
            )
    }

    pub fn describe(&self) -> Value {
        let scopes = [Scope::Scenario, Scope::Library, Scope::Stock];
        json!({"revision":self.revision,"libraryRevision":self.library_revision,
            "scopes":scopes.iter().map(|scope|json!({"id":scope,
                "configured":self.configured.contains(scope),"total":self.entries.iter().filter(|e|e.scope==*scope).count()})).collect::<Vec<_>>(),
            "categories":CATEGORIES.iter().map(|(id,label)|json!({"id":id,"label":label,
                "counts":scopes.iter().map(|scope|
                    json!({"scope":scope,"count":self.entries.iter().filter(|e| e.scope==*scope && category(&e.asset)==*id).count()})).collect::<Vec<_>>()
            })).collect::<Vec<_>>()})
    }

    pub fn read(&self, entry: &Entry, blob: &BlobId, expected: u64) -> Result<Vec<u8>, String> {
        if expected > 64 * 1024 * 1024 {
            return Err("Asset exceeds the 64 MiB export limit.".into());
        }
        let bytes = match entry.store {
            StoreKind::Project => self
                .project
                .ok_or("Scenario store unavailable")?
                .read_blob(blob),
            StoreKind::Personal => self
                .catalogs
                .personal_library
                .ok_or("Personal library unavailable")?
                .read_original(blob),
            StoreKind::Reference => self
                .catalogs
                .reference_catalog_store
                .ok_or("Supplied library unavailable")?
                .read_blob(blob),
            StoreKind::Application => self
                .catalogs
                .application_media_store
                .ok_or("Stock library unavailable")?
                .read_blob(blob),
        }
        .map_err(|e| e.to_string())?;
        if bytes.len() as u64 != expected {
            return Err("Asset payload length differs from its catalog.".into());
        }
        Ok(bytes)
    }

    pub fn source_roots(&self) -> Vec<&Path> {
        [
            self.project.map(ProjectStore::root),
            self.catalogs.personal_library.map(|s| s.root()),
            self.catalogs.reference_catalog_store.map(|s| s.root()),
            self.catalogs.application_media_store.map(|s| s.root()),
        ]
        .into_iter()
        .flatten()
        .collect()
    }
}

pub(super) fn category(asset: &AssetDescriptor) -> &'static str {
    match asset.kind.as_str() {
        "picture" => "pictures",
        "portrait" => "portraits",
        "combat-icon" | "monster-icon" => "monster-artwork",
        "tileset" => "tilesets",
        "special-land-tile" => "special-land",
        "sound" => "sounds",
        "music" => "music",
        "icon" | "bag-item" | "vault-icon" => "icons",
        "text-resource" | "text-style-resource" => "text",
        _ => "other",
    }
}

fn original_asset(entry: &providence_core::personal_library::PersonalAsset) -> AssetDescriptor {
    let kind = entry.import_kind.clone().unwrap_or_else(|| {
        match entry.mime_type.as_str() {
            "image/png" => "picture",
            "audio/wav" => "sound",
            "text/plain" => "text-resource",
            _ => "original",
        }
        .into()
    });
    AssetDescriptor {
        identity: entry.identity.clone(),
        label: entry.name.clone(),
        kind,
        mime_type: Some(entry.mime_type.clone()),
        blob: entry.original.clone(),
        byte_length: entry.byte_length,
        classic_resource: None,
        scenario_music_slot: None,
        classic_payload_blob: None,
        classic_payload_byte_length: None,
        extension: None,
        width: None,
        height: None,
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: "personal-original".into(),
    }
}
