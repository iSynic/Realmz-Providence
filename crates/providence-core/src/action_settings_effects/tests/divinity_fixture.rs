use super::super::*;
use crate::codecs::{
    decode_extra_action_points, decode_land_action_points, decode_simple_encounters,
    encode_extra_codes,
};
use crate::model::StableId;
use crate::session::{EditorCommand, EditorSession, ExpectedRevisionCommand};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Record {
    file: String,
    index: usize,
    record_bytes: usize,
    slot: u8,
    opcode: i16,
    target: i16,
    hex: String,
}

#[derive(Deserialize)]
struct Settings {
    id: u32,
    before: [i16; 5],
    after: [i16; 5],
}

#[derive(Deserialize)]
struct Fixture {
    records: Vec<Record>,
    settings: Settings,
}

fn fixture() -> Fixture {
    serde_json::from_str(include_str!("../fixtures/bywater-row2.json")).unwrap()
}

fn record_file(record: &Record) -> Vec<u8> {
    let mut bytes = vec![0; record.index * record.record_bytes];
    let decoded = (0..record.hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&record.hex[i..i + 2], 16).unwrap())
        .collect::<Vec<_>>();
    assert_eq!(decoded.len(), record.record_bytes);
    bytes.extend(decoded);
    if record.file == "Data DD" {
        // The native importer accepts complete 100-record map blocks.
        bytes.resize((record.index / 100 + 1) * 4000, 0);
    }
    bytes
}

fn snapshot(fixture: &Fixture) -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("bywater-evidence".into()));
    for record in &fixture.records {
        let bytes = record_file(record);
        let actions = match record.file.as_str() {
            "Data DD" => {
                snapshot.world.action_points.push(
                    decode_land_action_points(&bytes)
                        .records
                        .remove(record.index),
                );
                &snapshot.world.action_points.last().unwrap().actions
            }
            "Data ED3" => {
                snapshot
                    .extra_action_points
                    .push(decode_extra_action_points(&bytes).records.pop().unwrap());
                &snapshot.extra_action_points.last().unwrap().actions
            }
            "Data ED" => {
                snapshot
                    .simple_encounters
                    .push(decode_simple_encounters(&bytes).records.pop().unwrap());
                assert!(snapshot.simple_encounters.last().unwrap().has_semantics());
                &snapshot.simple_encounters.last().unwrap().actions
            }
            file => panic!("unsupported fixture family {file}"),
        };
        let action = actions
            .iter()
            .find(|action| action.slot == record.slot)
            .unwrap();
        assert_eq!(
            (action.raw_opcode, action.target_native_id),
            (record.opcode, record.target)
        );
    }
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(fixture.settings.id),
        values: fixture.settings.before,
    });
    snapshot
}

#[test]
fn independent_native_records_import_the_observed_bywater_aliases_without_a_conflict() {
    let fixture = fixture();
    let snapshot = snapshot(&fixture);
    let usages = action_settings::usages(&snapshot);
    let row = usages.iter().find(|usage| usage.row_id == 2).unwrap();
    assert_eq!(row.status, action_settings::UsageStatus::Shared);
    assert_eq!(row.callers.len(), 3);
    assert!(
        action_settings::diagnostics(&snapshot)
            .iter()
            .all(|d| d.code != "action-settings.conflict")
    );
}

#[test]
fn observed_prompt_write_identifies_exactly_the_other_two_native_consumers() {
    let fixture = fixture();
    let snapshot = snapshot(&fixture);
    let writes = vec![ExtraCodeRow {
        native_id: NativeRecordId(fixture.settings.id),
        values: fixture.settings.after,
    }];
    let selected = BTreeSet::from([ActionSettingsCallerConfirmation {
        source: StableId("action-point:land:0:27".into()),
        slot: 1,
    }]);
    let actual = impacted_callers(&snapshot, &writes, &selected).unwrap();
    assert_eq!(
        actual,
        vec![
            ActionSettingsCallerConfirmation {
                source: StableId("extra-action-point:3".into()),
                slot: 4
            },
            ActionSettingsCallerConfirmation {
                source: StableId("simple-encounter:1".into()),
                slot: 1
            },
        ]
    );
    assert_eq!(
        merge_writes(&snapshot, std::slice::from_ref(&writes)).unwrap(),
        writes
    );
    assert!(
        merge_writes(&snapshot, std::slice::from_ref(&snapshot.extra_codes))
            .unwrap()
            .is_empty()
    );
}

#[test]
fn impact_descriptions_use_each_bywater_actions_own_meaning_and_location() {
    let fixture = fixture();
    let snapshot = snapshot(&fixture);
    let writes = vec![ExtraCodeRow {
        native_id: NativeRecordId(2),
        values: fixture.settings.after,
    }];
    let expectations = [
        (
            "action-point:land:0:27",
            1,
            "Player Option",
            "Action Point 27",
            "Left Option",
        ),
        (
            "extra-action-point:3",
            4,
            "Battle",
            "Extra Action Point 3",
            "String To Display Before Battle",
        ),
        (
            "simple-encounter:1",
            1,
            "Battle",
            "Simple Encounter 1",
            "String To Display Before Battle",
        ),
    ];
    for (source, slot, label, location, setting) in expectations {
        let action = describe_impact(
            &snapshot,
            &writes,
            &writes,
            &ActionSettingsCallerConfirmation {
                source: StableId(source.into()),
                slot,
            },
        )
        .unwrap();
        assert_eq!(action.label, label);
        assert!(action.location.contains(location));
        assert!(action.location.ends_with(&format!("Step {}", slot + 1)));
        assert_eq!(action.changes.len(), 1);
        assert!(
            action.changes[0].label.contains(setting),
            "{:?}",
            action.changes
        );
        assert_eq!(
            (action.changes[0].before, action.changes[0].after),
            (0, 240)
        );
    }
}

#[test]
fn confirmed_commands_match_divinity_edcd_bytes_for_ap_xap_and_encounter() {
    use crate::session::{ActionSettingsEdit, ActionSettingsWriteScope, Revision};
    let fixture = fixture();
    let original = snapshot(&fixture);
    let callers = [
        ActionSettingsCallerConfirmation {
            source: StableId("action-point:land:0:27".into()),
            slot: 1,
        },
        ActionSettingsCallerConfirmation {
            source: StableId("extra-action-point:3".into()),
            slot: 4,
        },
        ActionSettingsCallerConfirmation {
            source: StableId("simple-encounter:1".into()),
            slot: 1,
        },
    ];
    for selected in &callers {
        let mut session = EditorSession::new(original.clone());
        let edit = ActionSettingsEdit {
            source: selected.source.clone(),
            slot: selected.slot,
            target_native_id: 2,
            values: fixture.settings.after,
            secondary_values: None,
            allow_shared_updates: false,
            scope: ActionSettingsWriteScope::UpdateAffected {
                confirmed_callers: callers
                    .iter()
                    .filter(|caller| *caller != selected)
                    .cloned()
                    .collect(),
            },
            guard: None,
        };
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(0),
                command: EditorCommand::ApplyActionSettings { edit },
            })
            .unwrap();
        let after = session.snapshot().clone();
        assert_eq!(after.extra_codes.len(), original.extra_codes.len());
        assert_eq!(after.extra_codes[0].values, fixture.settings.after);
        assert_native_result_and_history(&mut session, &original, &after);
    }
}

#[test]
fn confirmed_bywater_edit_compiles_and_reimports_the_same_shared_references() {
    let fixture = fixture();
    let [data_dd, data_ed3, data_ed, data_edcd] = bywater_sources(&fixture);
    let original = compilable_bywater_snapshot(&fixture);
    let edited = apply_confirmed_bywater_edit(original, &fixture);
    let classification = crate::compatibility::classify_classic_slice(&edited);
    assert_eq!(
        classification.status,
        crate::compatibility::CompatibilityStatus::Ready,
        "{:#?}",
        classification.blockers
    );
    let sources = crate::compiler::ClassicCompatibilitySources {
        data_dd: Some(&data_dd),
        data_ed3: Some(&data_ed3),
        data_ed: Some(&data_ed),
        data_edcd: Some(&data_edcd),
        ..Default::default()
    };
    let manifest = crate::compiler::compile_classic_slice(&edited, sources)
        .expect("compile confirmed shared edit");
    assert_reimported_bywater(&manifest, &fixture);
}

fn bywater_sources(fixture: &Fixture) -> [Vec<u8>; 4] {
    let source = |file| {
        record_file(
            fixture
                .records
                .iter()
                .find(|record| record.file == file)
                .unwrap(),
        )
    };
    let data_edcd = encode_extra_codes(
        &[ExtraCodeRow {
            native_id: NativeRecordId(fixture.settings.id),
            values: fixture.settings.before,
        }],
        None,
    )
    .unwrap();
    [
        source("Data DD"),
        source("Data ED3"),
        source("Data ED"),
        data_edcd,
    ]
}

fn compilable_bywater_snapshot(fixture: &Fixture) -> ProjectSnapshot {
    use crate::model::{BattleRecord, CLASSIC_MAP_SIZE, LevelType, MapLevel, ScenarioMessage};
    let mut original = snapshot(fixture);
    original.world.action_points[0]
        .actions
        .retain(|action| action.slot == 1);
    original.extra_action_points[0]
        .actions
        .retain(|action| action.slot == 4);
    original.simple_encounters[0]
        .actions
        .retain(|action| action.slot == 1);
    original.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Bywater fixture".into(),
        tiles: vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: None,
    });
    for id in [0, 54, 240] {
        original.messages.push(ScenarioMessage {
            identity: StableId(format!("message:{id}")),
            native_id: NativeRecordId(id),
            text: format!("Message {id}"),
            authored: true,
        });
    }
    original.battles.push(BattleRecord {
        identity: StableId("battle:1".into()),
        native_id: NativeRecordId(1),
        grid: vec![0; crate::codecs::BATTLE_GRID_SLOTS],
        distance: 0,
        message_before: 0,
        message_after: 0,
        battle_macro: 0,
        authored: true,
    });
    original
}

fn apply_confirmed_bywater_edit(original: ProjectSnapshot, fixture: &Fixture) -> ProjectSnapshot {
    use crate::session::{ActionSettingsEdit, ActionSettingsWriteScope, Revision};
    let mut session = EditorSession::new(original);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ApplyActionSettings {
                edit: ActionSettingsEdit {
                    source: StableId("action-point:land:0:27".into()),
                    slot: 1,
                    target_native_id: 2,
                    values: fixture.settings.after,
                    secondary_values: None,
                    allow_shared_updates: false,
                    scope: ActionSettingsWriteScope::UpdateAffected {
                        confirmed_callers: vec![
                            ActionSettingsCallerConfirmation {
                                source: StableId("extra-action-point:3".into()),
                                slot: 4,
                            },
                            ActionSettingsCallerConfirmation {
                                source: StableId("simple-encounter:1".into()),
                                slot: 1,
                            },
                        ],
                    },
                    guard: None,
                },
            },
        })
        .unwrap();
    session.snapshot().clone()
}

fn assert_reimported_bywater(manifest: &crate::compiler::NativeManifest, fixture: &Fixture) {
    let reopened = crate::compiler::reimport_classic_slice(manifest);
    assert_eq!(
        reopened
            .extra_codes
            .iter()
            .find(|row| row.native_id.0 == 2)
            .unwrap()
            .values,
        fixture.settings.after
    );
    let action_point = reopened
        .action_points
        .iter()
        .find(|record| record.record_index == 27)
        .unwrap();
    let extra_action_point = reopened
        .extra_action_points
        .iter()
        .find(|record| record.native_id.0 == 3)
        .unwrap();
    let simple_encounter = reopened
        .simple_encounters
        .iter()
        .find(|record| record.native_id.0 == 1)
        .unwrap();
    for actions in [
        &action_point.actions,
        &extra_action_point.actions,
        &simple_encounter.actions,
    ] {
        assert!(actions.iter().any(|action| action.target_native_id == 2));
    }
}

fn assert_native_result_and_history(
    session: &mut EditorSession,
    original: &ProjectSnapshot,
    after: &ProjectSnapshot,
) {
    assert_eq!(
        after.world.action_points[0].actions,
        original.world.action_points[0].actions
    );
    assert_eq!(
        after.extra_action_points[0].actions,
        original.extra_action_points[0].actions
    );
    assert_eq!(
        after.simple_encounters[0].actions,
        original.simple_encounters[0].actions
    );
    let before_bytes = crate::codecs::encode_extra_codes(&original.extra_codes, None).unwrap();
    let after_bytes = crate::codecs::encode_extra_codes(&after.extra_codes, None).unwrap();
    let changes = before_bytes
        .iter()
        .zip(&after_bytes)
        .enumerate()
        .filter(|(_, (before, after))| before != after)
        .map(|(offset, _)| offset)
        .collect::<Vec<_>>();
    assert_eq!(changes, vec![27]);
    assert_eq!(after_bytes[27], 240);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), original);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Redo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), after);
}
