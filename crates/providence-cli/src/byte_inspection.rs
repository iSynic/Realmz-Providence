use providence_core::codecs::CODEC_REGISTRY;
use providence_core::codecs::NativeFileFamily;
use providence_core::codecs::ResourceIdentity;
use providence_core::codecs::inspect_owned_byte_diff;
use providence_core::codecs::inspect_resource_fork_diff;
use std::collections::BTreeSet;
use std::fs;
use std::process::ExitCode;

pub(crate) fn inspect_classic_owned_byte_diff(
    family_name: &str,
    before_path: &str,
    after_path: &str,
) -> ExitCode {
    let Some(family) = fixed_record_family(family_name) else {
        eprintln!("unknown Classic fixed-record family: {family_name}");
        return ExitCode::from(2);
    };
    let result = fs::read(before_path)
        .map_err(|error| format!("could not read {before_path}: {error}"))
        .and_then(|before| {
            fs::read(after_path)
                .map_err(|error| format!("could not read {after_path}: {error}"))
                .map(|after| inspect_owned_byte_diff(family, &before, &after, 64))
        });
    match result {
        Ok(report) => {
            let accepted = report.within_declared_ownership;
            println!(
                "{}",
                serde_json::to_string_pretty(&report)
                    .expect("owned-byte comparison report is serializable")
            );
            if accepted {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            }
        }
        Err(error) => {
            eprintln!("could not inspect owned-byte differences: {error}");
            ExitCode::FAILURE
        }
    }
}

pub(crate) fn inspect_classic_resource_fork_diff(
    before_path: &str,
    after_path: &str,
    resource_type: &str,
    resource_id: &str,
) -> ExitCode {
    let Ok(resource_type): Result<[u8; 4], _> = resource_type.as_bytes().try_into() else {
        eprintln!("resource type must contain exactly four bytes");
        return ExitCode::from(2);
    };
    let Ok(resource_id) = resource_id.parse::<i16>() else {
        eprintln!("resource id must be a signed 16-bit integer");
        return ExitCode::from(2);
    };
    let result = fs::read(before_path)
        .map_err(|error| format!("could not read {before_path}: {error}"))
        .and_then(|before| {
            fs::read(after_path)
                .map_err(|error| format!("could not read {after_path}: {error}"))
                .and_then(|after| {
                    inspect_resource_fork_diff(
                        &before,
                        &after,
                        &BTreeSet::from([ResourceIdentity {
                            resource_type,
                            id: resource_id,
                        }]),
                    )
                    .map_err(|error| error.to_string())
                })
        });
    match result {
        Ok(report) => {
            let accepted = report.within_declared_ownership;
            println!(
                "{}",
                serde_json::to_string_pretty(&report)
                    .expect("resource-fork comparison report is serializable")
            );
            if accepted {
                ExitCode::SUCCESS
            } else {
                ExitCode::FAILURE
            }
        }
        Err(error) => {
            eprintln!("could not inspect resource-fork differences: {error}");
            ExitCode::FAILURE
        }
    }
}

pub(crate) fn fixed_record_family(name: &str) -> Option<NativeFileFamily> {
    CODEC_REGISTRY.iter().find_map(|codec| {
        (serde_json::to_value(codec.family)
            .ok()
            .and_then(|value| value.as_str().map(str::to_owned))
            .as_deref()
            == Some(name))
        .then_some(codec.family)
    })
}
