//! Authored personal media, independent of scenarios and supplied catalogs.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::model::{BlobId, StableId};

#[cfg(test)]
mod authoring_tests;
mod history;
mod media;
use history::LibraryHistory;
pub use media::PersonalMedia;

pub const PERSONAL_LIBRARY_VERSION: u32 = 2;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonalAsset {
    pub identity: StableId,
    pub name: String,
    pub collection: Option<StableId>,
    pub original: BlobId,
    pub byte_length: u64,
    pub mime_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media: Option<PersonalMedia>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub import_kind: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonalLibrary {
    format_version: u32,
    revision: u64,
    collections: BTreeMap<StableId, String>,
    assets: BTreeMap<StableId, PersonalAsset>,
    #[serde(default)]
    history: LibraryHistory,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LibraryCommand {
    CreateCollection {
        identity: StableId,
        name: String,
    },
    Import(Box<PersonalAsset>),
    Rename {
        identity: StableId,
        name: String,
    },
    Move {
        identity: StableId,
        collection: Option<StableId>,
    },
    Update {
        identity: StableId,
        name: String,
        collection: Option<StableId>,
    },
    Remove {
        identity: StableId,
    },
    Undo,
    Redo,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum LibraryChange {
    Collection { identity: StableId, name: String },
    CollectionRemoved { identity: StableId },
    Upsert { asset: Box<PersonalAsset> },
    Removed { identity: StableId },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryDelta {
    pub revision: u64,
    pub change: LibraryChange,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LibraryError {
    StaleRevision { expected: u64, actual: u64 },
    RevisionExhausted,
    InvalidManifest,
    InvalidName,
    InvalidIdentity,
    InvalidOriginal,
    DuplicateIdentity,
    MissingAsset,
    MissingCollection,
    InvalidMedia,
    NoHistory,
}

impl Default for PersonalLibrary {
    fn default() -> Self {
        Self {
            format_version: PERSONAL_LIBRARY_VERSION,
            revision: 0,
            collections: BTreeMap::new(),
            assets: BTreeMap::new(),
            history: LibraryHistory::default(),
        }
    }
}

impl PersonalLibrary {
    pub fn revision(&self) -> u64 {
        self.revision
    }

    pub fn asset(&self, identity: &StableId) -> Option<&PersonalAsset> {
        self.assets.get(identity)
    }

    pub fn assets(&self) -> impl Iterator<Item = &PersonalAsset> {
        self.assets.values()
    }

    pub fn collections(&self) -> impl Iterator<Item = (&StableId, &String)> {
        self.collections.iter()
    }

    pub fn history_counts(&self) -> (usize, usize) {
        self.history.counts()
    }

    pub fn validate(&self) -> Result<(), LibraryError> {
        if ![1, PERSONAL_LIBRARY_VERSION].contains(&self.format_version) {
            return Err(LibraryError::InvalidManifest);
        }
        self.history.validate(self)?;
        for (identity, name) in &self.collections {
            valid_identity(identity)?;
            valid_name(name)?;
        }
        for (identity, asset) in &self.assets {
            if identity != &asset.identity {
                return Err(LibraryError::InvalidManifest);
            }
            self.validate_asset(asset)?;
        }
        Ok(())
    }

    fn validate_collection(&self, collection: &Option<StableId>) -> Result<(), LibraryError> {
        if collection
            .as_ref()
            .is_some_and(|id| !self.collections.contains_key(id))
        {
            return Err(LibraryError::MissingCollection);
        }
        Ok(())
    }

    fn validate_asset(&self, asset: &PersonalAsset) -> Result<(), LibraryError> {
        valid_identity(&asset.identity)?;
        valid_name(&asset.name)?;
        self.validate_collection(&asset.collection)?;
        if !valid_blob(&asset.original)
            || asset.byte_length == 0
                && asset.import_kind.as_deref() != Some("text-resource")
                && !asset
                    .media
                    .as_ref()
                    .is_some_and(|media| media.primary.kind == "text-resource")
            || asset.mime_type.trim().is_empty()
        {
            return Err(LibraryError::InvalidOriginal);
        }
        if asset.import_kind.as_deref().is_some_and(|kind| {
            !matches!(
                kind,
                "icon"
                    | "picture"
                    | "sound"
                    | "special-land-tile"
                    | "text-resource"
                    | "combat-icon"
            )
        }) {
            return Err(LibraryError::InvalidMedia);
        }
        if let Some(media) = &asset.media {
            media.validate()?;
        }
        Ok(())
    }

    pub fn apply(
        &mut self,
        expected: u64,
        command: LibraryCommand,
    ) -> Result<LibraryDelta, LibraryError> {
        if expected != self.revision {
            return Err(LibraryError::StaleRevision {
                expected,
                actual: self.revision,
            });
        }
        let revision = self
            .revision
            .checked_add(1)
            .ok_or(LibraryError::RevisionExhausted)?;
        if matches!(command, LibraryCommand::Undo | LibraryCommand::Redo) {
            let change = self.apply_history(matches!(command, LibraryCommand::Undo))?;
            self.revision = revision;
            self.format_version = PERSONAL_LIBRARY_VERSION;
            return Ok(LibraryDelta { revision, change });
        }
        let before = history::before(self, &command);
        let change = self.apply_command(command)?;
        self.history.record(before, &change);
        self.format_version = PERSONAL_LIBRARY_VERSION;
        self.revision = revision;
        Ok(LibraryDelta { revision, change })
    }

    fn asset_mut(&mut self, identity: &StableId) -> Result<&mut PersonalAsset, LibraryError> {
        self.assets
            .get_mut(identity)
            .ok_or(LibraryError::MissingAsset)
    }

    fn update_metadata(
        &mut self,
        identity: &StableId,
        name: String,
        collection: Option<StableId>,
    ) -> Result<LibraryChange, LibraryError> {
        valid_name(&name)?;
        self.validate_collection(&collection)?;
        let asset = self.asset_mut(identity)?;
        asset.name = name;
        asset.collection = collection;
        Ok(LibraryChange::Upsert {
            asset: Box::new(asset.clone()),
        })
    }

    fn apply_command(&mut self, command: LibraryCommand) -> Result<LibraryChange, LibraryError> {
        Ok(match command {
            LibraryCommand::CreateCollection { identity, name } => {
                valid_identity(&identity)?;
                valid_name(&name)?;
                if self.collections.contains_key(&identity) {
                    return Err(LibraryError::DuplicateIdentity);
                }
                self.collections.insert(identity.clone(), name.clone());
                LibraryChange::Collection { identity, name }
            }
            LibraryCommand::Import(asset) => {
                self.validate_asset(&asset)?;
                if self.assets.contains_key(&asset.identity) {
                    return Err(LibraryError::DuplicateIdentity);
                }
                self.assets.insert(asset.identity.clone(), *asset.clone());
                LibraryChange::Upsert { asset }
            }
            LibraryCommand::Rename { identity, name } => {
                valid_name(&name)?;
                let asset = self.asset_mut(&identity)?;
                asset.name = name;
                LibraryChange::Upsert {
                    asset: Box::new(asset.clone()),
                }
            }
            LibraryCommand::Move {
                identity,
                collection,
            } => {
                self.validate_collection(&collection)?;
                let asset = self.asset_mut(&identity)?;
                asset.collection = collection;
                LibraryChange::Upsert {
                    asset: Box::new(asset.clone()),
                }
            }
            LibraryCommand::Update {
                identity,
                name,
                collection,
            } => self.update_metadata(&identity, name, collection)?,
            LibraryCommand::Remove { identity } => {
                self.assets
                    .remove(&identity)
                    .ok_or(LibraryError::MissingAsset)?;
                LibraryChange::Removed { identity }
            }
            LibraryCommand::Undo | LibraryCommand::Redo => return Err(LibraryError::NoHistory),
        })
    }
}

fn valid_blob(blob: &BlobId) -> bool {
    let digest = blob.0.strip_prefix("sha256:").unwrap_or_default();
    digest.len() == 64
        && digest
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn valid_name(value: &str) -> Result<(), LibraryError> {
    if value.trim().is_empty() || value.len() > 256 || value.chars().any(char::is_control) {
        Err(LibraryError::InvalidName)
    } else {
        Ok(())
    }
}

fn valid_identity(value: &StableId) -> Result<(), LibraryError> {
    if value.0.trim().is_empty() || value.0.len() > 256 || value.0.chars().any(char::is_control) {
        Err(LibraryError::InvalidIdentity)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: &str) -> PersonalAsset {
        PersonalAsset {
            identity: StableId(id.into()),
            name: "Woodland token".into(),
            collection: None,
            original: BlobId(format!("sha256:{}", "a".repeat(64))),
            byte_length: 42,
            mime_type: "image/png".into(),
            media: None,
            import_kind: None,
        }
    }

    #[test]
    fn personal_original_needs_neither_scenario_nor_classic_resource() {
        let mut library = PersonalLibrary::default();
        library.validate().unwrap();
        let original = entry("personal:1");
        let delta = library
            .apply(0, LibraryCommand::Import((original.clone()).into()))
            .unwrap();
        assert_eq!(delta.revision, 1);
        assert_eq!(
            delta.change,
            LibraryChange::Upsert {
                asset: original.into()
            }
        );
        let bytes = serde_json::to_vec(&library).unwrap();
        let reopened: PersonalLibrary = serde_json::from_slice(&bytes).unwrap();
        reopened.validate().unwrap();
        assert_eq!(serde_json::to_vec(&reopened).unwrap(), bytes);
    }

    #[test]
    fn metadata_commands_preserve_original_and_return_only_changed_entry() {
        let mut library = PersonalLibrary::default();
        let original = entry("personal:1");
        library
            .apply(0, LibraryCommand::Import((original.clone()).into()))
            .unwrap();
        let collection = StableId("collection:forest".into());
        library
            .apply(
                1,
                LibraryCommand::CreateCollection {
                    identity: collection.clone(),
                    name: "Forest".into(),
                },
            )
            .unwrap();
        library
            .apply(
                2,
                LibraryCommand::Rename {
                    identity: original.identity.clone(),
                    name: "Trail token".into(),
                },
            )
            .unwrap();
        library
            .apply(
                3,
                LibraryCommand::Move {
                    identity: original.identity.clone(),
                    collection: Some(collection),
                },
            )
            .unwrap();
        assert_eq!(
            library.asset(&original.identity).unwrap().original,
            original.original
        );
        assert_eq!(
            library
                .apply(
                    4,
                    LibraryCommand::Remove {
                        identity: original.identity.clone()
                    }
                )
                .unwrap()
                .change,
            LibraryChange::Removed {
                identity: original.identity
            }
        );
        assert_eq!(library.assets().count(), 0);
    }

    #[test]
    fn rejected_commands_preserve_revision_and_contents() {
        let mut library = PersonalLibrary::default();
        let asset = entry("personal:1");
        library
            .apply(0, LibraryCommand::Import((asset.clone()).into()))
            .unwrap();
        let before = library.clone();
        assert!(matches!(
            library.apply(
                0,
                LibraryCommand::Remove {
                    identity: asset.identity.clone()
                }
            ),
            Err(LibraryError::StaleRevision { .. })
        ));
        assert_eq!(
            library.apply(1, LibraryCommand::Import((asset.clone()).into())),
            Err(LibraryError::DuplicateIdentity)
        );
        assert_eq!(
            library.apply(
                1,
                LibraryCommand::Rename {
                    identity: asset.identity.clone(),
                    name: " ".into()
                }
            ),
            Err(LibraryError::InvalidName)
        );
        assert_eq!(
            library.apply(
                1,
                LibraryCommand::Move {
                    identity: asset.identity,
                    collection: Some(StableId("missing".into()))
                }
            ),
            Err(LibraryError::MissingCollection)
        );
        assert_eq!(library, before);
    }

    #[test]
    fn manifest_validation_rejects_wrong_version_and_broken_collection() {
        let mut library = PersonalLibrary::default();
        library.format_version += 1;
        assert_eq!(library.validate(), Err(LibraryError::InvalidManifest));
        library.format_version = PERSONAL_LIBRARY_VERSION;
        let mut asset = entry("personal:1");
        asset.collection = Some(StableId("missing".into()));
        library.assets.insert(asset.identity.clone(), asset);
        assert_eq!(library.validate(), Err(LibraryError::MissingCollection));
    }
}
