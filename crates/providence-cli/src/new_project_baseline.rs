//! Explicit application inputs initialize a new authored project, never an imported annex.
use providence_core::{codecs::*, model::*};
use providence_storage::ProjectStore;
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fs, path::Path};

pub(crate) struct Baseline {
    pub snapshot: ProjectSnapshot,
    blobs: BTreeMap<BlobId, Vec<u8>>,
}

impl Baseline {
    pub fn read(project_id: &str, root: &Path) -> Result<Self, String> {
        let mut baseline = Self {
            snapshot: ProjectSnapshot::new_authored(StableId(project_id.into())),
            blobs: BTreeMap::new(),
        };
        baseline.rules(root)?;
        baseline.items_and_spells(root)?;
        baseline.empty_scenario_items()?;
        baseline.terrain(root)?;
        baseline.snapshot.scenario_application = Some(ScenarioApplicationContract::default());
        baseline.snapshot.normalize();
        Ok(baseline)
    }

    fn source(&mut self, root: &Path, name: &str) -> Result<(Vec<u8>, BlobId), String> {
        let bytes = fs::read(root.join(name))
            .map_err(|error| format!("Could not read new-project support {name}: {error}"))?;
        let id = BlobId(format!("sha256:{:x}", Sha256::digest(&bytes)));
        self.blobs.insert(id.clone(), bytes.clone());
        Ok((bytes, id))
    }

    fn rules(&mut self, root: &Path) -> Result<(), String> {
        let (race, race_id) = self.source(root, "Data Race")?;
        let (caste, caste_id) = self.source(root, "Data Caste")?;
        let mut races = decode_race_rules(&race, Some(race_id));
        let mut castes = decode_caste_rules(&caste, Some(caste_id));
        if races.rules.len() != 30 || castes.rules.len() != 30 {
            return Err("New-project support requires all thirty Race and Caste records.".into());
        }
        derive_caste_eligibility(&races.rules, &mut castes.rules)
            .map_err(|error| error.to_string())?;
        let (names, names_id) = self.source(root, "Custom Names.rsrc")?;
        let names =
            decode_rule_name_catalog(&names, "Data Files/Custom Names.rsrc".into(), names_id)
                .map_err(|error| error.to_string())?;
        for (rule, name) in races.rules.iter_mut().zip(&names.race_names) {
            rule.definition.name = name.clone();
        }
        for (rule, name) in castes.rules.iter_mut().zip(&names.caste_names) {
            rule.definition.name = name.clone();
        }
        self.snapshot.race_rules = races.rules;
        self.snapshot.caste_rules = castes.rules;
        self.snapshot.rule_names = Some(names);
        Ok(())
    }

    fn items_and_spells(&mut self, root: &Path) -> Result<(), String> {
        let (items, items_id) = self.source(root, "Data ID")?;
        let (text, text_id) = self.source(root, "Data ID.rsrc")?;
        self.snapshot.item_rules = decode_standard_item_rules(&items, &text, items_id, text_id)
            .map_err(|error| error.to_string())?
            .rules;
        let (spells, spells_id) = self.source(root, "Data S")?;
        if spells.len() < STANDARD_SPELL_BYTES {
            return Err("New-project support requires all 420 standard spells.".into());
        }
        let (names, names_id) = self.source(root, "Custom Names.rsrc")?;
        let mut spells = decode_standard_spells(&spells, Some(spells_id));
        hydrate_standard_spell_names(&mut spells.spells, &names, names_id)
            .map_err(|error| error.to_string())?;
        self.snapshot.standard_spells = spells.spells;
        Ok(())
    }

    fn terrain(&mut self, root: &Path) -> Result<(), String> {
        for (look, name) in [
            (-1, "Combat Data BD"),
            (0, "Data P BD"),
            (3, "Data SUB BD"),
            (4, "Data Castle BD"),
            (5, "Data Desert BD"),
            (9, "Data Swamp BD"),
            (10, "Data Snow BD"),
        ] {
            let (bytes, id) = self.source(root, name)?;
            if bytes.len() != MAPSTATS_REFERENCE_BYTES {
                return Err(format!(
                    "New-project support {name} requires its complete {MAPSTATS_REFERENCE_BYTES} bytes."
                ));
            }
            let decoded = decode_landlook_mapstats(&bytes, look, name, id)
                .map_err(|error| error.to_string())?;
            self.snapshot.terrain_catalog.extend(decoded.profiles);
            self.snapshot.landlook_catalogs.push(decoded.catalog);
        }
        Ok(())
    }

    fn empty_scenario_items(&mut self) -> Result<(), String> {
        // The fresh scenario owns this empty native family; application placeholders never supply its mechanics.
        let bytes = vec![0; ITEM_RECORD_BYTES * SCENARIO_ITEM_DEFINITIONS];
        let id = BlobId(format!("sha256:{:x}", Sha256::digest(&bytes)));
        self.snapshot.scenario_item_rules =
            decode_scenario_item_rules(&bytes, None, id.clone(), None)
                .map_err(|error| error.to_string())?
                .rules;
        self.blobs.insert(id, bytes);
        Ok(())
    }

    pub fn create(self, directory: &str) -> Result<ProjectStore, String> {
        // Source validation requires blobs before the initialized snapshot can be committed.
        let empty = ProjectSnapshot::new_authored(self.snapshot.project_id.clone());
        let store =
            ProjectStore::create_new(directory, &empty).map_err(|error| error.to_string())?;
        for (expected, bytes) in self.blobs {
            let actual = store.put_blob(&bytes).map_err(|error| format!("New project was created at {directory}, but its support could not be stored: {error}"))?;
            if actual != expected {
                return Err("Stored new-project support identity changed.".into());
            }
        }
        store.save_snapshot(&self.snapshot).map_err(|error| {
            format!("New project was created at {directory}, but initialization failed: {error}")
        })?;
        store
            .rebuild_index(&self.snapshot)
            .map_err(|error| error.to_string())?;
        Ok(store)
    }
}

#[cfg(test)]
#[path = "new_project_baseline_tests.rs"]
mod tests;
