use super::item_fixtures::competing_forks;
use super::*;

#[test]
fn competing_forks_recover_unchanged_text_and_keep_authored_conflicts() {
    let (mut snapshot, files, corrected_blob) = competing_forks();
    let assessment = assess(&snapshot, &files).unwrap();
    assert!(
        assessment
            .entries
            .iter()
            .any(|entry| entry.key == "item:0:name" && entry.conflict)
    );
    assert!(
        assessment
            .entries
            .iter()
            .any(|entry| entry.key == "item:1:name" && !entry.conflict)
    );
    let mut command = RepairCommand {
        expected_source_identity: assessment.source_identity,
        expected_previous_version: 0,
        changes: assessment
            .entries
            .into_iter()
            .filter(|entry| !entry.conflict)
            .collect(),
    };
    let stale = command.clone();
    apply(&mut snapshot, command.clone()).unwrap();
    assert_eq!(
        snapshot.scenario_item_rules[0].definition.name,
        "Author's edit"
    );
    assert_eq!(
        snapshot.scenario_item_rules[1].definition.name,
        "Scenario one"
    );
    assert_eq!(
        snapshot.scenario_item_rules[1].text_source_blob,
        Some(corrected_blob)
    );
    assert!(apply(&mut snapshot, stale).is_err());
    command.expected_previous_version = 1;
    assert!(apply(&mut snapshot, command).is_err());
}

#[test]
fn reviewed_text_replacement_requires_its_conflicting_source_binding() {
    let (mut snapshot, files, corrected_blob) = competing_forks();
    snapshot.scenario_item_rules[0].text_source_blob = None;
    let assessment = assess(&snapshot, &files).unwrap();
    let unchanged = snapshot.clone();
    assert_eq!(
        assessment
            .clone()
            .reviewed_command(&["item:0:name".into()])
            .unwrap_err(),
        "Recovering this text also requires reviewing its item text source."
    );
    let safe = assessment.clone().reviewed_command(&[]).unwrap();
    assert!(
        !safe
            .changes
            .iter()
            .any(|entry| entry.entity.0 == "classic.item.0")
    );
    let mut preserved = snapshot.clone();
    apply(&mut preserved, safe).unwrap();
    assert_eq!(
        preserved.scenario_item_rules[0].definition.name,
        "Author's edit"
    );
    assert_eq!(preserved.scenario_item_rules[0].text_source_blob, None);
    let command = assessment
        .reviewed_command(&["item:0:name".into(), "item:0:source".into()])
        .unwrap();
    apply(&mut snapshot, command).unwrap();
    assert_eq!(
        snapshot.scenario_item_rules[0].definition.name,
        "Scenario zero"
    );
    assert_eq!(
        snapshot.scenario_item_rules[0].text_source_blob,
        Some(corrected_blob)
    );
    assert_eq!(
        unchanged.scenario_item_rules[0].definition.name,
        "Author's edit"
    );
}

#[test]
fn unknown_and_duplicate_conflict_keys_cannot_change_the_review() {
    let (snapshot, files, _) = competing_forks();
    let assessment = assess(&snapshot, &files).unwrap();
    let original = assessment.clone();
    for keys in [
        vec!["item:99:name".into()],
        vec!["item:0:name".into(), "item:0:name".into()],
    ] {
        assert_eq!(
            assessment.clone().reviewed_command(&keys).unwrap_err(),
            "Repair contains an unknown or duplicate conflict selection."
        );
    }
    assert_eq!(assessment, original);
    let expected = assessment
        .entries
        .iter()
        .filter(|entry| !entry.conflict)
        .cloned()
        .collect::<Vec<_>>();
    assert_eq!(assessment.reviewed_command(&[]).unwrap().changes, expected);
}
