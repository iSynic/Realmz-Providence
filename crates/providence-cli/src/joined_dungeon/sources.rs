use std::{fs, path::Path};

pub(super) struct ScenarioSources {
    pub(super) data_dl: Vec<u8>,
    pub(super) data_ld: Vec<u8>,
    pub(super) data_rd: Vec<u8>,
    pub(super) data_ddd: Vec<u8>,
    pub(super) data_rdd: Vec<u8>,
    pub(super) data_dd: Vec<u8>,
    pub(super) data_ed: Vec<u8>,
    pub(super) data_ed2: Vec<u8>,
    pub(super) data_edcd: Vec<u8>,
    pub(super) data_bd: Vec<u8>,
    pub(super) data_md: Vec<u8>,
    pub(super) data_sd2: Vec<u8>,
    pub(super) data_ed3: Vec<u8>,
    pub(super) data_td3: Vec<u8>,
    pub(super) data_td2: Vec<u8>,
    pub(super) data_ni: Vec<u8>,
    pub(super) data_td: Vec<u8>,
    pub(super) data_sd: Vec<u8>,
    pub(super) global: Vec<u8>,
    pub(super) scenario_resources: Vec<u8>,
    pub(super) data_spell: Option<Vec<u8>>,
    pub(super) data_spell_resources: Option<Vec<u8>>,
}

pub(super) struct SharedSources {
    pub(super) standard_item_bytes: Vec<u8>,
    pub(super) standard_item_text_bytes: Vec<u8>,
    pub(super) standard_spell_bytes: Vec<u8>,
    pub(super) custom_names_bytes: Vec<u8>,
}

pub(super) struct JoinedSources {
    pub(super) scenario: ScenarioSources,
    pub(super) shared: SharedSources,
}

impl JoinedSources {
    pub(super) fn load(directory: &Path) -> Result<Self, String> {
        let scenario = ScenarioSources::load(directory)?;
        if scenario.data_spell.is_none() && scenario.data_spell_resources.is_some() {
            return Err("Data Spell.rsrc exists without its Data Spell record file".into());
        }
        let Some(realmz_root) = directory.parent().and_then(Path::parent) else {
            return Err("scenario directory has no Realmz data root".into());
        };
        let shared = SharedSources::load(&realmz_root.join("Data Files"))?;
        Ok(Self { scenario, shared })
    }
}

impl ScenarioSources {
    fn load(directory: &Path) -> Result<Self, String> {
        Ok(Self {
            data_dl: read_required(directory, "Data DL")?,
            data_ld: read_required(directory, "Data LD")?,
            data_rd: read_required(directory, "Data RD")?,
            data_ddd: read_required(directory, "Data DDD")?,
            data_rdd: read_required(directory, "Data RDD")?,
            data_dd: read_required(directory, "Data DD")?,
            data_ed: read_required(directory, "Data ED")?,
            data_ed2: read_required(directory, "Data ED2")?,
            data_edcd: read_required(directory, "Data EDCD")?,
            data_bd: read_required(directory, "Data BD")?,
            data_md: read_required(directory, "Data MD")?,
            data_sd2: read_required(directory, "Data SD2")?,
            data_ed3: read_required(directory, "Data ED3")?,
            data_td3: read_required(directory, "Data TD3")?,
            data_td2: read_required(directory, "Data TD2")?,
            data_ni: read_required(directory, "Data NI")?,
            data_td: read_required(directory, "Data TD")?,
            data_sd: read_required(directory, "Data SD")?,
            global: read_required(directory, "Global")?,
            scenario_resources: read_required(directory, "Scenario.rsrc")?,
            data_spell: read_optional(directory, "Data Spell")?,
            data_spell_resources: read_optional(directory, "Data Spell.rsrc")?,
        })
    }
}

impl SharedSources {
    fn load(directory: &Path) -> Result<Self, String> {
        Ok(Self {
            standard_item_bytes: read_shared(directory, "Data ID")?,
            standard_item_text_bytes: read_shared(directory, "Data ID.rsrc")?,
            standard_spell_bytes: read_shared(directory, "Data S")?,
            custom_names_bytes: read_shared(directory, "Custom Names.rsrc")?,
        })
    }
}

fn read_required(directory: &Path, name: &str) -> Result<Vec<u8>, String> {
    let path = directory.join(name);
    fs::read(&path).map_err(|error| format!("could not read {}: {error}", path.display()))
}

fn read_optional(directory: &Path, name: &str) -> Result<Option<Vec<u8>>, String> {
    let path = directory.join(name);
    match fs::read(&path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("could not read {}: {error}", path.display())),
    }
}

fn read_shared(directory: &Path, name: &str) -> Result<Vec<u8>, String> {
    fs::read(directory.join(name)).map_err(|error| format!("could not read shared {name}: {error}"))
}
