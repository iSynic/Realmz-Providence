//! Project-local author conveniences; these types never enter portable truth.
use crate::model::{LevelType, StableId};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

pub const RESOURCE_LIMIT: usize = 256;
pub mod builtins;
pub mod dungeon_cells;
pub mod geometry;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PaintResourceKind {
    Palette,
    Stamp,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PaintResourceCell {
    pub x: u8,
    pub y: u8,
    pub tile: i16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PaintResource {
    pub identity: StableId,
    pub name: String,
    pub collection: String,
    pub kind: PaintResourceKind,
    pub level_type: LevelType,
    pub tileset_id: StableId,
    pub width: u8,
    pub height: u8,
    pub cells: Vec<PaintResourceCell>,
    pub favorite: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PaintResources {
    pub revision: u64,
    pub entries: Vec<PaintResource>,
    pub recent: Vec<StableId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum PaintResourceChange {
    Create { resource: PaintResource },
    Replace { resource: PaintResource },
    Delete { identity: StableId },
    Remember { identity: StableId },
}

impl PaintResource {
    pub fn validate(&self) -> Result<(), String> {
        validate_text(&self.identity.0, 160, "identity")?;
        validate_text(&self.tileset_id.0, 160, "tileset identity")?;
        validate_text(&self.name, 80, "name")?;
        if self.collection.len() > 80 || self.collection.chars().any(char::is_control) {
            return Err(
                "Collection names must be at most 80 characters without control characters.".into(),
            );
        }
        if !(1..=32).contains(&self.width)
            || !(1..=32).contains(&self.height)
            || self.cells.is_empty()
            || self.cells.len() > 1024
        {
            return Err("Paint resources need 1–32 rows/columns and 1–1024 cells.".into());
        }
        let mut seen = BTreeSet::new();
        for cell in &self.cells {
            if cell.x >= self.width || cell.y >= self.height || !seen.insert((cell.x, cell.y)) {
                return Err("Resource cells must be unique and inside their dimensions.".into());
            }
            let valid = match self.level_type {
                LevelType::Land => {
                    (0..=200).contains(&cell.tile)
                        || self.kind == PaintResourceKind::Stamp && (-999..=-1).contains(&cell.tile)
                }
                LevelType::Dungeon => cell.tile as u16 & 0x9060 == 0,
            };
            if !valid || self.kind == PaintResourceKind::Palette && cell.tile == 0 {
                return Err(
                    "Resource cells contain unavailable terrain or managed markers.".into(),
                );
            }
        }
        if self.kind == PaintResourceKind::Palette && self.level_type != LevelType::Land {
            return Err("Tile palettes require a Land atlas.".into());
        }
        if self.kind == PaintResourceKind::Palette
            && self.cells.len() != usize::from(self.width) * usize::from(self.height)
        {
            return Err("Palette brushes require every cell in their rectangle.".into());
        }
        Ok(())
    }
}

impl PaintResources {
    pub fn validate(&self) -> Result<(), String> {
        if self.entries.len() > RESOURCE_LIMIT || self.recent.len() > 12 {
            return Err("The local paint collection exceeds its bounded capacity.".into());
        }
        let mut seen = BTreeSet::new();
        for entry in &self.entries {
            entry.validate()?;
            if entry.identity.0.starts_with("preset:") {
                return Err("Built-in identities cannot be used by local resources. Duplicate under a new identity.".into());
            }
            if !seen.insert(&entry.identity) {
                return Err("Paint identities must be unique.".into());
            }
        }
        let mut recent = BTreeSet::new();
        if self
            .recent
            .iter()
            .any(|id| !seen.contains(id) || !recent.insert(id))
        {
            return Err("Recent resources must name distinct existing entries.".into());
        }
        Ok(())
    }

    pub fn changed(&self, expected: u64, change: PaintResourceChange) -> Result<Self, String> {
        self.validate()?;
        if expected != self.revision {
            return Err("The local collection changed. Refresh before saving.".into());
        }
        let mut next = self.clone();
        let remember = matches!(&change, PaintResourceChange::Remember { .. });
        match change {
            PaintResourceChange::Create { resource } => {
                if next
                    .entries
                    .iter()
                    .any(|entry| entry.identity == resource.identity)
                {
                    return Err("That resource already exists. Use an explicit replacement or a new identity.".into());
                }
                next.entries.push(resource);
            }
            PaintResourceChange::Replace { resource } => {
                let current = next
                    .entries
                    .iter_mut()
                    .find(|entry| entry.identity == resource.identity)
                    .ok_or("The resource no longer exists.")?;
                *current = resource;
            }
            PaintResourceChange::Delete { identity } => {
                let index = next
                    .entries
                    .iter()
                    .position(|entry| entry.identity == identity)
                    .ok_or("The resource no longer exists.")?;
                next.entries.remove(index);
                next.recent.retain(|id| *id != identity);
            }
            PaintResourceChange::Remember { identity } => {
                if !next.entries.iter().any(|entry| entry.identity == identity) {
                    return Err("The resource no longer exists.".into());
                }
                next.recent.retain(|id| *id != identity);
                next.recent.insert(0, identity);
                next.recent.truncate(12);
            }
        }
        next.validate()?;
        if next == *self {
            if remember {
                return Ok(self.clone());
            }
            return Err("There are no collection changes to save.".into());
        }
        next.revision = self
            .revision
            .checked_add(1)
            .ok_or("The local revision is exhausted.")?;
        Ok(next)
    }
}

fn validate_text(value: &str, limit: usize, label: &str) -> Result<(), String> {
    if value.trim().is_empty() || value.len() > limit || value.chars().any(char::is_control) {
        return Err(format!(
            "The {label} must be nonempty, bounded and contain no control characters."
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests;
