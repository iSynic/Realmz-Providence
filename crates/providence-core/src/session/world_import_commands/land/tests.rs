use super::*;
use crate::codecs::decode_extra_action_points;
use crate::model::BlobId;

const WHITE_DRAGON_DATA_ED3_SHA256: &str =
    "ff82bb8ad3f1585b9cc70fd869ec0f89932e922c28bdfd826620af77c4d5a608";

#[test]
fn xap_import_requires_every_complete_physical_row_independent_of_source_hash() {
    let records = decode_extra_action_points(&vec![0; 86_040]).records;
    assert_eq!(records.len(), 2151);
    let paths = BTreeSet::from(["Data ED3"]);
    for digest in [WHITE_DRAGON_DATA_ED3_SHA256.to_owned(), "0".repeat(64)] {
        let source = ClassicSourceBlob {
            native_path: "Data ED3".into(),
            blob: BlobId(format!("sha256:{digest}")),
            byte_length: 86_040,
        };
        validate_extra_action_points(view(&source, &records), &paths).unwrap();
        assert!(validate_extra_action_points(view(&source, &records[..394]), &paths).is_err());
    }
}

#[test]
fn xap_import_retains_complete_prefix_of_a_fragment_without_inventing_a_row() {
    let records = decode_extra_action_points(&[0; 43]).records;
    let source = ClassicSourceBlob {
        native_path: "Data ED3".into(),
        blob: BlobId("sha256:fixture".into()),
        byte_length: 43,
    };
    let paths = BTreeSet::from(["Data ED3"]);
    validate_extra_action_points(view(&source, &records), &paths).unwrap();
    assert!(validate_extra_action_points(view(&source, &[]), &paths).is_err());
    let mut wrong_id = records;
    wrong_id[0].native_id.0 = 1;
    assert!(validate_extra_action_points(view(&source, &wrong_id), &paths).is_err());
}

fn view<'a>(
    source: &'a ClassicSourceBlob,
    records: &'a [ExtraActionPoint],
) -> ClassicLandImportView<'a> {
    ClassicLandImportView {
        sources: std::slice::from_ref(source),
        maps: &[],
        action_points: &[],
        messages: &[],
        simple_encounters: &[],
        extra_codes: &[],
        extra_action_points: records,
        global_macro_hooks: None,
        land_layout: None,
    }
}
