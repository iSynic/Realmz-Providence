use super::{documents, encoding, sources::VerifiedSources};
use crate::corrections::{CertifiedApplicationCorrection, apply_certified_application_corrections};
use providence_core::{
    codecs::{
        decode_caste_rules, decode_race_rules, decode_rule_name_catalog,
        decode_standard_item_rules, decode_standard_spells, derive_caste_eligibility,
        hydrate_standard_spell_names,
    },
    model::{BlobId, MapCoordinate, ProjectSnapshot, StableId, StartLocation},
    rebuilt::{
        ApplicationMediaSourceInput, DerivedApplicationMediaLibrary,
        REALMZ_CLASSIC_APPLICATION_LIBRARY_ID, RebuiltV3AssetIndex, RebuiltV3ItemDefinition,
        RebuiltV3RuleCatalog, RebuiltV3SpellDefinition, derive_application_media_library,
        project_rebuilt_v3_asset_index, project_rebuilt_v3_item_catalog,
        project_rebuilt_v3_rule_catalog, project_rebuilt_v3_standard_spell_catalog,
    },
};
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ApplicationLibraryCounts {
    pub(super) items: usize,
    pub(super) stock_items: usize,
    pub(super) portable_item_placeholders: usize,
    pub(super) spells: usize,
    pub(super) certified_corrections: usize,
    pub(super) races: usize,
    pub(super) castes: usize,
    pub(super) media_descriptors: usize,
    pub(super) media_payloads: usize,
    pub(super) media_by_kind: BTreeMap<String, usize>,
    pub(super) ambiguous_media_resources: usize,
    pub(super) media_decode_failures: usize,
}

pub(super) struct Library {
    pub snapshot: ProjectSnapshot,
    pub media: DerivedApplicationMediaLibrary,
    pub items: Vec<RebuiltV3ItemDefinition>,
    pub spells: Vec<RebuiltV3SpellDefinition>,
    pub rules: RebuiltV3RuleCatalog,
    pub assets: RebuiltV3AssetIndex,
    pub counts: ApplicationLibraryCounts,
    pub corrections: Vec<CertifiedApplicationCorrection>,
}

impl Library {
    pub(super) fn derive(sources: &VerifiedSources) -> Result<Self, String> {
        let (mut snapshot, corrections) = decode_items_and_spells(sources)?;
        decode_rules(sources, &mut snapshot)?;
        snapshot.campaign = Some(documents::application_campaign_metadata());
        snapshot.start_location = Some(StartLocation {
            map: StableId("application-library-map".into()),
            coordinate: MapCoordinate { x: 0, y: 0 },
        });
        let media = decode_media(sources)?;
        snapshot.assets = media
            .catalog
            .assets
            .iter()
            .map(|asset| asset.descriptor.clone())
            .collect();
        snapshot.normalize();
        let mut items =
            project_rebuilt_v3_item_catalog(&snapshot).map_err(|error| error.to_string())?;
        prepare_item_names(&mut items);
        let stock_item_count = items.len();
        items.extend(portable_item_placeholders());
        let spells = project_rebuilt_v3_standard_spell_catalog(&snapshot)
            .map_err(|error| error.to_string())?;
        let rules =
            project_rebuilt_v3_rule_catalog(&snapshot).map_err(|error| error.to_string())?;
        let assets =
            project_rebuilt_v3_asset_index(&snapshot).map_err(|error| error.to_string())?;
        let mut counts = counts(
            &items,
            stock_item_count,
            &spells,
            &rules.races,
            &rules.castes,
            &assets,
            &media.runtime_payloads,
        );
        counts.certified_corrections = corrections.len();
        Ok(Self {
            snapshot,
            media,
            items,
            spells,
            rules,
            assets,
            counts,
            corrections,
        })
    }
}

fn decode_items_and_spells(
    sources: &VerifiedSources,
) -> Result<(ProjectSnapshot, Vec<CertifiedApplicationCorrection>), String> {
    let data_id = sources.bytes("Data ID")?;
    let data_id_text = sources.bytes("Data ID.rsrc")?;
    let data_s = sources.bytes("Data S")?;
    let custom_names = sources.bytes("Custom Names.rsrc")?;
    let mut snapshot =
        ProjectSnapshot::new_authored(StableId(REALMZ_CLASSIC_APPLICATION_LIBRARY_ID.into()));
    snapshot.item_rules = decode_standard_item_rules(
        data_id,
        data_id_text,
        encoding::blob_id(data_id),
        encoding::blob_id(data_id_text),
    )
    .map_err(|error| error.to_string())?
    .rules;
    snapshot.standard_spells =
        decode_standard_spells(data_s, Some(encoding::blob_id(data_s))).spells;
    hydrate_standard_spell_names(
        &mut snapshot.standard_spells,
        custom_names,
        encoding::blob_id(custom_names),
    )
    .map_err(|error| error.to_string())?;
    let corrections = apply_certified_application_corrections(&mut snapshot.standard_spells)?;
    Ok((snapshot, corrections))
}

fn decode_rules(sources: &VerifiedSources, snapshot: &mut ProjectSnapshot) -> Result<(), String> {
    let custom_names = sources.bytes("Custom Names.rsrc")?;
    snapshot.race_rules = decode_race_rules(
        sources.bytes("Data Race")?,
        Some(encoding::blob_id(sources.bytes("Data Race")?)),
    )
    .rules;
    snapshot.caste_rules = decode_caste_rules(
        sources.bytes("Data Caste")?,
        Some(encoding::blob_id(sources.bytes("Data Caste")?)),
    )
    .rules;
    derive_caste_eligibility(&snapshot.race_rules, &mut snapshot.caste_rules)
        .map_err(|error| error.to_string())?;
    snapshot.rule_names = Some(
        decode_rule_name_catalog(
            custom_names,
            "Custom Names.rsrc STR# 129/131".into(),
            encoding::blob_id(custom_names),
        )
        .map_err(|error| error.to_string())?,
    );
    Ok(())
}

fn decode_media(sources: &VerifiedSources) -> Result<DerivedApplicationMediaLibrary, String> {
    let media = derive_application_media_library(&[
        ApplicationMediaSourceInput {
            identity: "classic-application:family-jewels",
            native_name: "The Family Jewels.rsrc",
            priority: 0,
            bytes: sources.bytes("The Family Jewels.rsrc")?,
        },
        ApplicationMediaSourceInput {
            identity: "classic-application:portraits",
            native_name: "Portraits.rsrc",
            priority: 1,
            bytes: sources.bytes("Portraits.rsrc")?,
        },
        ApplicationMediaSourceInput {
            identity: "classic-application:tacticals",
            native_name: "Tacticals.rsrc",
            priority: 2,
            bytes: sources.bytes("Tacticals.rsrc")?,
        },
    ])
    .map_err(|error| error.to_string())?;
    if !media.catalog.ambiguous_resources.is_empty() || !media.catalog.failures.is_empty() {
        return Err(format!(
            "application media is not certifiable: {} ambiguities, {} failures",
            media.catalog.ambiguous_resources.len(),
            media.catalog.failures.len()
        ));
    }
    Ok(media)
}

fn prepare_item_names(items: &mut [RebuiltV3ItemDefinition]) {
    for item in items {
        if item.name.trim().is_empty() {
            item.name = format!("Unnamed Classic item {}", item.classic_id);
        }
        if item.unidentified_name.trim().is_empty() {
            item.unidentified_name = format!("Unidentified item {}", item.classic_id);
        }
        item.cursed_item_id
            .get_or_insert_with(|| StableId(String::new()));
        item.specific_race_id
            .get_or_insert_with(|| StableId(String::new()));
        item.specific_caste_id
            .get_or_insert_with(|| StableId(String::new()));
    }
}

fn counts(
    items: &[providence_core::rebuilt::RebuiltV3ItemDefinition],
    stock_item_count: usize,
    spells: &[providence_core::rebuilt::RebuiltV3SpellDefinition],
    races: &[providence_core::model::RaceRuleDefinition],
    castes: &[providence_core::model::CasteRuleDefinition],
    assets: &RebuiltV3AssetIndex,
    payloads: &BTreeMap<BlobId, Vec<u8>>,
) -> ApplicationLibraryCounts {
    let mut media_by_kind = BTreeMap::new();
    for asset in &assets.assets {
        *media_by_kind.entry(asset.kind.clone()).or_insert(0) += 1;
    }
    ApplicationLibraryCounts {
        items: items.len(),
        stock_items: stock_item_count,
        portable_item_placeholders: items.len() - stock_item_count,
        spells: spells.len(),
        certified_corrections: 0,
        races: races.len(),
        castes: castes.len(),
        media_descriptors: assets.assets.len(),
        media_payloads: payloads.len(),
        media_by_kind,
        ambiguous_media_resources: 0,
        media_decode_failures: 0,
    }
}

fn portable_item_placeholders() -> Vec<RebuiltV3ItemDefinition> {
    [
        (805, 607, 6, 3, [-4, 1110, 0, 0, 0], 12, 6),
        (877, 605, 36, 5, [0; 5], 3, 34),
        (883, 142, 1, 200, [0; 5], 25, 48),
    ]
    .into_iter()
    .map(
        |(classic_id, icon_id, initial_charges, cost, special, weight_per_charge, sound_id)| {
            RebuiltV3ItemDefinition {
                id: StableId(format!("classic.item.{classic_id}")),
                classic_id,
                name: "Unknown item".into(),
                unidentified_name: "Unknown item".into(),
                description: String::new(),
                icon_id,
                item_type: 22,
                strength_bonus: 0,
                blunt: 0,
                hands: 0,
                luck_bonus: 0,
                movement_bonus: 0,
                armor_bonus: 0,
                magic_resistance_bonus: 0,
                damage_bonus: 0,
                spell_point_bonus: 0,
                sound_id,
                weight: 0,
                cost,
                initial_charges,
                cursed_item_id: Some(StableId(String::new())),
                magical: false,
                item_category_mask_low: 0,
                item_category_mask_high: 65536,
                race_restrictions: 0,
                caste_restrictions: 0,
                specific_race_id: Some(StableId(String::new())),
                specific_caste_id: Some(StableId(String::new())),
                race_class_only: 0,
                caste_class_only: 0,
                versus_small: 0,
                versus_large: 0,
                heat: 0,
                cold: 0,
                electric: 0,
                versus_undead: 0,
                versus_demon_devil: 0,
                versus_evil: 0,
                special,
                weight_per_charge,
                drop_on_empty: true,
            }
        },
    )
    .collect()
}
