use super::*;
use crate::{
    codecs::*,
    model::*,
    session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision},
};

fn fresh() -> ProjectSnapshot {
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "spell-owned-edit".into(),
    )));
    let mut draft = session
        .allocate_scenario_spell(None, Some(0))
        .unwrap()
        .draft;
    draft.definition.name = "  Café Gate  ".into();
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyScenarioSpellDraft {
                draft: Box::new(draft),
            },
        })
        .unwrap();
    session.snapshot().clone()
}

fn manifest(snapshot: &ProjectSnapshot, original: Option<&[u8]>) -> NativeManifest {
    let mut manifest = NativeManifest::default();
    manifest.insert_generated(
        "Data Spell",
        NativeFileFamily::ScenarioSpellDefinitions,
        encode_scenario_spells(&snapshot.scenario_spells, None).unwrap(),
    );
    manifest.insert_generated(
        "Data Spell.rsrc",
        NativeFileFamily::ScenarioSpellNames,
        encode_scenario_spell_name_resources(&snapshot.scenario_spells, original).unwrap(),
    );
    manifest
}

#[test]
fn first_custom_spell_certifies_only_a_complete_generated_native_family() {
    let snapshot = fresh();
    let manifest = manifest(&snapshot, None);
    let mut baseline = BTreeMap::new();
    let mut transitions = Vec::new();
    allocate_binary(&snapshot, &manifest, &mut baseline, &mut transitions).unwrap();
    let edits = certify_names(&snapshot, &manifest, &mut baseline, &mut transitions).unwrap();
    assert_eq!(transitions.len(), 2);
    assert_eq!(edits[0].native_path, "Data Spell.rsrc");
    assert!(certify_classic_manifest_owned_edits(manifest, &baseline, None).is_ok());
    let mut short = snapshot.clone();
    short.scenario_spells.pop();
    assert!(
        allocate_binary(
            &short,
            &self::manifest(&snapshot, None),
            &mut BTreeMap::new(),
            &mut Vec::new()
        )
        .is_err()
    );
}

fn imported_names() -> (ProjectSnapshot, Vec<u8>) {
    let mut snapshot = fresh();
    let original = write_resource_fork(&[ResourceEntry {
        resource_type: *b"TEXT",
        id: 7,
        name: "Preserved".into(),
        attributes: 3,
        data: vec![1, 2, 3],
    }])
    .unwrap();
    let original =
        encode_scenario_spell_name_resources(&snapshot.scenario_spells, Some(&original)).unwrap();
    let blob = BlobId("sha256:spell-name-source".into());
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data Spell.rsrc".into(),
        blob: blob.clone(),
        byte_length: original.len() as u64,
    });
    hydrate_scenario_spell_names(&mut snapshot.scenario_spells, &original, blob).unwrap();
    snapshot.scenario_spells[0].definition.name = "Reviewed".into();
    snapshot.scenario_spells[0].name_authored = true;
    (snapshot, original)
}

#[test]
fn imported_name_edit_checks_source_identity_and_the_complete_preserved_container() {
    let (mut snapshot, original) = imported_names();
    let mut output = manifest(&snapshot, Some(&original));
    let baseline = BTreeMap::from([("Data Spell.rsrc".into(), original)]);
    let edits = certify_names(&snapshot, &output, &mut baseline.clone(), &mut Vec::new()).unwrap();
    assert_eq!(edits[0].resource_keys, ["STR#:5000"]);
    let bytes = &output.get("Data Spell.rsrc").unwrap().bytes;
    let mut entries = parse_resource_entries(bytes).unwrap();
    entries
        .iter_mut()
        .find(|entry| entry.resource_type == *b"TEXT")
        .unwrap()
        .data[0] ^= 1;
    output.insert_generated(
        "Data Spell.rsrc",
        NativeFileFamily::ScenarioSpellNames,
        write_resource_fork(&entries).unwrap(),
    );
    assert!(certify_names(&snapshot, &output, &mut baseline.clone(), &mut Vec::new()).is_err());
    snapshot.scenario_spells[0].text_source_blob = Some(BlobId("wrong-source".into()));
    assert!(
        certify_names(
            &snapshot,
            &self::manifest(&snapshot, None),
            &mut baseline.clone(),
            &mut Vec::new()
        )
        .is_err()
    );
}
