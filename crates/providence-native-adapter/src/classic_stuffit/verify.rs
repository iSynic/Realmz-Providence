use super::checksum::crc16;

pub(super) fn check_archive_crc(bytes: &[u8]) -> Result<(), String> {
    let size = u32_at(bytes, 94)? as usize;
    let mut header = bytes
        .get(..size)
        .filter(|header| header.len() >= 100)
        .ok_or("Truncated StuffIt archive header")?
        .to_vec();
    header[98..100].fill(0);
    if crc16(&header) != u16_at(bytes, 98)? {
        return Err("StuffIt archive header CRC mismatch".into());
    }
    Ok(())
}

pub(super) fn metadata_crc(bytes: &[u8], offset: usize, has_resource: bool) -> Result<u16, String> {
    let size = if has_resource { 50 } else { 36 };
    let mut fields = bytes
        .get(offset..offset + size)
        .ok_or("Truncated StuffIt metadata checksum block")?
        .to_vec();
    fields[2..4].fill(0);
    Ok(crc16(&fields))
}

fn u32_at(bytes: &[u8], offset: usize) -> Result<u32, String> {
    Ok(u32::from_be_bytes(
        bytes
            .get(offset..offset + 4)
            .ok_or("Truncated StuffIt field")?
            .try_into()
            .unwrap(),
    ))
}
fn u16_at(bytes: &[u8], offset: usize) -> Result<u16, String> {
    Ok(u16::from_be_bytes(
        bytes
            .get(offset..offset + 2)
            .ok_or("Truncated StuffIt field")?
            .try_into()
            .unwrap(),
    ))
}
