use super::*;

#[test]
fn monster_appearance_encoder_preserves_each_donor_canvas_preset() {
    for &(width, height) in MONSTER_APPEARANCE_CANVAS_PRESETS {
        let rgba = vec![255; width as usize * height as usize * 4];
        let first = encode_monster_appearance_cicn(&rgba, width, height).unwrap();
        let second = encode_monster_appearance_cicn(&rgba, width, height).unwrap();
        assert_eq!(first, second);
        let decoded = decode_cicn(&first).unwrap();
        assert_eq!((decoded.width, decoded.height), (width, height));
    }
    assert!(matches!(
        encode_monster_appearance_cicn(&vec![0; 48 * 48 * 4], 48, 48),
        Err(ScenarioIconCodecError::InvalidDimensions {
            width: 48,
            height: 48
        })
    ));
}

#[test]
fn monster_appearance_mirror_preserves_complete_rgba_pixels() {
    let source = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    assert_eq!(
        mirror_rgba_horizontally(&source, 2, 2).unwrap(),
        [5, 6, 7, 8, 1, 2, 3, 4, 13, 14, 15, 16, 9, 10, 11, 12,]
    );
}
