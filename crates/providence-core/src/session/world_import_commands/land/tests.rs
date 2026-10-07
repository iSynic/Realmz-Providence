use super::*;
use crate::codecs::decode_extra_action_points;
use crate::model::BlobId;

const WHITE_DRAGON_DATA_ED3_SHA256: &str =
    "ff82bb8ad3f1585b9cc70fd869ec0f89932e922c28bdfd826620af77c4d5a608";

#[test]
fn certified_foreign_tail_accepts_only_the_authored_xap_projection() {
    let records =
        decode_extra_action_points(&vec![0; 394 * EXTRA_ACTION_POINT_RECORD_BYTES]).records;
    let source = ClassicSourceBlob {
        native_path: "Data ED3".into(),
        blob: BlobId(format!("sha256:{WHITE_DRAGON_DATA_ED3_SHA256}")),
        byte_length: 86_040,
    };
    let paths = BTreeSet::from(["Data ED3"]);
    let input = view(&source, &records);
    validate_extra_action_points(input, &paths).expect("certified extent");

    let wrong_source = ClassicSourceBlob {
        blob: BlobId(format!("sha256:{}", "0".repeat(64))),
        ..source
    };
    let error = validate_extra_action_points(view(&wrong_source, &records), &paths)
        .expect_err("unknown aligned payload must not be reclassified");
    assert!(error.to_string().contains("does not match"));
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
