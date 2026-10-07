use crate::output::parse_probe_row;
use crate::output::report_error;
use crate::read_only_probe::{ensure_source_unchanged, verify_owned_bytes};
use providence_core::codecs::EXTRA_ACTION_POINT_RECORD_BYTES;
use providence_core::codecs::decode_extra_action_points;
use providence_core::codecs::encode_extra_action_points;
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

pub(crate) fn certify_extra_action_target(
    path: &str,
    row: &str,
    slot: &str,
    target_id: &str,
) -> ExitCode {
    let parsed = (|| -> Result<(u32, u8, i16), String> {
        let slot = slot
            .parse::<u8>()
            .map_err(|_| "slot must be an integer from zero through seven".to_string())?;
        if slot >= 8 {
            return Err("slot must be an integer from zero through seven".into());
        }
        Ok((
            parse_probe_row(row)?,
            slot,
            target_id
                .parse::<i16>()
                .map_err(|_| "target-id must fit a signed 16-bit integer".to_string())?,
        ))
    })();
    let (row, slot, target_id) = match parsed {
        Ok(values) => values,
        Err(error) => return report_error(error),
    };
    let result = (|| -> Result<serde_json::Value, String> {
        let source = fs::read(path).map_err(|error| format!("could not read {path}: {error}"))?;
        let (snapshot, original_target) = prepare_repair(&source, row, slot)?;
        let compiled = compile_repair(snapshot, &source, row, slot, target_id)?;
        verify_repair(
            path,
            &source,
            &compiled,
            row,
            slot,
            target_id,
            original_target,
        )
    })();

    match result {
        Ok(report) => {
            println!(
                "{}",
                serde_json::to_string_pretty(&report)
                    .expect("Data ED3 certification report serializes")
            );
            ExitCode::SUCCESS
        }
        Err(error) => report_error(error),
    }
}

pub(crate) fn certify_extra_action_create(path: &str, target_id: &str) -> ExitCode {
    let target_id = match target_id
        .parse::<u32>()
        .map_err(|_| "target-native-id must fit an unsigned 32-bit integer".to_string())
    {
        Ok(target_id) => target_id,
        Err(error) => return report_error(error),
    };
    let result = (|| -> Result<serde_json::Value, String> {
        let source = fs::read(path).map_err(|error| format!("could not read {path}: {error}"))?;
        let (snapshot, source_rows) = prepare_creation(&source)?;
        let mut created = compile_creation(snapshot, &source, target_id)?;
        let expected_rows =
            verify_creation(&mut created.session, &source, &created.compiled, target_id)?;
        let source_still_exact = ensure_source_unchanged(path, &source)?;
        let compiled = created.compiled;
        Ok(json!({
            "path": path,
            "targetNativeId": target_id,
            "sourceRows": source_rows,
            "compiledRows": expected_rows,
            "createdRows": expected_rows.saturating_sub(source_rows),
            "changedEntitiesTotal": created.changed_entities_total,
            "appendedByteRange": {"start": source.len(), "end": compiled.len()},
            "sourceBytes": source.len(),
            "compiledBytes": compiled.len(),
            "sourceSha256": format!("{:x}", Sha256::digest(&source)),
            "compiledSha256": format!("{:x}", Sha256::digest(&compiled)),
            "noEditRoundTripExact": true,
            "existingSourcePrefixExact": true,
            "appendedRowsAreCanonicalNoOps": true,
            "repeatedCompileExact": true,
            "reimportSemanticsExact": true,
            "undoRestoresExactSource": true,
            "sourceStillExact": source_still_exact,
            "readOnlyProbe": true,
        }))
    })();

    match result {
        Ok(report) => {
            println!(
                "{}",
                serde_json::to_string_pretty(&report).expect("Data ED3 creation report serializes")
            );
            ExitCode::SUCCESS
        }
        Err(error) => report_error(error),
    }
}

fn prepare_repair(source: &[u8], row: u32, slot: u8) -> Result<(ProjectSnapshot, i16), String> {
    let decoded = decode_extra_action_points(source);
    let original_row = decoded
        .records
        .iter()
        .find(|candidate| candidate.native_id.0 == row)
        .ok_or_else(|| {
            format!(
                "Data ED3 row {row} is outside the {} complete source rows",
                decoded.records.len()
            )
        })?;
    let original_target = original_row
        .actions
        .iter()
        .find(|action| action.slot == slot)
        .map(|action| action.target_native_id)
        .ok_or_else(|| format!("Data ED3 row {row} has no action in slot {slot}"))?;
    let no_edit = encode_extra_action_points(&decoded.records, Some(source))
        .map_err(|error| error.to_string())?;
    if no_edit != source {
        return Err("Data ED3 failed exact no-edit round-trip validation".into());
    }

    let mut snapshot = ProjectSnapshot::new_authored(StableId("extra-action-repair-probe".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{:x}", Sha256::digest(source))),
    };
    snapshot.extra_action_points = decoded.records;
    Ok((snapshot, original_target))
}

fn compile_repair(
    snapshot: ProjectSnapshot,
    source: &[u8],
    row: u32,
    slot: u8,
    target_id: i16,
) -> Result<Vec<u8>, String> {
    let mut session = EditorSession::new(snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RetargetActionReference {
                source: StableId(format!("extra-action-point:{row}")),
                slot,
                target_native_id: target_id,
            },
        })
        .map_err(|error| error.to_string())?;
    let compiled =
        encode_extra_action_points(&session.snapshot().extra_action_points, Some(source))
            .map_err(|error| error.to_string())?;
    let repeated =
        encode_extra_action_points(&session.snapshot().extra_action_points, Some(source))
            .map_err(|error| error.to_string())?;
    if repeated != compiled {
        return Err("repeated Data ED3 compilation was not deterministic".into());
    }
    Ok(compiled)
}

fn verify_repair(
    path: &str,
    source: &[u8],
    compiled: &[u8],
    row: u32,
    slot: u8,
    target_id: i16,
    original_target: i16,
) -> Result<serde_json::Value, String> {
    let row_start = usize::try_from(row)
        .ok()
        .and_then(|row| row.checked_mul(EXTRA_ACTION_POINT_RECORD_BYTES))
        .ok_or_else(|| "row byte offset overflowed the host index".to_string())?;
    let owned_start = row_start + 24 + usize::from(slot) * 2;
    let owned_end = owned_start + 2;
    let changed_offsets = verify_owned_bytes(
        source,
        compiled,
        owned_start..owned_end,
        "Data ED3 repair changed bytes outside owned range",
    )?;
    let reimported = decode_extra_action_points(compiled);
    let reimported_target = reimported
        .records
        .iter()
        .find(|candidate| candidate.native_id.0 == row)
        .and_then(|candidate| candidate.actions.iter().find(|action| action.slot == slot))
        .map(|action| action.target_native_id)
        .ok_or_else(|| "compiled Data ED3 action was not reimported".to_string())?;
    if reimported_target != target_id {
        return Err("reimported Data ED3 target did not match the requested repair".into());
    }
    let source_still_exact = ensure_source_unchanged(path, source)?;

    Ok(json!({
        "path": path,
        "row": row,
        "slot": slot,
        "originalTargetId": original_target,
        "reimportedTargetId": reimported_target,
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
struct CreatedTable {
    session: EditorSession,
    compiled: Vec<u8>,
    changed_entities_total: usize,
}

fn prepare_creation(source: &[u8]) -> Result<(ProjectSnapshot, usize), String> {
    if !source.len().is_multiple_of(EXTRA_ACTION_POINT_RECORD_BYTES) {
        return Err(format!(
            "Data ED3 has {} trailing bytes; dense target creation requires complete 40-byte rows",
            source.len() % EXTRA_ACTION_POINT_RECORD_BYTES
        ));
    }
    let decoded = decode_extra_action_points(source);
    let source_rows = decoded.records.len();
    let no_edit = encode_extra_action_points(&decoded.records, Some(source))
        .map_err(|error| error.to_string())?;
    if no_edit != source {
        return Err("Data ED3 failed exact no-edit round-trip validation".into());
    }

    let mut snapshot = ProjectSnapshot::new_authored(StableId("extra-action-create-probe".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{:x}", Sha256::digest(source))),
    };
    snapshot.extra_action_points = decoded.records;
    Ok((snapshot, source_rows))
}

fn compile_creation(
    snapshot: ProjectSnapshot,
    source: &[u8],
    target_id: u32,
) -> Result<CreatedTable, String> {
    let mut session = EditorSession::new(snapshot);
    let acknowledgement = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::CreateExtraActionPoint {
                native_id: Some(providence_core::model::NativeRecordId(target_id)),
            },
        })
        .map_err(|error| error.to_string())?;
    let compiled =
        encode_extra_action_points(&session.snapshot().extra_action_points, Some(source))
            .map_err(|error| error.to_string())?;
    let repeated =
        encode_extra_action_points(&session.snapshot().extra_action_points, Some(source))
            .map_err(|error| error.to_string())?;
    if repeated != compiled {
        return Err("repeated Data ED3 compilation was not deterministic".into());
    }
    Ok(CreatedTable {
        session,
        compiled,
        changed_entities_total: acknowledgement.changed_entities_total,
    })
}

fn verify_creation(
    session: &mut EditorSession,
    source: &[u8],
    compiled: &[u8],
    target_id: u32,
) -> Result<usize, String> {
    if !compiled.starts_with(source) {
        return Err("Data ED3 target creation changed an existing source byte".into());
    }
    let expected_rows = usize::try_from(target_id)
        .ok()
        .and_then(|target| target.checked_add(1))
        .ok_or_else(|| "target row count overflowed the host index".to_string())?;
    if session.snapshot().extra_action_points.len() != expected_rows
        || compiled.len() != expected_rows * EXTRA_ACTION_POINT_RECORD_BYTES
    {
        return Err("Data ED3 target creation did not materialize the required dense table".into());
    }
    let appended = &compiled[source.len()..];
    if appended.iter().any(|byte| *byte != 0) {
        return Err("new dense Data ED3 rows were not canonical no-op records".into());
    }
    let reimported = decode_extra_action_points(compiled);
    if reimported.records != session.snapshot().extra_action_points {
        return Err("reimported Data ED3 semantics did not match the created table".into());
    }
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .map_err(|error| error.to_string())?;
    let undo_compiled =
        encode_extra_action_points(&session.snapshot().extra_action_points, Some(source))
            .map_err(|error| error.to_string())?;
    if undo_compiled != source {
        return Err("undo did not restore exact Data ED3 source semantics".into());
    }
    Ok(expected_rows)
}
