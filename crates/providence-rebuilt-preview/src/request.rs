use super::file_io::{
    is_lower_sha256, require_absolute_file, require_new_absolute_file, sha256_file,
    write_json_noclobber,
};
use super::targets::validate_target;
use super::{FORMAT_VERSION, PARTY_FIXTURE, PreviewRequest, PreviewTarget, REQUEST_KIND};
use std::{fs, path::Path};

pub fn prepare_request(
    package_path: &Path,
    request_path: &Path,
    result_path: &Path,
    target: PreviewTarget,
    rng_seed: i64,
) -> Result<PreviewRequest, String> {
    require_absolute_file(package_path, "preview package")?;
    require_new_absolute_file(request_path, "preview request")?;
    require_new_absolute_file(result_path, "preview result")?;
    if package_path == request_path || package_path == result_path || request_path == result_path {
        return Err("preview package, request, and result paths must be distinct".into());
    }
    validate_target(&target)?;
    let request = PreviewRequest {
        kind: REQUEST_KIND.into(),
        format_version: FORMAT_VERSION,
        package_path: package_path.to_path_buf(),
        package_sha256: sha256_file(package_path)?,
        target,
        party_fixture: PARTY_FIXTURE.into(),
        rng_seed,
        isolated_session: true,
        result_path: result_path.to_path_buf(),
    };
    write_json_noclobber(request_path, &request)?;
    Ok(request)
}

pub fn read_request(path: &Path) -> Result<PreviewRequest, String> {
    require_absolute_file(path, "preview request")?;
    let bytes =
        fs::read(path).map_err(|error| format!("could not read preview request: {error}"))?;
    let request: PreviewRequest = serde_json::from_slice(&bytes)
        .map_err(|error| format!("preview request is not valid v1 JSON: {error}"))?;
    validate_request(path, &request)?;
    Ok(request)
}

fn validate_request(path: &Path, request: &PreviewRequest) -> Result<(), String> {
    if request.kind != REQUEST_KIND || request.format_version != FORMAT_VERSION {
        return Err("preview request kind or formatVersion is unsupported".into());
    }
    if request.party_fixture != PARTY_FIXTURE || !request.isolated_session {
        return Err("preview request must use the isolated classic-six session".into());
    }
    require_absolute_file(&request.package_path, "preview package")?;
    if !request.result_path.is_absolute() || !request.result_path.parent().is_some_and(Path::is_dir)
    {
        return Err("preview result path must have an existing absolute parent".into());
    }
    if request.package_path == path
        || request.package_path == request.result_path
        || path == request.result_path
    {
        return Err("preview package, request, and result paths must be distinct".into());
    }
    if !is_lower_sha256(&request.package_sha256)
        || sha256_file(&request.package_path)? != request.package_sha256
    {
        return Err("preview package no longer matches the request SHA-256".into());
    }
    validate_target(&request.target)
}
