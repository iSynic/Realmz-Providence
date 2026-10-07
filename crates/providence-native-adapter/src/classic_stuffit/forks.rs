use std::collections::BTreeMap;

#[derive(Default)]
pub(super) struct Forks<'a> {
    pub resource: &'a [u8],
    pub file_type: [u8; 4],
    pub creator: [u8; 4],
    pub flags: u16,
    pub created: u32,
    pub modified: u32,
    pub metadata_known: bool,
    pub omitted_metadata: bool,
}

// These are the compiler's explicit resource sources, not a filename heuristic.
pub(super) fn is_sidecar(path: &str) -> bool {
    matches!(path, "Scenario.rsrc" | "Data NI.rsrc" | "Data Spell.rsrc")
}

pub(super) fn decode(bytes: Option<&[u8]>) -> Result<Forks<'_>, String> {
    let Some(bytes) = bytes else {
        return Ok(Forks::default());
    };
    if !bytes.starts_with(&0x00051607u32.to_be_bytes())
        && !bytes.starts_with(&0x00051600u32.to_be_bytes())
    {
        return Ok(Forks {
            resource: bytes,
            ..Default::default()
        });
    }
    let entries = container_entries(bytes)?;
    let resource = *entries
        .get(&2)
        .ok_or("AppleDouble source has no resource fork")?;
    if entries.get(&1).is_some_and(|data| !data.is_empty()) {
        return Err("Resource sidecar also contains a data fork; import its complete AppleSingle file before exporting.".into());
    }
    let mut result = Forks {
        resource,
        omitted_metadata: entries.keys().any(|id| !matches!(id, 1 | 2 | 8 | 9)),
        ..Default::default()
    };
    if let Some(finder) = entries.get(&9) {
        if finder.len() < 10 {
            return Err("AppleDouble Finder metadata is truncated".into());
        }
        result.file_type.copy_from_slice(&finder[..4]);
        result.creator.copy_from_slice(&finder[4..8]);
        let flags = u16::from_be_bytes(finder[8..10].try_into().unwrap());
        result.flags = flags & 0xfc00;
        result.omitted_metadata |= flags & !0xfc00 != 0;
        result.metadata_known = true;
        result.omitted_metadata |= finder
            .get(10..)
            .is_some_and(|tail| tail.iter().any(|byte| *byte != 0));
    }
    if let Some(dates) = entries.get(&8) {
        if u32_at(bytes, 4)? != 0x00020000 {
            return Err("Version 1 AppleDouble dates require explicit import conversion before StuffIt export".into());
        }
        if dates.len() != 16 {
            return Err("AppleDouble date metadata must contain four signed timestamps".into());
        }
        result.created = mac_date(&dates[..4])?;
        result.modified = mac_date(&dates[4..8])?;
        result.omitted_metadata |= dates[8..].iter().any(|byte| *byte != 0);
    }
    Ok(result)
}

fn mac_date(bytes: &[u8]) -> Result<u32, String> {
    let date = i32::from_be_bytes(bytes.try_into().unwrap());
    if date == i32::MIN {
        return Ok(0);
    }
    u32::try_from(i64::from(date) + 3_029_529_600)
        .map_err(|_| "AppleDouble date is outside the Classic Mac timestamp range".into())
}

fn container_entries(bytes: &[u8]) -> Result<BTreeMap<u32, &[u8]>, String> {
    if bytes.len() < 26 || !matches!(u32_at(bytes, 4)?, 0x00010000 | 0x00020000) {
        return Err("Unsupported or truncated AppleDouble header".into());
    }
    let count = u16::from_be_bytes(bytes[24..26].try_into().unwrap()) as usize;
    let header_end = 26 + 12 * count;
    if header_end > bytes.len() {
        return Err("AppleDouble descriptor table is truncated".into());
    }
    let mut entries = BTreeMap::new();
    let mut ranges = Vec::new();
    for index in 0..count {
        let offset = 26 + 12 * index;
        let id = u32_at(bytes, offset)?;
        let start = u32_at(bytes, offset + 4)? as usize;
        let length = u32_at(bytes, offset + 8)? as usize;
        let end = start
            .checked_add(length)
            .ok_or("AppleDouble extent overflow")?;
        if start < header_end || ranges.iter().any(|&(a, b)| start < b && a < end) {
            return Err("AppleDouble entries overlap their header or another entry".into());
        }
        let entry = bytes
            .get(start..end)
            .ok_or("AppleDouble entry is outside its source bytes")?;
        if entries.insert(id, entry).is_some() {
            return Err("Duplicate AppleDouble entry identity".into());
        }
        ranges.push((start, end));
    }
    Ok(entries)
}

fn u32_at(bytes: &[u8], offset: usize) -> Result<u32, String> {
    Ok(u32::from_be_bytes(
        bytes
            .get(offset..offset + 4)
            .ok_or("Truncated AppleDouble field")?
            .try_into()
            .unwrap(),
    ))
}
