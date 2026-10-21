use super::*;
use providence_core::model::{ProjectSnapshot, StableId};

fn map(kind: &str) -> MapLevel {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId("region".into())));
    crate::dispatch_result(
        &mut session,
        "map.create",
        json!({"expectedRevision":0,"levelType":kind}),
    )
    .unwrap();
    session.snapshot().world.maps[0].clone()
}
fn image(width: u32, height: u32, color: [u8; 4]) -> DecodedImage {
    DecodedImage {
        width,
        height,
        rgba: color.repeat(width as usize * height as usize),
    }
}
fn pixel(image: &mut DecodedImage, x: usize, y: usize, value: [u8; 4]) {
    let offset = (y * image.width as usize + x) * 4;
    image.rgba[offset..offset + 4].copy_from_slice(&value);
}

#[test]
fn land_region_uses_native_base_art_and_signed_overlay_without_mutating_words() {
    let mut map = map("land");
    map.tiles[0] = -1091;
    let before = map.clone();
    let atlas = image(640, 320, [10, 20, 30, 255]);
    let overlays = BTreeMap::from([(-91, image(16, 16, [90, 80, 70, 255]))]);
    let pixels = raster(
        &map,
        &json!({"x":0,"y":0,"width":2,"height":1}),
        &atlas,
        &overlays,
    )
    .unwrap();
    assert_eq!(&pixels[..4], &[90, 80, 70, 255]);
    assert_eq!(&pixels[CELL * 4..CELL * 4 + 4], &[10, 20, 30, 255]);
    assert_eq!(map, before);
}

#[test]
fn transparent_special_art_uses_each_landlooks_configured_base_instead_of_tile_one() {
    for base in [155, 156] {
        let mut map = map("land");
        map.runtime.as_mut().unwrap().base_tile = Some(base);
        map.tiles[0] = -1091;
        let mut atlas = image(640, 320, [0, 0, 100, 255]);
        let tile = base as usize - 1;
        for y in 0..32 {
            for x in 0..32 {
                pixel(
                    &mut atlas,
                    tile % 20 * 32 + x,
                    tile / 20 * 32 + y,
                    [40, 100, 30, 255],
                );
            }
        }
        let mut overlay = image(32, 32, [0, 0, 0, 0]);
        pixel(&mut overlay, 2, 2, [200, 20, 10, 255]);
        let pixels = raster(
            &map,
            &json!({"x":0,"y":0,"width":1,"height":1}),
            &atlas,
            &BTreeMap::from([(-91, overlay)]),
        )
        .unwrap();
        assert_eq!(&pixels[..4], &[40, 100, 30, 255]);
        assert_eq!(
            &pixels[(CELL + 1) * 4..(CELL + 1) * 4 + 4],
            &[200, 20, 10, 255]
        );
    }
}

#[test]
fn dungeon_region_uses_the_full_302_crop_floor_and_ordered_white_keyed_layers() {
    let mut map = map("dungeon");
    map.tiles[0] = 1;
    let mut atlas = image(640, 640, [255, 255, 255, 255]);
    pixel(&mut atlas, 576 + 3 * 16, 320 + 3 * 16, [20, 40, 60, 255]);
    pixel(&mut atlas, 576 + 1, 320, [80, 90, 100, 255]);
    let pixels = raster(
        &map,
        &json!({"x":0,"y":0,"width":1,"height":1}),
        &atlas,
        &BTreeMap::new(),
    )
    .unwrap();
    assert_eq!(&pixels[..4], &[20, 40, 60, 255]);
    assert_eq!(&pixels[4..8], &[80, 90, 100, 255]);
    assert_eq!(map.tiles[0], 1);
}

#[test]
fn ap_borders_expose_authored_chance_with_coordinate_origin_and_do_not_replace_interior() {
    let mut pixels = [23, 27, 32, 255].repeat(CELL * CELL * 2);
    let facts = json!({"x":8,"y":9,"width":2,"actionPoints":[
        {"coordinate":{"x":9,"y":9},"activation":{"chancePositive":false}}
    ]});
    mark_action_points(&mut pixels, &facts);
    let offset = (2 * CELL + CELL + 1) * 4;
    assert_eq!(&pixels[offset..offset + 4], &[245, 170, 45, 255]);
    assert_eq!(&pixels[..4], &[23, 27, 32, 255]);
}
