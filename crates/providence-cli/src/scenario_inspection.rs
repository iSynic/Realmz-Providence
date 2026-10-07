use providence_core::codecs::DecodedScenarioContactInfo;
use providence_core::codecs::NativeFileFamily;
use providence_core::codecs::decode_scenario_contact_info;
use providence_core::codecs::decode_scenario_startup;
use providence_core::codecs::encode_scenario_contact_info;
use providence_core::codecs::encode_scenario_startup;
use providence_core::codecs::inspect_owned_byte_diff;
use providence_core::model::CampaignContact;
use providence_core::model::CampaignContactProvenance;
use providence_core::model::CampaignMetadata;
use providence_core::model::CampaignRestrictions;
use serde_json::json;
use sha2::Digest;
use sha2::Sha256;
use std::fs;
use std::path::Path;
use std::process::ExitCode;

pub(crate) fn inspect_scenario_bootstrap(startup_path: &str, restrictions_path: &str) -> ExitCode {
    let startup = match fs::read(startup_path) {
        Ok(bytes) => bytes,
        Err(error) => {
            eprintln!("could not read scenario startup: {error}");
            return ExitCode::FAILURE;
        }
    };
    let restrictions = match fs::read(restrictions_path) {
        Ok(bytes) => bytes,
        Err(error) => {
            eprintln!("could not read Data RI: {error}");
            return ExitCode::FAILURE;
        }
    };
    let scenario_name = match Path::new(startup_path)
        .file_name()
        .and_then(|name| name.to_str())
    {
        Some(name) if !name.is_empty() => name,
        _ => {
            eprintln!("scenario startup path has no portable final name");
            return ExitCode::FAILURE;
        }
    };
    let decoded = match decode_scenario_startup(scenario_name, &startup, &restrictions) {
        Ok(decoded) => decoded,
        Err(error) => {
            eprintln!("could not decode scenario startup: {error}");
            return ExitCode::FAILURE;
        }
    };
    let (compiled_startup, compiled_restrictions) = match encode_scenario_startup(
        scenario_name,
        &decoded.campaign,
        &decoded.start_location,
        Some(&startup),
        Some(&restrictions),
    ) {
        Ok(compiled) => compiled,
        Err(error) => {
            eprintln!("could not compile scenario startup: {error}");
            return ExitCode::FAILURE;
        }
    };
    let exact = compiled_startup == startup && compiled_restrictions == restrictions;
    let report = bootstrap_report(scenario_name, &startup, &restrictions, &decoded, exact);
    println!(
        "{}",
        serde_json::to_string_pretty(&report).expect("scenario bootstrap report is serializable")
    );
    if exact {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

pub(crate) fn inspect_scenario_contact(path: &str) -> ExitCode {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => {
            eprintln!("could not read Data CI: {error}");
            return ExitCode::FAILURE;
        }
    };
    let decoded = match decode_scenario_contact_info(&bytes) {
        Ok(decoded) => decoded,
        Err(error) => {
            eprintln!("could not decode Data CI: {error}");
            return ExitCode::FAILURE;
        }
    };
    let campaign = campaign_from_scenario_contact(&decoded);
    let compiled = match encode_scenario_contact_info(&campaign, Some(&bytes)) {
        Ok(Some(bytes)) => bytes,
        Ok(None) => {
            eprintln!("Data CI unexpectedly compiled to no file");
            return ExitCode::FAILURE;
        }
        Err(error) => {
            eprintln!("could not compile Data CI: {error}");
            return ExitCode::FAILURE;
        }
    };
    let exact = compiled == bytes;
    let report = json!({
        "path": path,
        "bytes": bytes.len(),
        "sha256": format!("{:x}", Sha256::digest(&bytes)),
        "slotCount": 18,
        "ownedSlots": [0, 1, 2, 3, 4, 5, 6, 17],
        "preservedSlots": [7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
        "noEditRoundTripExact": exact,
        "contact": {
            "title": campaign.contact.title,
            "version": campaign.version,
            "date": campaign.contact.date,
            "author": campaign.author,
            "email": campaign.contact.email,
            "web": campaign.contact.web,
            "fee": campaign.contact.fee,
            "description": campaign.description,
        },
    });
    println!(
        "{}",
        serde_json::to_string_pretty(&report).expect("scenario contact report is serializable")
    );
    if exact {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

pub(crate) fn campaign_from_scenario_contact(
    decoded: &DecodedScenarioContactInfo,
) -> CampaignMetadata {
    let mut campaign = CampaignMetadata {
        name: String::new(),
        version: String::new(),
        author: String::new(),
        creator_user_check: String::new(),
        contact: CampaignContact::default(),
        contact_provenance: CampaignContactProvenance::Absent,
        description: String::new(),
        splash_asset_id: String::new(),
        recommended_party_levels: 0,
        maximum_party_levels: 0,
        guidance_authored: false,
        restrictions: CampaignRestrictions {
            description: String::new(),
            max_party_size: 6,
            max_level: 0,
            banned_races: Vec::new(),
            banned_castes: Vec::new(),
        },
    };
    decoded.apply_to_campaign(&mut campaign);
    campaign
}

pub(crate) fn certify_scenario_contact(path: &str, field: &str, value: &str) -> ExitCode {
    let source = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => {
            eprintln!("could not read Data CI: {error}");
            return ExitCode::FAILURE;
        }
    };
    let decoded = match decode_scenario_contact_info(&source) {
        Ok(decoded) => decoded,
        Err(error) => {
            eprintln!("could not decode Data CI: {error}");
            return ExitCode::FAILURE;
        }
    };
    let mut campaign = campaign_from_scenario_contact(&decoded);
    if !set_contact_field(&mut campaign, field, value) {
        return ExitCode::from(2);
    }
    campaign.contact_provenance = CampaignContactProvenance::Authored;
    let output = match compile_contact_edit(&campaign, &source) {
        Ok(bytes) => bytes,
        Err(error) => return crate::output::report_error(error),
    };
    let reopened = match decode_scenario_contact_info(&output) {
        Ok(decoded) => decoded,
        Err(error) => {
            eprintln!("could not reimport edited Data CI: {error}");
            return ExitCode::FAILURE;
        }
    };
    let reopened_value = contact_field(&reopened, field);
    let ownership =
        inspect_owned_byte_diff(NativeFileFamily::ScenarioContactInfo, &source, &output, 32);
    let reimport_exact = reopened_value == value;
    let ready = ownership.within_declared_ownership && reimport_exact && !ownership.exact;
    let report = json!({
        "path": path,
        "field": field,
        "value": value,
        "sourceSha256": format!("{:x}", Sha256::digest(&source)),
        "editedSha256": format!("{:x}", Sha256::digest(&output)),
        "reimportExact": reimport_exact,
        "ownership": ownership,
    });
    println!(
        "{}",
        serde_json::to_string_pretty(&report)
            .expect("scenario contact edit report is serializable")
    );
    if ready {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

fn set_contact_field(campaign: &mut CampaignMetadata, field: &str, value: &str) -> bool {
    match field {
        "title" => campaign.contact.title = value.into(),
        "version" => campaign.version = value.into(),
        "date" => campaign.contact.date = value.into(),
        "author" => campaign.author = value.into(),
        "email" => campaign.contact.email = value.into(),
        "web" => campaign.contact.web = value.into(),
        "fee" => campaign.contact.fee = value.into(),
        "description" => campaign.description = value.into(),
        _ => {
            eprintln!(
                "scenario contact field must be title, version, date, author, email, web, fee, or description"
            );
            return false;
        }
    }

    true
}

fn compile_contact_edit(campaign: &CampaignMetadata, source: &[u8]) -> Result<Vec<u8>, String> {
    match encode_scenario_contact_info(campaign, Some(source)) {
        Ok(Some(bytes)) => Ok(bytes),
        Ok(None) => Err("Data CI unexpectedly compiled to no file".into()),
        Err(error) => Err(format!("could not compile edited Data CI: {error}")),
    }
}

fn contact_field<'a>(reopened: &'a DecodedScenarioContactInfo, field: &str) -> &'a str {
    match field {
        "title" => &reopened.title,
        "version" => &reopened.version,
        "date" => &reopened.date,
        "author" => &reopened.author,
        "email" => &reopened.email,
        "web" => &reopened.web,
        "fee" => &reopened.fee,
        "description" => &reopened.description,
        _ => unreachable!("field was validated above"),
    }
}

fn bootstrap_report(
    scenario_name: &str,
    startup: &[u8],
    restrictions: &[u8],
    decoded: &providence_core::codecs::DecodedScenarioStartup,
    exact: bool,
) -> serde_json::Value {
    json!({
        "scenarioName": scenario_name,
        "startupBytes": startup.len(),
        "startupSha256": format!("{:x}", Sha256::digest(startup)),
        "restrictionsBytes": restrictions.len(),
        "restrictionsSha256": format!("{:x}", Sha256::digest(restrictions)),
        "noEditRoundTripExact": exact,
        "campaign": {
            "author": decoded.campaign.author,
            "recommendedPartyLevels": decoded.campaign.recommended_party_levels,
            "maximumPartyLevels": decoded.campaign.maximum_party_levels,
            "restrictionMaxPartySize": decoded.campaign.restrictions.max_party_size,
            "restrictionMaxLevel": decoded.campaign.restrictions.max_level,
            "bannedRaces": decoded.campaign.restrictions.banned_races.len(),
            "bannedCastes": decoded.campaign.restrictions.banned_castes.len(),
        },
        "start": {
            "mapId": decoded.start_location.map,
            "x": decoded.start_location.coordinate.x,
            "y": decoded.start_location.coordinate.y,
        },
    })
}
