use std::{collections::BTreeMap, fs, path::Path};

use super::{override_asset, write_scenario_fixture};
use providence_core::{
    model::{BlobId, ClassicResourceKey, StableId},
    rebuilt::{
        ApplicationMediaAsset, ApplicationMediaCatalog, ApplicationMediaResolution,
        REBUILT_V3_SCHEMA_SHA256, RebuiltV3AssetRecord, RebuiltV3ItemDefinition,
        RebuiltV3SpellDefinition,
    },
};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FixtureContract {
    kind: &'static str,
    format_version: u8,
    providence_commit: String,
    schema_sha256: &'static str,
    application_package_id: &'static str,
    application_package_hash: String,
    coverage: FixtureCoverage,
    cases: Vec<FixtureCase>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FixtureCoverage {
    application_item: &'static str,
    application_spell: &'static str,
    application_portrait: &'static str,
    application_tactical_icon: &'static str,
    application_tileset: &'static str,
    application_sound: &'static str,
    scenario_custom_item: &'static str,
    scenario_custom_spell: &'static str,
    exact_media_override: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FixtureCase {
    id: &'static str,
    path: String,
    package_hash: String,
    archive_sha256: String,
    expected: &'static str,
    expected_message_fragment: &'static str,
    scenario_items: usize,
    scenario_spells: usize,
    scenario_media: usize,
    application_definitions_embedded: usize,
}

struct FixtureInputs<'a> {
    application_item: &'a RebuiltV3ItemDefinition,
    application_spell: &'a RebuiltV3SpellDefinition,
    portable_item: &'a RebuiltV3ItemDefinition,
    portrait: &'a ApplicationMediaAsset,
    portrait_payload: &'a [u8],
}

type AlignmentCase<'a> = (
    &'static str,
    RebuiltV3ItemDefinition,
    RebuiltV3SpellDefinition,
    Option<(RebuiltV3AssetRecord, &'a [u8])>,
    &'static str,
    &'static str,
);

pub fn write_alignment_fixtures(
    root: &Path,
    commit: &str,
    application_package_hash: &str,
    application_items: &[RebuiltV3ItemDefinition],
    application_spells: &[RebuiltV3SpellDefinition],
    application_media: &ApplicationMediaCatalog,
    payloads: &BTreeMap<BlobId, Vec<u8>>,
) -> Result<(), String> {
    fs::create_dir_all(root)
        .map_err(|error| format!("could not create {}: {error}", root.display()))?;
    let inputs = resolve_inputs(
        application_items,
        application_spells,
        application_media,
        payloads,
    )?;
    let records = publish_cases(root, commit, alignment_cases(inputs))?;
    let contract = fixture_contract(commit, application_package_hash, records);
    let mut bytes = serde_json::to_vec_pretty(&contract).map_err(|error| error.to_string())?;
    bytes.push(b'\n');
    fs::write(root.join("contract.json"), bytes)
        .map_err(|error| format!("could not write fixture contract: {error}"))?;
    Ok(())
}

fn resolve_inputs<'a>(
    application_items: &'a [RebuiltV3ItemDefinition],
    application_spells: &'a [RebuiltV3SpellDefinition],
    application_media: &'a ApplicationMediaCatalog,
    payloads: &'a BTreeMap<BlobId, Vec<u8>>,
) -> Result<FixtureInputs<'a>, String> {
    let application_item = application_items
        .iter()
        .find(|item| item.classic_id == 1)
        .ok_or("application item 1 is absent")?;
    let application_spell = application_spells
        .iter()
        .find(|spell| spell.classic_id == 1101)
        .ok_or("application spell 1101 is absent")?;
    let portable_item = application_items
        .iter()
        .find(|item| item.classic_id == 805)
        .ok_or("portable item 805 is absent")?;
    let portrait_resource = ClassicResourceKey {
        resource_type: "cicn".into(),
        resource_id: 257,
    };
    let ApplicationMediaResolution::Resolved(portrait) =
        application_media.resolve_resource(&portrait_resource, Some("portrait"))
    else {
        return Err("application portrait cicn 257 is unavailable".into());
    };
    let portrait_payload = payloads
        .get(&portrait.descriptor.blob)
        .ok_or("application portrait payload is absent")?;

    Ok(FixtureInputs {
        application_item,
        application_spell,
        portable_item,
        portrait,
        portrait_payload,
    })
}

fn alignment_cases(inputs: FixtureInputs<'_>) -> [AlignmentCase<'_>; 3] {
    let mut custom_item = inputs.portable_item.clone();
    custom_item.name = "Fixture Compass".into();
    custom_item.unidentified_name = "Engraved compass".into();
    custom_item.cursed_item_id = Some(inputs.application_item.id.clone());
    custom_item.sound_id = 147;
    let mut custom_spell = inputs.application_spell.clone();
    custom_spell.id = StableId("classic.spell.5101".into());
    custom_spell.classic_id = 5101;
    custom_spell.name = "Fixture Beacon".into();
    custom_spell.description = "A scenario-owned fixture spell.".into();

    let positive_asset = override_asset(inputs.portrait, "portrait");
    let wrong_kind_asset = override_asset(inputs.portrait, "icon");
    [
        (
            "positive",
            custom_item.clone(),
            custom_spell.clone(),
            Some((positive_asset, inputs.portrait_payload)),
            "accepted",
            "",
        ),
        (
            "missing-dependency",
            {
                let mut item = custom_item.clone();
                item.cursed_item_id = Some(StableId("classic.item.9999".into()));
                item
            },
            custom_spell.clone(),
            None,
            "rejected",
            "references unavailable cursed item",
        ),
        (
            "wrong-kind-dependency",
            custom_item,
            custom_spell,
            Some((wrong_kind_asset, inputs.portrait_payload)),
            "rejected",
            "portrait cicn 257",
        ),
    ]
}

fn publish_cases(
    root: &Path,
    commit: &str,
    cases: [AlignmentCase<'_>; 3],
) -> Result<Vec<FixtureCase>, String> {
    let mut records = Vec::new();
    for (id, item, spell, media, expected, fragment) in cases {
        let package_path = root.join(format!("{id}.realmz2"));
        let scenario_media = usize::from(media.is_some());
        let artifact = write_scenario_fixture(&package_path, commit, id, item, spell, media)?;
        records.push(FixtureCase {
            id,
            path: package_path
                .file_name()
                .expect("fixture path has a file name")
                .to_string_lossy()
                .into_owned(),
            package_hash: artifact.0.package_hash,
            archive_sha256: artifact.1,
            expected,
            expected_message_fragment: fragment,
            scenario_items: 1,
            scenario_spells: 1,
            scenario_media,
            application_definitions_embedded: 0,
        });
    }
    Ok(records)
}

fn fixture_contract(
    commit: &str,
    application_package_hash: &str,
    records: Vec<FixtureCase>,
) -> FixtureContract {
    FixtureContract {
        kind: "providence.rebuilt-alignment-fixtures",
        format_version: 1,
        providence_commit: commit.into(),
        schema_sha256: REBUILT_V3_SCHEMA_SHA256,
        application_package_id: "realmz-classic-application-library",
        application_package_hash: application_package_hash.into(),
        coverage: FixtureCoverage {
            application_item: "classic.item.1",
            application_spell: "classic.spell.1101",
            application_portrait: "cicn:257",
            application_tactical_icon: "cicn:9000",
            application_tileset: "PICT:300",
            application_sound: "snd :147",
            scenario_custom_item: "classic.item.805",
            scenario_custom_spell: "classic.spell.5101",
            exact_media_override: "cicn:257",
        },
        cases: records,
    }
}
