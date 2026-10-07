use super::super::{contracts::*, validation::custom_entry};
use super::MonsterLibrarySession;
use crate::model::{MonsterRecord, NativeRecordId, StableId};
use std::collections::BTreeSet;
impl MonsterLibrarySession {
    pub(super) fn apply_command(
        &mut self,
        command: MonsterLibraryCommand,
    ) -> Result<Vec<StableId>, MonsterLibraryError> {
        match command {
            MonsterLibraryCommand::ImportBuiltIns { source, entries } => {
                self.import_built_ins(source, entries)
            }
            MonsterLibraryCommand::CreateCustom {
                label,
                preferred_scenario_monster_id,
                template,
                description,
                origin,
            } => self.create_custom(
                label,
                preferred_scenario_monster_id,
                *template,
                description,
                origin,
            ),
            MonsterLibraryCommand::ApplyDraft { draft } => self.apply_record_draft(draft),
            MonsterLibraryCommand::UpdateCustom {
                identity,
                label,
                preferred_scenario_monster_id,
                template,
                description,
            } => self.update_custom_record(
                identity,
                label,
                preferred_scenario_monster_id,
                *template,
                description,
            ),
            MonsterLibraryCommand::Duplicate { source, label } => self.duplicate(source, label),
            MonsterLibraryCommand::DeleteCustom { identity } => self.delete_custom(identity),
            MonsterLibraryCommand::CustomizeBuiltIn { source, label } => {
                self.customize_built_in(source, label)
            }
            MonsterLibraryCommand::RestoreBuiltIn { source } => self.restore_built_in(source),
            MonsterLibraryCommand::Undo | MonsterLibraryCommand::Redo => unreachable!(),
        }
    }

    fn import_built_ins(
        &mut self,
        source: MonsterLibrarySource,
        entries: Vec<MonsterLibraryEntry>,
    ) -> Result<Vec<StableId>, MonsterLibraryError> {
        let source_id = source.identity.clone();
        if entries.iter().any(|entry| {
            !matches!(
                &entry.origin,
                MonsterLibraryOrigin::BuiltInScrapbook { source, .. } if *source == source_id
            ) || entry.ownership != MonsterLibraryOwnership::BuiltIn
        }) {
            return Err(MonsterLibraryError::InvalidCatalog(
                "imported scrapbook entries do not belong to their protected source".into(),
            ));
        }
        self.catalog
            .sources
            .retain(|candidate| candidate.identity != source_id);
        let removed = self
            .catalog
            .built_ins
            .iter()
            .filter(|entry| {
                matches!(
                    &entry.origin,
                    MonsterLibraryOrigin::BuiltInScrapbook { source, .. } if *source == source_id
                )
            })
            .map(|entry| entry.identity.clone())
            .collect::<Vec<_>>();
        self.catalog.built_ins.retain(|entry| {
            !matches!(
                &entry.origin,
                MonsterLibraryOrigin::BuiltInScrapbook { source, .. } if *source == source_id
            )
        });
        self.catalog.sources.push(source);
        let mut changed = removed;
        changed.extend(entries.iter().map(|entry| entry.identity.clone()));
        self.catalog.built_ins.extend(entries);
        Ok(changed)
    }

    fn create_custom(
        &mut self,
        label: String,
        preferred_scenario_monster_id: NativeRecordId,
        template: MonsterRecord,
        description: String,
        origin: MonsterLibraryOrigin,
    ) -> Result<Vec<StableId>, MonsterLibraryError> {
        if matches!(origin, MonsterLibraryOrigin::BuiltInScrapbook { .. }) {
            return Err(MonsterLibraryError::ProtectedBuiltIn(
                "custom entries cannot claim built-in ownership".into(),
            ));
        }
        if let MonsterLibraryOrigin::BuiltInOverride { source_entry } = &origin
            && self.catalog.custom_entries.iter().any(|entry| {
                matches!(
                    &entry.origin,
                    MonsterLibraryOrigin::BuiltInOverride { source_entry: existing } if existing == source_entry
                )
            })
        {
            return Err(MonsterLibraryError::OverrideExists(source_entry.clone()));
        }
        let identity = self.next_custom_identity();
        let entry = custom_entry(
            identity.clone(),
            label,
            preferred_scenario_monster_id,
            template,
            description,
            origin,
        )?;
        self.catalog.custom_entries.push(entry);
        Ok(vec![identity])
    }

    fn duplicate(
        &mut self,
        source: StableId,
        label: String,
    ) -> Result<Vec<StableId>, MonsterLibraryError> {
        let source_entry = self
            .catalog
            .entry(&source)
            .cloned()
            .ok_or_else(|| MonsterLibraryError::EntryNotFound(source.clone()))?;
        let identity = self.next_custom_identity();
        let label = if label.trim().is_empty() {
            format!("{} Variant", source_entry.label)
        } else {
            label
        };
        let entry = custom_entry(
            identity.clone(),
            label,
            source_entry.preferred_scenario_monster_id,
            source_entry.template,
            source_entry.description,
            MonsterLibraryOrigin::LibraryVariant {
                source_entry: source,
            },
        )?;
        self.catalog.custom_entries.push(entry);
        Ok(vec![identity])
    }

    fn delete_custom(&mut self, identity: StableId) -> Result<Vec<StableId>, MonsterLibraryError> {
        let before = self.catalog.custom_entries.len();
        self.catalog
            .custom_entries
            .retain(|entry| entry.identity != identity);
        if self.catalog.custom_entries.len() == before {
            return Err(MonsterLibraryError::EntryNotFound(identity));
        }
        Ok(vec![identity])
    }

    fn customize_built_in(
        &mut self,
        source: StableId,
        label: Option<String>,
    ) -> Result<Vec<StableId>, MonsterLibraryError> {
        let built_in = self
            .catalog
            .built_ins
            .iter()
            .find(|entry| entry.identity == source)
            .cloned()
            .ok_or_else(|| MonsterLibraryError::EntryNotFound(source.clone()))?;
        if self.catalog.custom_entries.iter().any(|entry| {
            matches!(
                &entry.origin,
                MonsterLibraryOrigin::BuiltInOverride { source_entry } if *source_entry == source
            )
        }) {
            return Err(MonsterLibraryError::OverrideExists(source));
        }
        let identity = self.next_custom_identity();
        let entry = custom_entry(
            identity.clone(),
            label.unwrap_or_else(|| built_in.label.clone()),
            built_in.preferred_scenario_monster_id,
            built_in.template,
            built_in.description,
            MonsterLibraryOrigin::BuiltInOverride {
                source_entry: source,
            },
        )?;
        self.catalog.custom_entries.push(entry);
        Ok(vec![identity])
    }

    fn restore_built_in(&mut self, source: StableId) -> Result<Vec<StableId>, MonsterLibraryError> {
        if !self
            .catalog
            .built_ins
            .iter()
            .any(|entry| entry.identity == source)
        {
            return Err(MonsterLibraryError::EntryNotFound(source));
        }
        let overrides = self
            .catalog
            .custom_entries
            .iter()
            .filter(|entry| {
                matches!(
                    &entry.origin,
                    MonsterLibraryOrigin::BuiltInOverride { source_entry } if *source_entry == source
                )
            })
            .map(|entry| entry.identity.clone())
            .collect::<Vec<_>>();
        if overrides.is_empty() {
            return Err(MonsterLibraryError::OverrideNotFound(source));
        }
        let removed = overrides.iter().cloned().collect::<BTreeSet<_>>();
        self.catalog
            .custom_entries
            .retain(|entry| !removed.contains(&entry.identity));
        Ok(overrides)
    }
}
