use super::*;
use std::{fs::File, io::Write};

#[test]
fn request_is_strict_hash_pinned_and_no_clobber() {
    let temporary = tempdir().unwrap();
    let package = temporary.path().join("scenario.realmz2");
    File::create(&package)
        .unwrap()
        .write_all(b"package bytes")
        .unwrap();
    let request_path = temporary.path().join("preview-request.json");
    let result_path = temporary.path().join("preview-result.json");
    let target = PreviewTarget::ActionPoint {
        id: "ap:0".into(),
        map_id: "land:0".into(),
        x: 4,
        y: 9,
    };
    let request = prepare_request(&package, &request_path, &result_path, target, 17).unwrap();
    let decoded: PreviewRequest =
        serde_json::from_slice(&fs::read(&request_path).unwrap()).unwrap();
    assert_eq!(decoded, request);
    assert_eq!(
        request.package_sha256,
        "2e547448dcd0f2fcd9dbc386d33f1553369883451898177559bcf3e3b1083d16"
    );
    assert!(
        prepare_request(
            &package,
            &request_path,
            &result_path,
            PreviewTarget::SimpleEncounter { id: 0 },
            17
        )
        .unwrap_err()
        .contains("already exists")
    );
}
