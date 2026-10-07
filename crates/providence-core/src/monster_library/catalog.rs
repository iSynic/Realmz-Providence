use super::contracts::*;
use super::validation::validate_entry;
use crate::{model::StableId, session::Revision};
use std::collections::{BTreeMap, BTreeSet};
impl MonsterLibraryEntry {
    pub fn is_blank_builtin_placeholder(&self) -> bool {
        if self.ownership != MonsterLibraryOwnership::BuiltIn {
            return false;
        }
        let monster = &self.template;
        self.label.trim() == format!("Monster {}", self.preferred_scenario_monster_id.0)
            && self.description.trim().is_empty()
            && monster.hit_dice == 0
            && monster.stamina_bonus == 0
            && monster.agility == 0
            && monster.movement_max == 0
            && monster.armor == 0
            && monster.magic_resistance == 0
            && monster.required_weapon == 0
            && monster.size == 0
            && monster.attack_count == 0
            && monster.magic_attack_count == 0
            && monster.attacks.iter().flatten().all(|value| *value == 0)
            && monster.damage_bonus == 0
            && monster.cast_percent == 0
            && monster.run_percent == 0
            && monster.surrender_percent == 0
            && monster.missile_percent == 0
            && monster.money.iter().all(|value| *value == 0)
            && monster.spells.iter().all(|value| *value == 0)
            && monster.items.iter().all(|value| *value == 0)
            && monster.weapon == 0
            && monster.icon_id == 0
            && monster.spell_points == 0
            && monster.experience == 0
            && monster.saves.iter().all(|value| *value == 0)
            && monster.spell_immunities.iter().all(|value| *value == 0)
    }
}
impl MonsterLibraryCatalog {
    pub fn new(library_id: StableId) -> Self {
        Self {
            format_version: MONSTER_LIBRARY_FORMAT_VERSION,
            library_id,
            revision: Revision(0),
            next_custom_id: 1,
            sources: Vec::new(),
            built_ins: Vec::new(),
            custom_entries: Vec::new(),
        }
    }

    pub fn entry(&self, identity: &StableId) -> Option<&MonsterLibraryEntry> {
        self.custom_entries
            .iter()
            .chain(self.built_ins.iter())
            .find(|entry| entry.identity == *identity)
    }

    pub fn effective_entries(&self) -> Vec<&MonsterLibraryEntry> {
        let overrides = self
            .custom_entries
            .iter()
            .filter_map(|entry| match &entry.origin {
                MonsterLibraryOrigin::BuiltInOverride { source_entry } => {
                    Some((source_entry, entry))
                }
                _ => None,
            })
            .collect::<BTreeMap<_, _>>();
        let mut entries = self
            .built_ins
            .iter()
            .filter(|entry| !entry.is_blank_builtin_placeholder())
            .map(|entry| overrides.get(&entry.identity).copied().unwrap_or(entry))
            .collect::<Vec<_>>();
        entries.extend(
            self.custom_entries.iter().filter(|entry| {
                !matches!(entry.origin, MonsterLibraryOrigin::BuiltInOverride { .. })
            }),
        );
        entries.sort_by(|left, right| {
            left.preferred_scenario_monster_id
                .cmp(&right.preferred_scenario_monster_id)
                .then_with(|| left.label.cmp(&right.label))
                .then_with(|| left.identity.cmp(&right.identity))
        });
        entries
    }

    pub fn validate(&self) -> Result<(), MonsterLibraryError> {
        if self.format_version != MONSTER_LIBRARY_FORMAT_VERSION {
            return Err(MonsterLibraryError::InvalidCatalog(format!(
                "format version {} is not supported",
                self.format_version
            )));
        }
        if self.library_id.0.trim().is_empty() {
            return Err(MonsterLibraryError::InvalidCatalog(
                "library identity cannot be empty".into(),
            ));
        }
        let source_ids = self.validate_sources()?;
        self.validate_entry_identities()?;
        self.validate_built_ins(&source_ids)?;
        self.validate_custom_entries()?;
        Ok(())
    }

    fn validate_sources(&self) -> Result<BTreeSet<StableId>, MonsterLibraryError> {
        let mut source_ids = BTreeSet::new();
        for source in &self.sources {
            if !source_ids.insert(source.identity.clone()) {
                return Err(MonsterLibraryError::InvalidCatalog(format!(
                    "duplicate source identity '{}'",
                    source.identity.0
                )));
            }
            if source.record_bytes != MONSTER_SCRAPBOOK_RECORD_BYTES {
                return Err(MonsterLibraryError::InvalidCatalog(format!(
                    "source '{}' declares {}-byte rows; expected {}",
                    source.identity.0, source.record_bytes, MONSTER_SCRAPBOOK_RECORD_BYTES
                )));
            }
        }
        Ok(source_ids)
    }

    fn validate_entry_identities(&self) -> Result<(), MonsterLibraryError> {
        let mut entry_ids = BTreeSet::new();
        let mut override_targets = BTreeSet::new();
        for entry in self.built_ins.iter().chain(&self.custom_entries) {
            if !entry_ids.insert(entry.identity.clone()) {
                return Err(MonsterLibraryError::InvalidCatalog(format!(
                    "duplicate entry identity '{}'",
                    entry.identity.0
                )));
            }
            validate_entry(entry)?;
            if let MonsterLibraryOrigin::BuiltInOverride { source_entry } = &entry.origin
                && !override_targets.insert(source_entry.clone())
            {
                return Err(MonsterLibraryError::InvalidCatalog(format!(
                    "built-in '{}' has more than one custom override",
                    source_entry.0
                )));
            }
        }
        Ok(())
    }

    fn validate_built_ins(
        &self,
        source_ids: &BTreeSet<StableId>,
    ) -> Result<(), MonsterLibraryError> {
        for entry in &self.built_ins {
            if entry.ownership != MonsterLibraryOwnership::BuiltIn {
                return Err(MonsterLibraryError::InvalidCatalog(format!(
                    "built-in entry '{}' is not protected",
                    entry.identity.0
                )));
            }
            let MonsterLibraryOrigin::BuiltInScrapbook { source, .. } = &entry.origin else {
                return Err(MonsterLibraryError::InvalidCatalog(format!(
                    "built-in entry '{}' has invalid origin",
                    entry.identity.0
                )));
            };
            if !source_ids.contains(source) {
                return Err(MonsterLibraryError::InvalidCatalog(format!(
                    "built-in entry '{}' names missing source '{}'",
                    entry.identity.0, source.0
                )));
            }
        }
        Ok(())
    }

    fn validate_custom_entries(&self) -> Result<(), MonsterLibraryError> {
        for entry in &self.custom_entries {
            if entry.ownership != MonsterLibraryOwnership::Custom {
                return Err(MonsterLibraryError::InvalidCatalog(format!(
                    "custom entry '{}' is not editable",
                    entry.identity.0
                )));
            }
            if let MonsterLibraryOrigin::BuiltInOverride { source_entry } = &entry.origin
                && !self
                    .built_ins
                    .iter()
                    .any(|built_in| built_in.identity == *source_entry)
            {
                return Err(MonsterLibraryError::InvalidCatalog(format!(
                    "override '{}' names missing built-in '{}'",
                    entry.identity.0, source_entry.0
                )));
            }
        }
        Ok(())
    }
}
