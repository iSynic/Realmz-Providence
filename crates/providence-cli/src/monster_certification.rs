use crate::output::parse_probe_row;
use crate::output::report_error;
use crate::read_only_probe::{ensure_source_unchanged, verify_owned_bytes};
use providence_core::codecs::MONSTER_RECORD_BYTES;
use providence_core::codecs::decode_monster_set;
use providence_core::codecs::encode_monster_set;
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

#[cfg(test)]
mod tests;

pub(crate) fn certify_monster_death_macro(path: &str, row: &str, target_id: &str) -> ExitCode {
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
        let (snapshot, original_death_macro) = prepare_repair(&source, row)?;
        let compiled = compile_repair(snapshot, &source, row, target_id)?;
        verify_repair(
            path,
            &source,
            &compiled,
            row,
            target_id,
            original_death_macro,
        )
    })();

    match result {
        Ok(report) => {
            println!(
                "{}",
                serde_json::to_string_pretty(&report)
                    .expect("Data MD certification report serializes")
            );
            ExitCode::SUCCESS
        }
        Err(error) => report_error(error),
    }
}

fn prepare_repair(source: &[u8], row: u32) -> Result<(ProjectSnapshot, i16), String> {
    let set = decode_monster_set(source, "Data MD", 0);
    let original_death_macro = set
        .monsters
        .iter()
        .find(|candidate| candidate.native_id.0 == row)
        .map(|monster| monster.death_macro)
        .ok_or_else(|| {
            format!(
                "Data MD row {row} is outside the {} complete source rows",
                set.monsters.len()
            )
        })?;
    let no_edit = encode_monster_set(&set, Some(source)).map_err(|error| error.to_string())?;
    if no_edit != source {
        return Err("Data MD failed exact no-edit round-trip validation".into());
    }

    let mut snapshot =
        ProjectSnapshot::new_authored(StableId("monster-death-macro-repair-probe".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{:x}", Sha256::digest(source))),
    };
    snapshot.monster_sets.push(set);
    Ok((snapshot, original_death_macro))
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
            command: EditorCommand::RetargetMonsterReference {
                source: StableId(format!("monster:0:{row}")),
                field: "deathMacro".into(),
                target_id,
            },
        })
        .map_err(|error| error.to_string())?;
    let edited_set = session
        .snapshot()
        .monster_sets
        .iter()
        .find(|candidate| candidate.set_id == 0)
        .expect("edited Data MD set remains present");
    let compiled =
        encode_monster_set(edited_set, Some(source)).map_err(|error| error.to_string())?;
    let repeated =
        encode_monster_set(edited_set, Some(source)).map_err(|error| error.to_string())?;
    if repeated != compiled {
        return Err("repeated Data MD compilation was not deterministic".into());
    }
    Ok(compiled)
}

fn verify_repair(
    path: &str,
    source: &[u8],
    compiled: &[u8],
    row: u32,
    target_id: i16,
    original_death_macro: i16,
) -> Result<serde_json::Value, String> {
    let row_start = usize::try_from(row)
        .ok()
        .and_then(|row| row.checked_mul(MONSTER_RECORD_BYTES))
        .ok_or_else(|| "row byte offset overflowed the host index".to_string())?;
    let owned_start = row_start + 166;
    let owned_end = owned_start + 2;
    let changed_offsets = verify_owned_bytes(
        source,
        compiled,
        owned_start..owned_end,
        "Data MD repair changed bytes outside deathMacro range",
    )?;
    let reimported_death_macro = decode_monster_set(compiled, "Data MD", 0)
        .monsters
        .into_iter()
        .find(|candidate| candidate.native_id.0 == row)
        .map(|monster| monster.death_macro)
        .ok_or_else(|| "compiled Data MD row was not reimported".to_string())?;
    if reimported_death_macro != target_id {
        return Err("reimported Monster death macro did not match the requested repair".into());
    }
    let source_still_exact = ensure_source_unchanged(path, source)?;

    Ok(json!({
        "path": path,
        "row": row,
        "setId": 0,
        "originalDeathMacro": original_death_macro,
        "reimportedDeathMacro": reimported_death_macro,
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
