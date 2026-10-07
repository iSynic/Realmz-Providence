use super::*;

/// Retains every source color so unchanged and locked atlas pixels survive conversion.
pub fn encode_landlook_artwork_pict(rgba: &[u8], original: &[u8]) -> Result<Vec<u8>, String> {
    if rgba.len() != 640 * 320 * 4 || original.len() != rgba.len() {
        return Err("Landlook artwork must retain its complete 640 by 320 image.".into());
    }
    if original.chunks_exact(4).any(|pixel| pixel[3] != 255) {
        return Err("The current Landlook has transparent pixels and cannot be preserved as a Classic picture.".into());
    }
    let mut palette: Vec<[u8; 3]> = original
        .chunks_exact(4)
        .map(|pixel| [pixel[0], pixel[1], pixel[2]])
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    if palette.len() > 256 {
        return Err("The current atlas exceeds the Classic 256-color palette. Restore a compatible template before importing artwork.".into());
    }
    let mut colors = BTreeMap::<[u8; 3], usize>::new();
    for pixel in rgba.chunks_exact(4) {
        *colors.entry(opaque(pixel)).or_default() += 1;
    }
    let mut colors: Vec<_> = colors.into_iter().collect();
    colors.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    for (color, _) in colors {
        if palette.len() < 256 && !palette.contains(&color) {
            palette.push(color);
        }
    }
    let index: BTreeMap<_, _> = palette
        .iter()
        .enumerate()
        .map(|(index, color)| (*color, index as u8))
        .collect();
    let indices: Vec<_> = rgba
        .chunks_exact(4)
        .map(|pixel| {
            let color = opaque(pixel);
            index
                .get(&color)
                .copied()
                .unwrap_or_else(|| nearest_palette_index(&palette, color))
        })
        .collect();
    Ok(indexed_writer::encode(&indices, &palette, 640, 320))
}

fn opaque(pixel: &[u8]) -> [u8; 3] {
    let alpha = u32::from(pixel[3]);
    [0, 1, 2].map(|channel| {
        ((u32::from(pixel[channel]) * alpha + 255 * (255 - alpha) + 127) / 255) as u8
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn conversion_keeps_source_palette_exact_when_imports_need_quantization() {
        let original: Vec<_> = (0..640 * 320)
            .flat_map(|index| [index as u8, index as u8, index as u8, 255])
            .collect();
        let mut rgba = original.clone();
        for (index, pixel) in rgba[..32 * 4].chunks_exact_mut(4).enumerate() {
            pixel.copy_from_slice(&[index as u8, 255, 0, 255]);
        }
        let encoded = encode_landlook_artwork_pict(&rgba, &original).unwrap();
        let decoded = crate::codecs::decode_classic_pict(&encoded).unwrap();
        assert_eq!(&decoded.rgba[32 * 4..], &original[32 * 4..]);
        assert_eq!(&decoded.rgba[255 * 4..256 * 4], &[255, 255, 255, 255]);
    }
}
