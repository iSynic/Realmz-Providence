use providence_core::{
    compiler::{
        ClassicCompatibilitySources, NamedCompatibilitySource, PreservedCompatibilitySource,
    },
    model::{BlobId, ProjectSnapshot},
};
use providence_storage::ProjectStore;
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn read_retained(
    snapshot: &ProjectSnapshot,
    store: &ProjectStore,
) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let mut source_bytes = BTreeMap::<String, Vec<u8>>::new();
    for source in &snapshot.classic_sources {
        let bytes = store
            .read_blob(&source.blob)
            .map_err(|error| error.to_string())?;
        if bytes.len() as u64 != source.byte_length {
            return Err(format!(
                "Retained Classic source {} has an unexpected length",
                source.native_path
            ));
        }
        if source_bytes
            .insert(source.native_path.clone(), bytes)
            .is_some()
        {
            return Err(format!(
                "Classic source path {} appears more than once",
                source.native_path
            ));
        }
    }
    restore_item_sources(snapshot, store, &mut source_bytes)?;
    Ok(source_bytes)
}

pub(super) fn startup<'a>(
    snapshot: &'a ProjectSnapshot,
    source_bytes: &'a BTreeMap<String, Vec<u8>>,
) -> Result<Option<NamedCompatibilitySource<'a>>, String> {
    let original = snapshot
        .startup_authoring
        .as_ref()
        .and_then(|authoring| authoring.original_source.as_ref());
    let path = original
        .map(|source| source.native_path.as_str())
        .or_else(|| {
            snapshot
                .campaign
                .as_ref()
                .map(|campaign| campaign.name.as_str())
        });
    let startup_sources = snapshot
        .classic_sources
        .iter()
        .filter(|source| Some(source.native_path.as_str()) == path)
        .collect::<Vec<_>>();
    if original.is_some_and(|source| startup_sources.first().copied() != Some(source)) {
        return Err("The retained startup source no longer matches its original identity.".into());
    }
    if matches!(
        snapshot.origin,
        providence_core::model::ProjectOrigin::Imported { .. }
    ) && snapshot.campaign.is_some()
        && startup_sources.len() != 1
    {
        return Err(format!(
            "Classic campaign compilation requires exactly one original startup source; found {}",
            startup_sources.len()
        ));
    }
    let scenario_startup = startup_sources.first().and_then(|source| {
        source_bytes
            .get(source.native_path.as_str())
            .map(|bytes| NamedCompatibilitySource {
                native_path: source.native_path.as_str(),
                bytes: bytes.as_slice(),
            })
    });
    Ok(scenario_startup)
}

pub(super) fn application_caste(
    snapshot: &ProjectSnapshot,
    source_bytes: &BTreeMap<String, Vec<u8>>,
    store: &ProjectStore,
) -> Result<Option<Vec<u8>>, String> {
    let caste_source_blobs = snapshot
        .caste_rules
        .iter()
        .filter_map(|rule| rule.source_blob.as_ref())
        .collect::<BTreeSet<_>>();
    if caste_source_blobs.len() > 1 {
        return Err("Classic caste compilation requires one consistent source blob".into());
    }
    let application_data_caste = if source_bytes.contains_key("Data Caste") {
        None
    } else {
        caste_source_blobs
            .first()
            .map(|blob| store.read_blob(blob).map_err(|error| error.to_string()))
            .transpose()?
    };
    Ok(application_data_caste)
}

pub(super) fn validate_custom_landlooks(
    snapshot: &ProjectSnapshot,
    source_bytes: &BTreeMap<String, Vec<u8>>,
) -> Result<(), String> {
    for catalog in snapshot.landlook_catalogs.iter().filter(|catalog| {
        providence_core::codecs::custom_landlook_source_name(catalog.landlook).is_some()
    }) {
        let native_path = providence_core::codecs::custom_landlook_source_name(catalog.landlook)
            .expect("filtered custom landlook");
        let retained = snapshot
            .classic_sources
            .iter()
            .find(|source| source.native_path == native_path)
            .ok_or_else(|| {
                format!("Classic custom landlook {native_path} requires its retained source blob")
            })?;
        if retained.blob != catalog.source_blob
            || retained.byte_length != catalog.byte_length
            || !source_bytes.contains_key(native_path)
        {
            return Err(format!(
                "Classic custom landlook {native_path} has inconsistent source provenance"
            ));
        }
    }
    Ok(())
}

pub(super) fn compatibility<'a>(
    snapshot: &'a ProjectSnapshot,
    source_bytes: &'a BTreeMap<String, Vec<u8>>,
    scenario_startup: Option<NamedCompatibilitySource<'a>>,
    application_data_caste: Option<&'a [u8]>,
) -> ClassicCompatibilitySources<'a> {
    let (data_ni_text, data_spell_names) = text_sources(snapshot, source_bytes);
    let scenario_support = scenario_support(snapshot, source_bytes);
    ClassicCompatibilitySources {
        retained_files: Some(source_bytes),
        scenario_startup,
        scenario_music: scenario_music(snapshot, source_bytes),
        data_cs: source_bytes.get("Data CS").map(Vec::as_slice),
        data_ri: source_bytes.get("Data RI").map(Vec::as_slice),
        data_ci: source_bytes.get("Data CI").map(Vec::as_slice),
        data_ld: source_bytes.get("Data LD").map(Vec::as_slice),
        layout: source_bytes.get("Layout").map(Vec::as_slice),
        data_md2: source_bytes.get("Data MD2").map(Vec::as_slice),
        data_rd: source_bytes.get("Data RD").map(Vec::as_slice),
        data_dl: source_bytes.get("Data DL").map(Vec::as_slice),
        data_dd: source_bytes.get("Data DD").map(Vec::as_slice),
        data_ddd: source_bytes.get("Data DDD").map(Vec::as_slice),
        data_rdd: source_bytes.get("Data RDD").map(Vec::as_slice),
        data_ed3: source_bytes.get("Data ED3").map(Vec::as_slice),
        data_ed: source_bytes.get("Data ED").map(Vec::as_slice),
        data_ed2: source_bytes.get("Data ED2").map(Vec::as_slice),
        data_td2: source_bytes.get("Data TD2").map(Vec::as_slice),
        data_td3: source_bytes.get("Data TD3").map(Vec::as_slice),
        data_edcd: source_bytes.get("Data EDCD").map(Vec::as_slice),
        data_sd2: source_bytes.get("Data SD2").map(Vec::as_slice),
        data_od: source_bytes.get("Data OD").map(Vec::as_slice),
        global: source_bytes.get("Global").map(Vec::as_slice),
        data_md: source_bytes.get("Data MD").map(Vec::as_slice),
        data_md1: source_bytes.get("Data MD1").map(Vec::as_slice),
        data_md_minus_1: source_bytes.get("Data MD-1").map(Vec::as_slice),
        data_des: source_bytes.get("Data DES").map(Vec::as_slice),
        data_bd: source_bytes.get("Data BD").map(Vec::as_slice),
        data_td: source_bytes.get("Data TD").map(Vec::as_slice),
        data_sd: source_bytes.get("Data SD").map(Vec::as_slice),
        data_caste: source_bytes.get("Data Caste").map(Vec::as_slice),
        data_race: source_bytes.get("Data Race").map(Vec::as_slice),
        application_data_race: None,
        current_data_race: None,
        current_data_caste: None,
        application_data_caste,
        data_ni: source_bytes.get("Data NI").map(Vec::as_slice),
        data_ni_text,
        data_spell: source_bytes.get("Data Spell").map(Vec::as_slice),
        data_spell_names,
        data_solids: source_bytes.get("Data Solids").map(Vec::as_slice),
        scenario_resources: source_bytes.get("Scenario.rsrc").map(Vec::as_slice),
        scenario_support,
        data_custom_1_bd: source_bytes.get("Data Custom 1 BD").map(Vec::as_slice),
        data_custom_2_bd: source_bytes.get("Data Custom 2 BD").map(Vec::as_slice),
        data_custom_3_bd: source_bytes.get("Data Custom 3 BD").map(Vec::as_slice),
    }
}

fn text_sources<'a>(
    snapshot: &'a ProjectSnapshot,
    source_bytes: &'a BTreeMap<String, Vec<u8>>,
) -> (
    Option<NamedCompatibilitySource<'a>>,
    Option<NamedCompatibilitySource<'a>>,
) {
    let item_blob = snapshot
        .scenario_item_rules
        .first()
        .and_then(|item| item.text_source_blob.as_ref());
    let spell_blob = snapshot
        .scenario_spells
        .first()
        .and_then(|spell| spell.text_source_blob.as_ref());
    let item_source = named_blob_source(snapshot, source_bytes, item_blob).or_else(|| {
        if snapshot
            .startup_authoring
            .as_ref()
            .and_then(|s| s.original_source.as_ref())
            .is_some()
        {
            return None;
        }
        source_bytes
            .get("Data NI.rsrc")
            .map(|bytes| NamedCompatibilitySource {
                native_path: "Data NI.rsrc",
                bytes: bytes.as_slice(),
            })
    });
    (
        item_source,
        named_blob_source(snapshot, source_bytes, spell_blob),
    )
}

fn named_blob_source<'a>(
    snapshot: &'a ProjectSnapshot,
    source_bytes: &'a BTreeMap<String, Vec<u8>>,
    blob: Option<&BlobId>,
) -> Option<NamedCompatibilitySource<'a>> {
    let source = blob.and_then(|blob| {
        snapshot
            .classic_sources
            .iter()
            .find(|source| &source.blob == blob)
    })?;
    source_bytes
        .get(source.native_path.as_str())
        .map(|bytes| NamedCompatibilitySource {
            native_path: source.native_path.as_str(),
            bytes: bytes.as_slice(),
        })
}

fn scenario_support<'a>(
    snapshot: &'a ProjectSnapshot,
    source_bytes: &'a BTreeMap<String, Vec<u8>>,
) -> Option<PreservedCompatibilitySource<'a>> {
    snapshot
        .classic_sources
        .iter()
        .find(|source| source.native_path == "Scenario")
        .and_then(|source| {
            source_bytes
                .get("Scenario")
                .map(|bytes| PreservedCompatibilitySource {
                    blob: &source.blob,
                    bytes: bytes.as_slice(),
                })
        })
}

pub(super) fn asset_payloads(
    snapshot: &ProjectSnapshot,
    store: &ProjectStore,
) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let mut asset_payloads = BTreeMap::new();
    for asset in snapshot.assets.iter().filter(|asset| {
        asset.kind == "picture"
            || asset.kind == "sound"
            || asset.kind == "icon"
            || asset.kind == "portrait"
            || asset.kind == "combat-icon"
            || asset.kind == "special-land-tile"
            || asset.kind == "text-resource"
            || asset.kind == "text-style-resource"
            || asset.kind == "music"
    }) {
        if let Some(blob) = &asset.classic_payload_blob {
            asset_payloads.insert(
                blob.0.clone(),
                store.read_blob(blob).map_err(|error| error.to_string())?,
            );
        }
    }
    Ok(asset_payloads)
}

fn restore_item_sources(
    snapshot: &ProjectSnapshot,
    store: &ProjectStore,
    source_bytes: &mut BTreeMap<String, Vec<u8>>,
) -> Result<(), String> {
    if !source_bytes.contains_key("Data NI") && !snapshot.scenario_item_rules.is_empty() {
        let blobs = snapshot
            .scenario_item_rules
            .iter()
            .map(|rule| &rule.source_blob)
            .collect::<BTreeSet<_>>();
        if blobs.len() != 1 {
            return Err(
                "Classic item compilation requires one consistent Data NI source blob".into(),
            );
        }
        source_bytes.insert(
            "Data NI".into(),
            store
                .read_blob(blobs.first().expect("one checked Data NI blob"))
                .map_err(|error| error.to_string())?,
        );
    }
    if !source_bytes.contains_key("Data NI.rsrc") {
        let text_blobs = snapshot
            .scenario_item_rules
            .iter()
            .filter_map(|rule| rule.text_source_blob.as_ref())
            .collect::<BTreeSet<_>>();
        if text_blobs.len() > 1 {
            return Err(
                "Classic item compilation requires one consistent Data NI text source blob".into(),
            );
        }
        if let Some(blob) = text_blobs.first().filter(|blob| {
            !snapshot
                .classic_sources
                .iter()
                .any(|source| &source.blob == **blob)
        }) {
            source_bytes.insert(
                "Data NI.rsrc".into(),
                store.read_blob(blob).map_err(|error| error.to_string())?,
            );
        }
    }
    Ok(())
}

fn scenario_music<'a>(
    snapshot: &'a ProjectSnapshot,
    source_bytes: &'a BTreeMap<String, Vec<u8>>,
) -> [Option<PreservedCompatibilitySource<'a>>; 3] {
    providence_core::codecs::SCENARIO_MUSIC_FILES.map(|path| {
        snapshot
            .classic_sources
            .iter()
            .find(|source| source.native_path == path)
            .and_then(|source| {
                source_bytes
                    .get(path)
                    .map(|bytes| PreservedCompatibilitySource {
                        blob: &source.blob,
                        bytes,
                    })
            })
    })
}
