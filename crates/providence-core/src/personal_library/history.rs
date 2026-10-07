use serde::{Deserialize, Serialize};

use super::{LibraryChange, LibraryCommand, LibraryError, PersonalAsset, PersonalLibrary};
use crate::model::StableId;

const LIMIT: usize = 128;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct LibraryHistory {
    undo: Vec<Entry>,
    redo: Vec<Entry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
enum Entry {
    Asset {
        identity: StableId,
        before: Option<Box<PersonalAsset>>,
        after: Option<Box<PersonalAsset>>,
    },
    Collection {
        identity: StableId,
        name: String,
    },
}

pub(super) fn before(library: &PersonalLibrary, command: &LibraryCommand) -> Option<PersonalAsset> {
    let identity = match command {
        LibraryCommand::Rename { identity, .. }
        | LibraryCommand::Move { identity, .. }
        | LibraryCommand::Update { identity, .. }
        | LibraryCommand::Remove { identity } => identity,
        _ => return None,
    };
    library.asset(identity).cloned()
}

impl LibraryHistory {
    pub(super) fn counts(&self) -> (usize, usize) {
        (self.undo.len(), self.redo.len())
    }

    pub(super) fn validate(&self, library: &PersonalLibrary) -> Result<(), LibraryError> {
        if self.undo.len() + self.redo.len() > LIMIT {
            return Err(LibraryError::InvalidManifest);
        }
        // Validate both chains against their actual adjacent state, including collections.
        for undo in [true, false] {
            let mut state = library.clone();
            let count = if undo {
                self.undo.len()
            } else {
                self.redo.len()
            };
            for _ in 0..count {
                state.apply_history(undo)?;
            }
        }
        Ok(())
    }

    pub(super) fn record(&mut self, before: Option<PersonalAsset>, change: &LibraryChange) {
        let entry = match change {
            LibraryChange::Upsert { asset } => Entry::Asset {
                identity: asset.identity.clone(),
                before: before.map(Box::new),
                after: Some(asset.clone()),
            },
            LibraryChange::Removed { identity } => Entry::Asset {
                identity: identity.clone(),
                before: before.map(Box::new),
                after: None,
            },
            LibraryChange::Collection { identity, name } => Entry::Collection {
                identity: identity.clone(),
                name: name.clone(),
            },
            LibraryChange::CollectionRemoved { .. } => return,
        };
        self.undo.push(entry);
        if self.undo.len() > LIMIT {
            self.undo.remove(0);
        }
        self.redo.clear();
    }
}

impl PersonalLibrary {
    pub(super) fn apply_history(&mut self, undo: bool) -> Result<LibraryChange, LibraryError> {
        let entry = (if undo {
            &self.history.undo
        } else {
            &self.history.redo
        })
        .last()
        .cloned()
        .ok_or(LibraryError::NoHistory)?;
        let change = match &entry {
            Entry::Asset {
                identity,
                before,
                after,
            } => {
                let expected = if undo { after } else { before };
                if self.assets.get(identity) != expected.as_deref() {
                    return Err(LibraryError::InvalidManifest);
                }
                self.restore_asset(identity, if undo { before } else { after }.as_deref())?
            }
            Entry::Collection { identity, name } => {
                super::valid_identity(identity)?;
                super::valid_name(name)?;
                if undo {
                    if self
                        .assets
                        .values()
                        .any(|asset| asset.collection.as_ref() == Some(identity))
                    {
                        return Err(LibraryError::InvalidManifest);
                    }
                    if self.collections.get(identity) != Some(name) {
                        return Err(LibraryError::InvalidManifest);
                    }
                    self.collections.remove(identity);
                    LibraryChange::CollectionRemoved {
                        identity: identity.clone(),
                    }
                } else {
                    if self.collections.contains_key(identity) {
                        return Err(LibraryError::DuplicateIdentity);
                    }
                    self.collections.insert(identity.clone(), name.clone());
                    LibraryChange::Collection {
                        identity: identity.clone(),
                        name: name.clone(),
                    }
                }
            }
        };
        if undo {
            self.history.undo.pop();
            self.history.redo.push(entry);
        } else {
            self.history.redo.pop();
            self.history.undo.push(entry);
        }
        Ok(change)
    }

    fn restore_asset(
        &mut self,
        identity: &StableId,
        asset: Option<&PersonalAsset>,
    ) -> Result<LibraryChange, LibraryError> {
        if let Some(asset) = asset {
            if &asset.identity != identity {
                return Err(LibraryError::InvalidManifest);
            }
            self.validate_asset(asset)?;
            self.assets.insert(identity.clone(), asset.clone());
            Ok(LibraryChange::Upsert {
                asset: Box::new(asset.clone()),
            })
        } else {
            self.assets.remove(identity);
            Ok(LibraryChange::Removed {
                identity: identity.clone(),
            })
        }
    }
}
