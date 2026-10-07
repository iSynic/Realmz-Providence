use crate::output::parse_probe_row;
use crate::output::report_error;
use crate::read_only_probe::{ensure_source_unchanged, verify_owned_bytes};
use providence_core::codecs::TIMED_ENCOUNTER_RECORD_BYTES;
use providence_core::codecs::decode_timed_encounters;
use providence_core::codecs::encode_timed_encounters;
use providence_core::model::BlobId;
use providence_core::model::ProjectOrigin;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_core::session::ExpectedRevisionCommand;
use providence_core::session::Revision;
use serde_json::json;
use sha2::Digest;
use sha2::Sha256;
use std::fs;
use std::process::ExitCode;

pub(crate) fn certify_timed_door(path: &str, row: &str, target_id: &str) -> ExitCode {
    let parsed = (|| -> Result<(u32, i16), String> {
        Ok((
            parse_probe_row(row)?,
            target_id.parse::<i16>().map_err(|_| {
                "target-extra-action-point-id must fit a signed 16-bit integer".to_string()
            })?,
        ))
    })();
    let (row, target_id) = match parsed {
        Ok(values) => values,
        Err(error) => return report_error(error),
    };
    let result = (|| -> Result<serde_json::Value, String> {
        let source = fs::read(path).map_err(|error| format!("could not read {path}: {error}"))?;
        let (snapshot, original_door) = prepare_repair(&source, row)?;
        let compiled = compile_repair(snapshot, &source, row, target_id)?;
        verify_repair(path, &source, &compiled, row, target_id, original_door)
    })();

    match result {
        Ok(report) => {
            println!(
                "{}",
                serde_json::to_string_pretty(&report)
                    .expect("Data TD3 certification report serializes")
            );
            ExitCode::SUCCESS
        }
        Err(error) => report_error(error),
    }
}

fn prepare_repair(source: &[u8], row: u32) -> Result<(ProjectSnapshot, i16), String> {
    let decoded = decode_timed_encounters(source);
    let original_door = decoded
        .records
        .iter()
        .find(|candidate| candidate.native_id.0 == row)
        .map(|encounter| encounter.door)
        .ok_or_else(|| {
            format!(
                "Data TD3 row {row} is outside the {} complete source rows",
                decoded.records.len()
            )
        })?;
    let no_edit = encode_timed_encounters(&decoded.records, Some(source))
        .map_err(|error| error.to_string())?;
    if no_edit != source {
        return Err("Data TD3 failed exact no-edit round-trip validation".into());
    }

    let mut snapshot = ProjectSnapshot::new_authored(StableId("timed-door-repair-probe".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{:x}", Sha256::digest(source))),
    };
    snapshot.timed_encounters = decoded.records;
    Ok((snapshot, original_door))
}

fn compile_repair(
    snapshot: ProjectSnapshot,
    source: &[u8],
    row: u32,
    target_id: i16,
) -> Result<Vec<u8>, String> {
    let mut session = EditorSession::new(snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetTimedEncounterReference {
                source: StableId(format!("timed-encounter:{row}")),
                field: "door".into(),
                target_id,
            },
        })
        .map_err(|error| error.to_string())?;
    let compiled = encode_timed_encounters(&session.snapshot().timed_encounters, Some(source))
        .map_err(|error| error.to_string())?;
    let repeated = encode_timed_encounters(&session.snapshot().timed_encounters, Some(source))
        .map_err(|error| error.to_string())?;
    if repeated != compiled {
        return Err("repeated Data TD3 compilation was not deterministic".into());
    }
    Ok(compiled)
}

fn verify_repair(
    path: &str,
    source: &[u8],
    compiled: &[u8],
    row: u32,
    target_id: i16,
    original_door: i16,
) -> Result<serde_json::Value, String> {
    let row_start = usize::try_from(row)
        .ok()
        .and_then(|row| row.checked_mul(TIMED_ENCOUNTER_RECORD_BYTES))
        .ok_or_else(|| "row byte offset overflowed the host index".to_string())?;
    let owned_start = row_start + 6;
    let owned_end = owned_start + 2;
    let changed_offsets = verify_owned_bytes(
        source,
        compiled,
        owned_start..owned_end,
        "Data TD3 repair changed bytes outside owned range",
    )?;
    let reimported_door = decode_timed_encounters(compiled)
        .records
        .into_iter()
        .find(|candidate| candidate.native_id.0 == row)
        .map(|encounter| encounter.door)
        .ok_or_else(|| "compiled Data TD3 row was not reimported".to_string())?;
    if reimported_door != target_id {
        return Err("reimported Timed Encounter door did not match the requested repair".into());
    }
    let source_still_exact = ensure_source_unchanged(path, source)?;

    Ok(json!({
        "path": path,
        "row": row,
        "originalDoor": original_door,
        "reimportedDoor": reimported_door,
        "ownedByteRange": {"start": owned_start, "end": owned_end},
        "changedOffsets": changed_offsets,
        "sourceBytes": source.len(),
        "sourceSha256": format!("{:x}", Sha256::digest(source)),
        "compiledSha256": format!("{:x}", Sha256::digest(compiled)),
        "noEditRoundTripExact": true,
        "repeatedCompileExact": true,
        "reimportSemanticsExact": true,
        "sourceStillExact": source_still_exact,
        "readOnlyProbe": true,
    }))
}
