use super::{COMMANDS, dispatch};
use std::collections::BTreeSet;

#[test]
fn command_names_are_unique_and_present_in_help() {
    let mut names = BTreeSet::new();
    let help = include_str!("../help.txt");
    for (name, _) in COMMANDS {
        assert!(names.insert(name), "duplicate command {name}");
        assert!(
            help.lines()
                .any(|line| line.split_whitespace().next() == Some(name)),
            "command {name} is missing from help"
        );
    }
}

#[test]
fn unknown_command_does_not_consume_arguments() {
    let mut arguments = ["keep-me".to_string()].into_iter();
    assert!(dispatch("not-a-command", &mut arguments).is_none());
    assert_eq!(arguments.next().as_deref(), Some("keep-me"));
}
