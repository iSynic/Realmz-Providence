use super::*;

#[test]
fn relative_settings_do_not_create_local_project_metadata() {
    assert!(settings_directory(Path::new("relative-settings")).is_err());
}

#[cfg(unix)]
#[test]
fn private_socket_paths_are_short_unique_and_owned_for_the_host_lifetime() {
    use std::os::unix::fs::PermissionsExt;
    let first = create().unwrap();
    let second = create().unwrap();
    assert_ne!(first.endpoint.address, second.endpoint.address);
    assert!(first.endpoint.address.len() < 104);
    let path = PathBuf::from(&first.endpoint.address);
    let directory = path.parent().unwrap().to_owned();
    assert_eq!(
        fs::metadata(&directory).unwrap().permissions().mode() & 0o777,
        0o700
    );
    let listener = crate::listener::listen(&first.endpoint).unwrap();
    assert_eq!(
        fs::metadata(&path).unwrap().permissions().mode() & 0o777,
        0o600
    );
    drop(listener);
    drop(first);
    assert!(!directory.exists());
    assert!(crate::listener::listen(&second.endpoint).is_ok());
}
