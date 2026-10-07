use crate::output::parse_probe_row;
use crate::output::report_error;
use crate::read_only_probe::{ensure_source_unchanged, verify_owned_bytes};
use providence_core::codecs::decode_extra_codes;
use providence_core::codecs::encode_extra_codes;
use providence_core::model::BlobId;
use providence_core::model::ProjectOrigin;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_core::session::ExpectedRevisionCommand;
use providence_core::session::ExtraCodeBranchLayout;
use providence_core::session::Revision;
use serde_json::json;
use sha2::Digest;
use sha2::Sha256;
use std::fs;
use std::process::ExitCode;

pub(crate) fn certify_extra_code_battle_range(
    path: &str,
    row: &str,
    low_id: &str,
    high_id: &str,
) -> ExitCode {
    let parsed = (|| -> Result<(u32, i16, i16), String> {
        Ok((
            parse_probe_row(row)?,
            low_id
                .parse::<i16>()
                .map_err(|_| "low-id must fit a signed 16-bit integer".to_string())?,
            high_id
                .parse::<i16>()
                .map_err(|_| "high-id must fit a signed 16-bit integer".to_string())?,
        ))
    })();
    let (row, low_id, high_id) = match parsed {
        Ok(values) => values,
        Err(error) => return report_error(error),
    };
    certify_extra_code_edit(
        path,
        row,
        EditorCommand::RetargetExtraCodeBattleRange {
            source: StableId(format!("extra-code:{row}")),
            low_id,
            high_id,
        },
        &[(0, low_id), (1, high_id)],
        json!({"kind": "battle-range", "lowId": low_id, "highId": high_id}),
    )
}

pub(crate) fn certify_extra_code_value(
    path: &str,
    row: &str,
    index: &str,
    target_id: &str,
) -> ExitCode {
    let parsed = (|| -> Result<(u32, u8, i16), String> {
        let index = index
            .parse::<u8>()
            .map_err(|_| "index must be an integer from zero through four".to_string())?;
        if index >= 5 {
            return Err("index must be an integer from zero through four".into());
        }
        Ok((
            parse_probe_row(row)?,
            index,
            target_id
                .parse::<i16>()
                .map_err(|_| "target-id must fit a signed 16-bit integer".to_string())?,
        ))
    })();
    let (row, index, target_id) = match parsed {
        Ok(values) => values,
        Err(error) => return report_error(error),
    };
    certify_extra_code_edit(
        path,
        row,
        EditorCommand::RetargetExtraCodeValue {
            source: StableId(format!("extra-code:{row}")),
            index,
            target_id,
        },
        &[(usize::from(index), target_id)],
        json!({"kind": "scalar", "index": index, "targetId": target_id}),
    )
}

pub(crate) fn certify_extra_code_branch(
    path: &str,
    row: &str,
    layout: &str,
    mode: &str,
    target_id: &str,
) -> ExitCode {
    let parsed = (|| -> Result<(u32, ExtraCodeBranchLayout, i16, i16), String> {
        let layout = serde_json::from_value(serde_json::Value::String(layout.into()))
            .map_err(|_| "layout must be choice or force".to_string())?;
        Ok((
            parse_probe_row(row)?,
            layout,
            mode.parse::<i16>()
                .map_err(|_| "mode must fit a signed 16-bit integer".to_string())?,
            target_id
                .parse::<i16>()
                .map_err(|_| "target-id must fit a signed 16-bit integer".to_string())?,
        ))
    })();
    let (row, layout, mode, target_id) = match parsed {
        Ok(values) => values,
        Err(error) => return report_error(error),
    };
    let (mode_index, target_index, layout_name) = match layout {
        ExtraCodeBranchLayout::Choice => (1, 2, "choice"),
        ExtraCodeBranchLayout::Force => (2, 3, "force"),
    };
    certify_extra_code_edit(
        path,
        row,
        EditorCommand::RetargetExtraCodeBranch {
            source: StableId(format!("extra-code:{row}")),
            layout,
            mode,
            target_id,
        },
        &[(mode_index, mode), (target_index, target_id)],
        json!({
            "kind": "branch",
            "layout": layout_name,
            "mode": mode,
            "targetId": target_id,
        }),
    )
}

pub(crate) fn certify_extra_code_edit(
    path: &str,
    row: u32,
    command: EditorCommand,
    replacements: &[(usize, i16)],
    edit: serde_json::Value,
) -> ExitCode {
    let result = (|| -> Result<serde_json::Value, String> {
        let repair = RepairRequest::new(row, replacements, edit)?;
        let source = fs::read(path).map_err(|error| format!("could not read {path}: {error}"))?;
        let (snapshot, original) = prepare_repair(&source, row)?;
        let compiled = compile_repair(snapshot, &source, command)?;
        repair.verify(path, &source, &compiled, original)
    })();

    match result {
        Ok(report) => {
            println!(
                "{}",
                serde_json::to_string_pretty(&report)
                    .expect("Data EDCD certification report serializes")
            );
            ExitCode::SUCCESS
        }
        Err(error) => report_error(error),
    }
}

struct RepairRequest<'a> {
    row: u32,
    replacements: &'a [(usize, i16)],
    edit: serde_json::Value,
    first_index: usize,
    last_index: usize,
}
impl<'a> RepairRequest<'a> {
    fn new(
        row: u32,
        replacements: &'a [(usize, i16)],
        edit: serde_json::Value,
    ) -> Result<Self, String> {
        let first_index = replacements
            .first()
            .map(|(index, _)| *index)
            .ok_or_else(|| "repair probe must own at least one value".to_string())?;
        let last_index = replacements
            .last()
            .map(|(index, _)| *index)
            .ok_or_else(|| "repair probe must own at least one value".to_string())?;
        if last_index >= 5
            || replacements
                .windows(2)
                .any(|pair| pair[1].0 != pair[0].0 + 1)
        {
            return Err("repair probe values must be one contiguous Data EDCD span".into());
        }
        Ok(Self {
            row,
            replacements,
            edit,
            first_index,
            last_index,
        })
    }
    fn verify(
        self,
        path: &str,
        source: &[u8],
        compiled: &[u8],
        original: [i16; 5],
    ) -> Result<serde_json::Value, String> {
        let Self {
            row,
            replacements,
            edit,
            first_index,
            last_index,
        } = self;
        let row_start = usize::try_from(row)
            .ok()
            .and_then(|row| row.checked_mul(providence_core::codecs::EXTRA_CODE_RECORD_BYTES))
            .ok_or_else(|| "row byte offset overflowed the host index".to_string())?;
        let owned_start = row_start + first_index * 2;
        let owned_end = row_start + (last_index + 1) * 2;
        let changed_offsets = verify_owned_bytes(
            source,
            compiled,
            owned_start..owned_end,
            "Data EDCD repair changed bytes outside owned range",
        )?;
        let reimported = decode_extra_codes(compiled);
        let reimported_values = reimported
            .rows
            .iter()
            .find(|candidate| candidate.native_id.0 == row)
            .expect("compiled row remains addressable")
            .values;
        let mut expected = original;
        for (index, value) in replacements {
            expected[*index] = *value;
        }
        if reimported_values != expected {
            return Err("reimported Data EDCD semantics did not match the requested repair".into());
        }
        let source_still_exact = ensure_source_unchanged(path, source)?;

        Ok(json!({
            "path": path,
            "row": row,
            "edit": edit,
            "originalValues": original,
            "reimportedValues": reimported_values,
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
}

fn prepare_repair(source: &[u8], row: u32) -> Result<(ProjectSnapshot, [i16; 5]), String> {
    let decoded = decode_extra_codes(source);
    let original = decoded
        .rows
        .iter()
        .find(|candidate| candidate.native_id.0 == row)
        .ok_or_else(|| {
            format!(
                "Data EDCD row {row} is outside the {} complete source rows",
                decoded.rows.len()
            )
        })?
        .values;
    let no_edit =
        encode_extra_codes(&decoded.rows, Some(source)).map_err(|error| error.to_string())?;
    if no_edit != source {
        return Err("Data EDCD failed exact no-edit round-trip validation".into());
    }

    let mut snapshot = ProjectSnapshot::new_authored(StableId("extra-code-repair-probe".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{:x}", Sha256::digest(source))),
    };
    snapshot.extra_codes = decoded.rows;
    Ok((snapshot, original))
}

fn compile_repair(
    snapshot: ProjectSnapshot,
    source: &[u8],
    command: EditorCommand,
) -> Result<Vec<u8>, String> {
    let mut session = EditorSession::new(snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command,
        })
        .map_err(|error| error.to_string())?;
    let compiled = encode_extra_codes(&session.snapshot().extra_codes, Some(source))
        .map_err(|error| error.to_string())?;
    let repeated = encode_extra_codes(&session.snapshot().extra_codes, Some(source))
        .map_err(|error| error.to_string())?;
    if repeated != compiled {
        return Err("repeated Data EDCD compilation was not deterministic".into());
    }
    Ok(compiled)
}
