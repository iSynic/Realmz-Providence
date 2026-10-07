use super::*;
use crate::classic_compilation::compile_project_classic_slice;
use crate::dispatch_result_with_store;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::json;
use std::fs;

#[test]
fn scenario_sound_import_downmixes_compiles_and_reopens_playable_pcm() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let source = temporary.path().join("thornwatch-bell.wav");
    let wav = wav_pcm16_stereo(
        11_025,
        &[
            (i16::MIN, i16::MAX),
            (0, 0),
            (16_384, -16_384),
            (i16::MAX, i16::MAX),
        ],
    );
    fs::write(&source, &wav).expect("write controlled WAV source");
    let snapshot = ProjectSnapshot::new_authored(StableId("sounds".into()));
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot)
        .expect("create project store");
    let mut session = EditorSession::new(snapshot);
    let imported = dispatch_result_with_store(
        &mut session,
        Some(&store),
        "sound.import",
        json!({
            "expectedRevision": 0,
            "path": source,
            "label": "Thornwatch Portcullis and Western Bell",
            "resourceId": 200
        }),
    )
    .expect("import Scenario Sound");
    assert_eq!(imported["resourceType"], "snd ");
    assert_eq!(imported["sampleRate"], 11_025);
    assert_eq!(imported["channels"], 2);
    import_picture_beside_sound(&mut session, &store, temporary.path());
    store
        .checkpoint_session(&session, &json!({"method": "mixed-resource.import"}))
        .expect("checkpoint mixed resource import");

    let (_, reopened) = ProjectStore::open_session(store.root()).expect("reopen sound project");
    let sound = reopened
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.kind == "sound")
        .expect("reopened sound");
    assert_eq!(sound.identity.0, "sound:200");
    assert_eq!(sound.sample_rate, Some(11_025));
    assert_eq!(sound.channels, Some(2));
    assert_eq!(store.read_blob(&sound.blob).unwrap(), wav);
    assert_playable_sound_preview(&reopened, &store);
    assert_sound_resource_compile(
        &reopened,
        &store,
        temporary.path(),
        sound.classic_payload_byte_length.unwrap(),
    );
}

fn assert_sound_resource_compile(
    reopened: &EditorSession,
    store: &ProjectStore,
    root: &std::path::Path,
    expected_payload_bytes: u64,
) {
    let first = root.join("sound-compile-first");
    let second = root.join("sound-compile-second");
    let first_result = compile_project_classic_slice(reopened, store, json!({"directory": first}))
        .expect("compile first sound resource fork");
    let second_result =
        compile_project_classic_slice(reopened, store, json!({"directory": second}))
            .expect("compile second sound resource fork");
    assert_eq!(
        first_result["manifestSha256"],
        second_result["manifestSha256"]
    );
    let first_bytes = fs::read(first.join("Scenario.rsrc")).unwrap();
    let second_bytes = fs::read(second.join("Scenario.rsrc")).unwrap();
    assert_eq!(first_bytes, second_bytes);
    let entries = providence_core::codecs::parse_resource_entries(&first_bytes).unwrap();
    let snd = entries
        .iter()
        .find(|entry| entry.resource_type == *b"snd " && entry.id == 200)
        .expect("owned snd resource");
    assert!(
        entries
            .iter()
            .any(|entry| entry.resource_type == *b"PICT" && entry.id == 30_000),
        "picture and sound must share the deterministic Scenario.rsrc output"
    );
    assert_eq!(snd.name, "Thornwatch Portcullis and Western Bell");
    assert_eq!(&snd.data[..2], &[0, 1]);
    assert_eq!(snd.data.len() as u64, expected_payload_bytes);
}

fn import_picture_beside_sound(
    session: &mut EditorSession,
    store: &ProjectStore,
    root: &std::path::Path,
) {
    let picture_source = root.join("moon-gate.png");
    fs::write(&picture_source, b"controlled PNG source bytes")
        .expect("write controlled picture source");
    let rgba = [0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255];
    let picture = dispatch_result_with_store(
        session,
        Some(store),
        "picture.import",
        json!({
            "expectedRevision": 1,
            "path": picture_source,
            "label": "The Moon Gate",
            "resourceId": 30000,
            "width": 2,
            "height": 2,
            "rgbaBase64": BASE64.encode(rgba),
            "dither": true
        }),
    )
    .expect("import Scenario Picture beside sound");
    assert_eq!(picture["resourceType"], "PICT");
}

fn assert_playable_sound_preview(reopened: &EditorSession, store: &ProjectStore) {
    let preview = dispatch_result_with_store(
        &mut reopened.clone(),
        Some(store),
        "sound.preview",
        json!({"identity": "sound:200"}),
    )
    .expect("read playable sound preview");
    assert_eq!(preview["mimeType"], "audio/pcm-u8");
    assert_eq!(preview["channels"], 1);
    assert_eq!(
        BASE64
            .decode(preview["pcm8Base64"].as_str().unwrap())
            .unwrap()
            .len(),
        4
    );
}
