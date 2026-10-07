use crate::model::BlobId;
use crate::model::ClassicSourceBlob;
use crate::model::ProjectOrigin;
use crate::model::SourcedSpellDefinition;
use crate::model::SpellDefinition;
use crate::model::StableId;
use crate::session::EditorSession;
use crate::session::errors::SessionError;
use std::collections::BTreeSet;

impl EditorSession {
    pub(super) fn import_standard_spell_catalog(
        &mut self,
        sources: Vec<ClassicSourceBlob>,
        spells: Vec<SourcedSpellDefinition>,
    ) -> Result<Vec<StableId>, SessionError> {
        let data_sources = sources
            .iter()
            .filter(|source| source.native_path == "Data S")
            .collect::<Vec<_>>();
        let name_sources = sources
            .iter()
            .filter(|source| source.native_path == "Custom Names")
            .collect::<Vec<_>>();
        if sources.len() != 2
            || data_sources.len() != 1
            || data_sources[0].byte_length < crate::codecs::STANDARD_SPELL_BYTES as u64
            || name_sources.len() != 1
        {
            return Err(SessionError::InvalidClassicImport(
                "standard spells require one Data S source with 420 runtime records and one Custom Names resource source".into(),
            ));
        }
        let data_blob = &data_sources[0].blob;
        let name_blob = &name_sources[0].blob;
        if spells.len() != crate::codecs::STANDARD_SPELL_RECORDS
            || spells
                .iter()
                .any(|spell| spell.source_blob.as_ref() != Some(data_blob))
            || spells
                .iter()
                .any(|spell| spell.text_source_blob.as_ref() != Some(name_blob))
        {
            return Err(SessionError::InvalidClassicImport(
                "standard spells require 420 rows with consistent Data S and Custom Names source identities".into(),
            ));
        }
        validate_spell_identities(&spells, crate::codecs::standard_spell_classic_id)?;
        let identities = self
            .snapshot
            .standard_spells
            .iter()
            .chain(spells.iter())
            .map(|spell| spell.definition.id.clone())
            .collect::<BTreeSet<_>>();
        self.snapshot.classic_sources.retain(|source| {
            source.native_path != "Data S" && source.native_path != "Custom Names"
        });
        self.snapshot.classic_sources.extend(sources);
        self.snapshot.standard_spells = spells;
        self.snapshot.normalize();
        Ok(identities.into_iter().collect())
    }

    pub(super) fn import_classic_spell_slice(
        &mut self,
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        spells: Vec<SourcedSpellDefinition>,
    ) -> Result<Vec<StableId>, SessionError> {
        let spell_sources = sources
            .iter()
            .filter(|source| source.native_path == "Data Spell")
            .collect::<Vec<_>>();
        if spell_sources.len() != 1
            || spell_sources[0].byte_length < crate::codecs::SCENARIO_SPELL_BYTES as u64
        {
            return Err(SessionError::InvalidClassicImport(
                "Data Spell requires one source blob containing all 105 records".into(),
            ));
        }
        let spell_source = &spell_sources[0].blob;
        if spells.len() != crate::codecs::SCENARIO_SPELL_RECORDS
            || spells
                .iter()
                .any(|spell| spell.source_blob.as_ref() != Some(spell_source))
            || spells
                .iter()
                .any(|spell| spell.text_source_blob != spells[0].text_source_blob)
        {
            return Err(SessionError::InvalidClassicImport(
                "Data Spell requires 105 records with one consistent source identity".into(),
            ));
        }
        validate_spell_identities(&spells, crate::codecs::scenario_spell_classic_id)?;
        let identities = std::iter::once(self.snapshot.project_id.clone())
            .chain(
                self.snapshot
                    .scenario_spells
                    .iter()
                    .chain(spells.iter())
                    .map(|spell| spell.definition.id.clone()),
            )
            .collect::<BTreeSet<_>>();
        self.snapshot.origin = ProjectOrigin::Imported {
            compatibility_annex: annex_blob,
        };
        self.snapshot.classic_sources = sources;
        self.snapshot.scenario_spells = spells;
        self.snapshot.normalize();
        Ok(identities.into_iter().collect())
    }

    pub(super) fn update_scenario_spell(
        &mut self,
        record_index: u16,
        mut definition: SpellDefinition,
    ) -> Result<Vec<StableId>, SessionError> {
        let expected = crate::codecs::scenario_spell_classic_id(record_index).ok_or(
            SessionError::InvalidScenarioSpellIdentity {
                record_index,
                classic_id: definition.classic_id,
            },
        )?;
        crate::codecs::validate_scenario_spell_name(&definition).map_err(|error| {
            SessionError::InvalidScenarioSpell {
                record_index,
                reason: error.to_string(),
            }
        })?;
        if definition.record_index != record_index
            || definition.classic_id != expected
            || definition.id.0 != format!("classic.spell.{expected}")
        {
            return Err(SessionError::InvalidScenarioSpellIdentity {
                record_index,
                classic_id: definition.classic_id,
            });
        }
        let spell = self
            .snapshot
            .scenario_spells
            .iter_mut()
            .find(|spell| spell.definition.record_index == record_index)
            .ok_or(SessionError::ScenarioSpellNotFound(record_index))?;
        if spell.definition.name != definition.name {
            spell.name_authored = true;
        }
        definition.authored = true;
        let identity = definition.id.clone();
        spell.definition = definition;
        Ok(vec![identity])
    }
}

fn validate_spell_identities(
    spells: &[SourcedSpellDefinition],
    classic_id_for_record: fn(u16) -> Option<i16>,
) -> Result<(), SessionError> {
    let mut record_indexes = BTreeSet::new();
    let mut classic_ids = BTreeSet::new();
    for spell in spells {
        let definition = &spell.definition;
        let expected = classic_id_for_record(definition.record_index).ok_or(
            SessionError::InvalidScenarioSpellIdentity {
                record_index: definition.record_index,
                classic_id: definition.classic_id,
            },
        )?;
        if definition.classic_id != expected
            || definition.id.0 != format!("classic.spell.{expected}")
            || !record_indexes.insert(definition.record_index)
            || !classic_ids.insert(definition.classic_id)
        {
            return Err(SessionError::InvalidScenarioSpellIdentity {
                record_index: definition.record_index,
                classic_id: definition.classic_id,
            });
        }
    }
    Ok(())
}
