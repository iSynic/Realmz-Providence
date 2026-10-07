use super::encode_scenario_picture_pict;
use crate::codecs::decode_classic_pict;

#[test]
fn two_pixel_run_at_the_literal_boundary_round_trips_without_overflow() {
    for width in [129, 250, 640] {
        let rgba: Vec<_> = (0..width)
            .flat_map(|x| {
                let white = x % 129 < 127 && x % 129 % 2 == 0;
                if white {
                    [248, 248, 248, 255]
                } else {
                    [0, 0, 0, 255]
                }
            })
            .collect();
        let encoded = encode_scenario_picture_pict(&rgba, width, 1, false).unwrap();
        let decoded = decode_classic_pict(&encoded).unwrap();
        assert_eq!((decoded.width, decoded.height), (width, 1));
        assert_eq!(decoded.rgba, rgba);
    }
}
