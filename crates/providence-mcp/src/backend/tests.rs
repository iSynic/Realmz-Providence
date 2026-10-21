use super::contained;

#[test]
fn opening_the_granted_project_accepts_absolute_and_relative_paths() {
    let root = tempfile::tempdir().unwrap();
    let expected = root.path().canonicalize().unwrap();
    for path in [".", root.path().to_str().unwrap()] {
        assert_eq!(contained(root.path(), path, false).unwrap(), expected);
    }
}

#[test]
fn creation_and_export_cannot_target_the_granted_root() {
    let root = tempfile::tempdir().unwrap();
    for path in [".", root.path().to_str().unwrap()] {
        assert!(contained(root.path(), path, true).is_err());
    }
    assert_eq!(
        contained(root.path(), "new-project", true).unwrap(),
        root.path().canonicalize().unwrap().join("new-project")
    );
}

#[test]
fn existing_children_are_allowed_but_parent_and_sibling_paths_are_rejected() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path().join("grant");
    let child = root.join("project");
    let sibling = directory.path().join("grant-other");
    std::fs::create_dir_all(&child).unwrap();
    std::fs::create_dir(&sibling).unwrap();
    for new in [false, true] {
        assert_eq!(
            contained(&root, "project", new).unwrap(),
            child.canonicalize().unwrap()
        );
        for path in ["..", "../grant-other", sibling.to_str().unwrap()] {
            assert!(contained(&root, path, new).is_err());
        }
    }
    assert!(contained(&root, "../new-project", true).is_err());
}
