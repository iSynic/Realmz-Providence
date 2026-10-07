use std::collections::BTreeMap;

#[test]
fn every_editing_variant_has_one_domain_dispatch_arm() {
    let commands = include_str!("../commands.rs")
        .split_once("pub enum EditorCommand {")
        .expect("public command enum is present")
        .1;
    let variants = commands
        .lines()
        .take_while(|line| *line != "}")
        .filter_map(|line| line.strip_prefix("    "))
        .filter(|line| line.starts_with(char::is_uppercase))
        .map(identifier)
        .filter(|name| !matches!(*name, "Undo" | "Redo"));
    let mut handlers = BTreeMap::<&str, usize>::new();
    for source in [
        include_str!("story.rs"),
        include_str!("world.rs"),
        include_str!("resources.rs"),
        include_str!("combat.rs"),
    ] {
        for occurrence in source.split("EditorCommand::").skip(1) {
            *handlers.entry(identifier(occurrence)).or_default() += 1;
        }
    }
    for variant in variants {
        assert_eq!(
            handlers.remove(variant),
            Some(1),
            "{variant} must be dispatched exactly once"
        );
    }
    handlers.remove("Undo");
    handlers.remove("Redo");
    assert!(
        handlers.is_empty(),
        "unexpected domain command arms: {handlers:?}"
    );
}

fn identifier(source: &str) -> &str {
    let end = source
        .find(|character: char| !character.is_ascii_alphanumeric() && character != '_')
        .unwrap_or(source.len());
    &source[..end]
}
