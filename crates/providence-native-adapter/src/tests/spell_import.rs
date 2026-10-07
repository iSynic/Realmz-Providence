use super::*;

#[test]
fn standard_spell_import_resolves_stock_links_and_reopens_exact_sources() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let source_path = temporary.path().join("Data S");
    let mut source = vec![0u8; STANDARD_SPELL_BYTES + SCENARIO_SPELL_BYTES];
    source[0] = 255;
    fs::write(&source_path, &source).expect("write controlled Data S");
    let name_source_path = temporary.path().join("Custom Names");
    let name_source = write_standard_spell_names(&name_source_path);

    let mut snapshot = ProjectSnapshot::new_authored(StableId("standard-spell-import".into()));
    let mut monsters = decode_monster_set(&vec![0; MONSTER_RECORD_BYTES], "Data MD", 0);
    monsters.monsters[0].spells[0] = 1201;
    snapshot.monster_sets.push(monsters);
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot)
        .expect("create project store");
    let mut session = EditorSession::new(snapshot);
    import_standard_spells(&mut session, &store, &source_path, &name_source_path);

    assert_standard_spell_projections(&mut session);

    let (store, reopened) =
        ProjectStore::open_session(store.root()).expect("reopen standard spell project");
    assert_eq!(reopened.revision(), Revision(1));
    assert_eq!(
        reopened.snapshot().standard_spells.len(),
        STANDARD_SPELL_RECORDS
    );
    assert_eq!(
        reopened.snapshot().standard_spells[15].definition.name,
        "Flame Ward"
    );
    let data_source = reopened
        .snapshot()
        .classic_sources
        .iter()
        .find(|candidate| candidate.native_path == "Data S")
        .unwrap();
    let text_source = reopened
        .snapshot()
        .classic_sources
        .iter()
        .find(|candidate| candidate.native_path == "Custom Names")
        .unwrap();
    assert_eq!(store.read_blob(&data_source.blob).unwrap(), source);
    assert_eq!(store.read_blob(&text_source.blob).unwrap(), name_source);
}

#[test]
fn classic_spell_import_edit_compile_and_reopen_is_blob_backed_and_bounded() {
    let temporary = tempfile::tempdir().expect("temporary project");
    let source_path = temporary.path().join("Data Spell");
    let mut source = vec![0u8; SCENARIO_SPELL_BYTES + 3];
    source[28] = 7;
    source[29] = 255;
    source[SCENARIO_SPELL_BYTES..].copy_from_slice(&[0xde, 0xad, 0xbe]);
    fs::write(&source_path, &source).expect("write controlled Data Spell");
    let name_source_path = temporary.path().join("Data Spell.rsrc");
    write_scenario_spell_names(&name_source_path);

    let mut snapshot = ProjectSnapshot::new_authored(StableId("spell-import".into()));
    let mut monsters = decode_monster_set(&vec![0; MONSTER_RECORD_BYTES], "Data MD", 0);
    monsters.monsters[0].spells[0] = 5105;
    monsters.monsters[0].authored = true;
    snapshot.monster_sets.push(monsters);
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot)
        .expect("create project store");
    let mut session = EditorSession::new(snapshot);
    import_scenario_spells(&mut session, &store, &source_path, &name_source_path);

    let listed = dispatch_result(&mut session, "spell.list", json!({"offset": 4, "limit": 1}))
        .expect("list bounded spell rows");
    assert_eq!(listed["items"].as_array().unwrap().len(), 1);
    assert_eq!(listed["items"][0]["classicId"], 5105);
    assert_eq!(listed["total"], 105);
    assert!(listed.get("snapshot").is_none());

    let opened = dispatch_result(&mut session, "spell.open", json!({"recordIndex": 4}))
        .expect("open one spell");
    assert_eq!(opened["spell"]["definition"]["id"], "classic.spell.5105");
    assert_eq!(opened["spell"]["definition"]["name"], "Moon Gate");
    assert!(opened.get("snapshot").is_none());
    update_scenario_spell(&mut session, &store, &opened);

    let (store, reopened) = ProjectStore::open_session(store.root()).expect("reopen spell project");
    let mut reopened = reopened;
    assert_reopened_scenario_spells(&mut reopened, &store, &source);
    assert_scenario_spell_compilation(&reopened, &store, temporary.path(), &source);
}
use crate::classic_compilation::compile_project_classic_slice;
use crate::dispatch_result;
use crate::item_spell_compilation::compile_data_spell;
use crate::transport::serve_io;
use providence_core::codecs::MONSTER_RECORD_BYTES;
use providence_core::codecs::SCENARIO_SPELL_BYTES;
use providence_core::codecs::STANDARD_SPELL_BYTES;
use providence_core::codecs::STANDARD_SPELL_RECORDS;
use providence_core::codecs::decode_monster_set;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::references::ResolutionState;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;
use std::fs;

fn write_standard_spell_names(name_source_path: &std::path::Path) -> Vec<u8> {
    let mut name_entries = Vec::new();
    for class in 1..=4usize {
        for level_index in 0..7usize {
            let names = (0..15usize)
                .map(|slot| {
                    if (class, level_index, slot) == (1, 1, 0) {
                        "Flame Ward".to_string()
                    } else {
                        format!("Spell {class}-{}-{}", level_index + 1, slot + 1)
                    }
                })
                .collect::<Vec<_>>();
            let mut data = Vec::new();
            data.extend_from_slice(&(names.len() as u16).to_be_bytes());
            for name in names {
                data.push(name.len() as u8);
                data.extend_from_slice(name.as_bytes());
            }
            name_entries.push(providence_core::codecs::ResourceEntry {
                resource_type: *b"STR#",
                id: (class * 1000 + level_index) as i16,
                name: format!("Class {class} level {level_index}"),
                attributes: 32,
                data,
            });
        }
    }
    let name_source = providence_core::codecs::write_resource_fork(&name_entries)
        .expect("controlled standard spell-name resource fork");
    fs::write(name_source_path, &name_source).expect("write controlled standard names");
    name_source
}

fn import_standard_spells(
    session: &mut EditorSession,
    store: &ProjectStore,
    source_path: &std::path::Path,
    name_source_path: &std::path::Path,
) {
    let import = json!({
        "id": 1,
        "method": "spell-rules.import-standard",
        "params": {
            "expectedRevision": 0,
            "path": source_path,
            "textPath": name_source_path
        }
    });
    let mut output = Vec::new();
    serve_io(
        session,
        Some(store),
        Cursor::new(format!("{}\n", serde_json::to_string(&import).unwrap())),
        &mut output,
    )
    .expect("import standard spells through stored adapter");
    let response: Value = serde_json::from_slice(&output).expect("import response");
    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["count"], STANDARD_SPELL_RECORDS);
    assert_eq!(response["result"]["trailingBytes"], SCENARIO_SPELL_BYTES);
    assert!(
        response["result"]["referenceChanges"]
            .as_array()
            .unwrap()
            .len()
            <= 128
    );
    let uses = dispatch_result(
        session,
        "reference.used-by",
        json!({
            "targetKind": "spell", "targetId": "classic.spell.1201"
        }),
    )
    .expect("read caller resolution beyond the bounded import delta");
    assert!(
        uses["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|reference| reference["resolution"] == "resolved")
    );
    assert_eq!(
        session.snapshot().origin,
        providence_core::model::ProjectOrigin::Authored
    );
}

fn write_scenario_spell_names(name_source_path: &std::path::Path) {
    let mut name_entries = Vec::new();
    for level_index in 0..7usize {
        let names = (0..15usize)
            .map(|slot| {
                let record = level_index * 15 + slot;
                if record == 4 {
                    "Moon Gate".to_string()
                } else {
                    format!("Custom Spell {record}")
                }
            })
            .collect::<Vec<_>>();
        let mut data = Vec::new();
        data.extend_from_slice(&(names.len() as u16).to_be_bytes());
        for name in names {
            data.push(name.len() as u8);
            data.extend_from_slice(name.as_bytes());
        }
        name_entries.push(providence_core::codecs::ResourceEntry {
            resource_type: *b"STR#",
            id: 5000 + level_index as i16,
            name: format!("Custom level {level_index}"),
            attributes: 32,
            data,
        });
    }
    let name_source = providence_core::codecs::write_resource_fork(&name_entries)
        .expect("controlled spell-name resource fork");
    fs::write(name_source_path, &name_source).expect("write controlled spell names");
}

fn import_scenario_spells(
    session: &mut EditorSession,
    store: &ProjectStore,
    source_path: &std::path::Path,
    name_source_path: &std::path::Path,
) {
    let import = json!({
        "id": 1,
        "method": "project.import-classic-spells",
        "params": {
            "expectedRevision": 0,
            "path": source_path,
            "textPath": name_source_path
        }
    });
    let mut output = Vec::new();
    serve_io(
        session,
        Some(store),
        Cursor::new(format!("{}\n", serde_json::to_string(&import).unwrap())),
        &mut output,
    )
    .expect("import Data Spell through stored adapter");
    let response: Value = serde_json::from_slice(&output).expect("import response");
    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["count"], 105);
    assert_eq!(response["result"]["trailingBytes"], 3);
    assert!(
        response["result"]["referenceChanges"]
            .as_array()
            .expect("reference changes")
            .iter()
            .any(|reference| reference["field"] == "spells[0]"
                && reference["targetId"] == "classic.spell.5105"
                && reference["resolution"] == "resolved")
    );
    assert!(response["result"].get("snapshot").is_none());
}

fn assert_standard_spell_projections(session: &mut EditorSession) {
    let listed = dispatch_result(
        session,
        "spell.list-standard",
        json!({"offset": 15, "limit": 1}),
    )
    .unwrap();
    assert_eq!(listed["total"], STANDARD_SPELL_RECORDS);
    assert_eq!(listed["items"][0]["classicId"], 1201);
    assert_eq!(listed["items"][0]["name"], "Flame Ward");
    let opened =
        dispatch_result(session, "spell.open-standard", json!({"recordIndex": 15})).unwrap();
    assert_eq!(opened["spell"]["definition"]["id"], "classic.spell.1201");
    assert_eq!(opened["readOnly"], true);
    let rebuilt = dispatch_result(session, "project.inspect-rebuilt-spells", json!({}))
        .expect("combined standard-only Rebuilt catalog");
    assert_eq!(rebuilt.as_array().unwrap().len(), STANDARD_SPELL_RECORDS);
    assert_eq!(rebuilt[0]["rangeMin"], -1);
}

fn update_scenario_spell(session: &mut EditorSession, store: &ProjectStore, opened: &Value) {
    let mut definition = opened["spell"]["definition"].clone();
    definition["cost"] = json!(42);
    definition["name"] = json!("Moon Gate Revised");
    let update = json!({
        "id": 2,
        "method": "spell.update",
        "params": {"expectedRevision": 1, "recordIndex": 4, "definition": definition}
    });
    let mut output = Vec::new();
    serve_io(
        session,
        Some(store),
        Cursor::new(format!("{}\n", serde_json::to_string(&update).unwrap())),
        &mut output,
    )
    .expect("update Data Spell through stored adapter");
    let response: Value = serde_json::from_slice(&output).expect("update response");
    assert_eq!(response["ok"], true);
    assert_eq!(
        response["result"]["changedEntities"],
        json!(["classic.spell.5105"])
    );
    assert!(response["result"].get("snapshot").is_none());
}

fn assert_scenario_spell_compilation(
    reopened: &EditorSession,
    store: &ProjectStore,
    root: &std::path::Path,
    source: &[u8],
) {
    let direct = root.join("compiled-data-spell");
    let direct_names = root.join("compiled-data-spell.rsrc");
    compile_data_spell(
        reopened,
        Some(store),
        json!({"path": direct, "textPath": direct_names}),
    )
    .expect("compile direct Data Spell output");
    let compiled = fs::read(root.join("compiled-data-spell")).expect("read compiled Data Spell");
    assert_eq!(&compiled[..30], &source[..30]);
    assert_eq!(compiled[4 * 30 + 10], 42);
    assert_eq!(&compiled[SCENARIO_SPELL_BYTES..], &[0xde, 0xad, 0xbe]);
    let compiled_names =
        fs::read(root.join("compiled-data-spell.rsrc")).expect("read compiled Data Spell names");
    let level_names = providence_core::codecs::decode_string_list_resource(&compiled_names, 5000)
        .unwrap()
        .unwrap();
    assert_eq!(level_names[4], "Moon Gate Revised");

    let first = root.join("compiled-spell-first");
    let second = root.join("compiled-spell-second");
    let first_result = compile_project_classic_slice(reopened, store, json!({"directory": first}))
        .expect("compile spell manifest");
    let second_result =
        compile_project_classic_slice(reopened, store, json!({"directory": second}))
            .expect("repeat spell manifest");
    assert_eq!(
        first_result["manifestSha256"],
        second_result["manifestSha256"]
    );
    assert!(
        root.join("compiled-spell-first")
            .join("Data Spell.rsrc")
            .is_file()
    );
}

fn assert_reopened_scenario_spells(
    reopened: &mut EditorSession,
    store: &ProjectStore,
    source: &[u8],
) {
    assert_eq!(reopened.revision(), Revision(2));
    assert_eq!(reopened.snapshot().scenario_spells.len(), 105);
    assert_eq!(reopened.snapshot().scenario_spells[4].definition.cost, 42);
    assert_eq!(
        reopened.snapshot().scenario_spells[4].definition.name,
        "Moon Gate Revised"
    );
    assert!(reopened.snapshot().scenario_spells[4].name_authored);
    let spell_link = reopened
        .references()
        .into_iter()
        .find(|reference| {
            reference.source == StableId("monster:0:0".into()) && reference.field.0 == "spells[0]"
        })
        .expect("durable custom-spell reference");
    assert_eq!(spell_link.target_id, "classic.spell.5105");
    assert_eq!(spell_link.resolution, ResolutionState::Resolved);
    assert!(spell_link.stock_fallback.is_none());
    let rebuilt = dispatch_result(reopened, "project.inspect-rebuilt-custom-spells", json!({}))
        .expect("inspect Rebuilt spell projection");
    assert_eq!(rebuilt.as_array().expect("spell array").len(), 105);
    assert_eq!(rebuilt[4]["id"], "classic.spell.5105");
    assert_eq!(rebuilt[4]["name"], "Moon Gate Revised");
    assert_eq!(rebuilt[4]["cost"], 42);
    assert!(rebuilt[4].get("recordIndex").is_none());
    let source_record = reopened
        .snapshot()
        .classic_sources
        .iter()
        .find(|source| source.native_path == "Data Spell")
        .expect("Data Spell source record");
    assert_eq!(store.read_blob(&source_record.blob).unwrap(), source);
}
