use super::*;
use crate::model::ClassicSourceBlob;

#[test]
fn final_v7_caption_uses_effective_source_without_trimming_editor_payload() {
    let mut snapshot = snapshot();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    let mut options = vec![0; crate::codecs::OPTION_LABEL_RECORD_BYTES];
    options[..5].copy_from_slice(&[4, 0x8e, b'Q', b' ', 0]);
    options.extend_from_slice(&[0xde, 0xad]);
    snapshot.option_labels = crate::codecs::decode_option_labels(&options).records;
    assert_eq!(snapshot.option_labels[0].text, "éQ  ");
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data OD".into(),
        blob: BlobId(format!("sha256:{}", sha256_hex(&options))),
        byte_length: options.len() as u64,
    });
    let path = add_media(&mut snapshot);
    let inputs = [RebuiltV3FileInput {
        path: &path,
        bytes: MEDIA,
    }];
    let mut artifact = compile_rebuilt_v3_document_set_with_application(
        &snapshot,
        &application_media_for(&snapshot),
        &compiler(),
        &inputs,
    )
    .unwrap();
    let originals = BTreeMap::from([("Data OD".into(), options.clone())]);
    finalize_rebuilt_v7_document_set(&mut artifact, &snapshot, &compiler(), &originals, &inputs)
        .unwrap();
    assert_eq!(artifact.content.document.option_labels[0].text, "éQ");
    let content: serde_json::Value =
        serde_json::from_slice(&artifact.content.canonical_json).unwrap();
    assert_eq!(content["optionLabels"][0]["text"], "éQ");
    assert_eq!(snapshot.option_labels[0].text, "éQ  ");
    assert_eq!(
        crate::codecs::encode_option_labels(&snapshot.option_labels, Some(&options)).unwrap(),
        options
    );
}
