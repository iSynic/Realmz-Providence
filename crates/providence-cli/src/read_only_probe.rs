use std::ops::Range;

// Certification edits are in-memory only. Re-read after all checks so a probe
// cannot certify a source that changed while it was inspecting its bytes.
pub(crate) fn ensure_source_unchanged(path: &str, source: &[u8]) -> Result<bool, String> {
    let current =
        std::fs::read(path).map_err(|error| format!("could not reread {path}: {error}"))?;
    if current != source {
        return Err("source changed during the read-only certification probe".into());
    }
    Ok(true)
}

pub(crate) fn verify_owned_bytes(
    source: &[u8],
    compiled: &[u8],
    owned: Range<usize>,
    error_context: &str,
) -> Result<Vec<usize>, String> {
    let changed_offsets = compiled
        .iter()
        .zip(source)
        .enumerate()
        .filter_map(|(offset, (after, before))| (after != before).then_some(offset))
        .collect::<Vec<_>>();
    if changed_offsets.iter().any(|offset| !owned.contains(offset)) {
        return Err(format!("{error_context} {}..{}", owned.start, owned.end));
    }
    Ok(changed_offsets)
}

#[cfg(test)]
mod tests;
