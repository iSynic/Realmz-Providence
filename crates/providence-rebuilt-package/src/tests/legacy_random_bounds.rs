use super::*;
use providence_core::rebuilt::RebuiltV3WorldDocument;

fn documents_with_bound(left: i16) -> Vec<(String, Vec<u8>)> {
    let mut documents = reimportable_documents();
    let mut world: Value = serde_json::from_slice(&documents[1].1).unwrap();
    world["maps"][0]["randomRectangles"] = json!([{
        "id":"land:0:random:0","top":0,"left":left,"bottom":0,"right":0,
        "chanceTenThousand":0,"battleRange":[0,0],"randomDoors":[0,0,0],
        "randomDoorPercent":[0,0,0],"only":false,"option":0,"soundId":0,"textId":0
    }]);
    documents[1].1 = serde_json::to_vec(&world).unwrap();
    documents
}

#[test]
fn archived_reader_keeps_unsigned_byte_bounds_while_v7_keeps_signed_words() {
    for left in [i16::MIN, -1, 0, 89, 255, 256, i16::MAX] {
        let documents = documents_with_bound(left);
        let world: RebuiltV3WorldDocument = serde_json::from_slice(&documents[1].1).unwrap();
        for version in 3..=6 {
            assert_eq!(
                crate::native_tiles::validate_legacy_bounds(version, &world).is_ok(),
                u8::try_from(left).is_ok(),
                "v{version}, left {left}"
            );
        }
        crate::native_tiles::validate_legacy_bounds(7, &world).unwrap();
        let inputs = borrowed_files(&documents);
        let manifest = fixture_manifest(&inputs);
        let bytes = write_rebuilt_v3_archive(Cursor::new(Vec::new()), &manifest, &inputs)
            .unwrap()
            .into_inner();
        assert_eq!(
            inspect_rebuilt_v3_archive(Cursor::new(bytes)).is_ok(),
            u8::try_from(left).is_ok(),
            "left {left}"
        );
    }
}
