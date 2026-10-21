//! A destination appearing after compilation must never be replaced, even empty.
#![deny(unsafe_code)]

use std::{io, path::Path};
#[cfg(windows)]
#[allow(unsafe_code)]
mod windows;
#[cfg(windows)]
use windows::rename_exclusive;

pub fn publish_directory_noclobber(staging: &Path, destination: &Path) -> io::Result<()> {
    let metadata = std::fs::symlink_metadata(staging)?;
    if !metadata.file_type().is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Publication requires an owned staging directory.",
        ));
    }
    rename_exclusive(staging, destination)
}

/// Move a regular artifact without replacing an existing destination or copying volumes.
pub fn move_file_noclobber(source: &Path, destination: &Path) -> io::Result<()> {
    if !std::fs::symlink_metadata(source)?.file_type().is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Artifact move requires a regular file.",
        ));
    }
    rename_exclusive(source, destination)
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn rename_exclusive(staging: &Path, destination: &Path) -> io::Result<()> {
    rustix::fs::renameat_with(
        rustix::fs::CWD,
        staging,
        rustix::fs::CWD,
        destination,
        rustix::fs::RenameFlags::NOREPLACE,
    )
    .map_err(Into::into)
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
fn rename_exclusive(_staging: &Path, _destination: &Path) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "Exclusive directory publication is unavailable on this platform.",
    ))
}

#[cfg(test)]
mod tests {
    use super::publish_directory_noclobber as publish;
    use super::*;
    use std::{
        fs,
        sync::{Arc, Barrier},
    };

    fn candidate(root: &Path, name: &str) -> std::path::PathBuf {
        let path = root.join(name);
        fs::create_dir(&path).unwrap();
        fs::write(path.join("Scenario"), name).unwrap();
        path
    }

    #[test]
    fn file_moves_never_replace_files_or_empty_directories() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("source");
        let destination = root.path().join("destination");
        fs::write(&source, b"source").unwrap();
        fs::create_dir(&destination).unwrap();
        assert!(move_file_noclobber(&source, &destination).is_err());
        fs::remove_dir(&destination).unwrap();
        fs::write(&destination, b"original").unwrap();
        assert!(move_file_noclobber(&source, &destination).is_err());
        assert_eq!(fs::read(&destination).unwrap(), b"original");
        fs::remove_file(&destination).unwrap();
        move_file_noclobber(&source, &destination).unwrap();
        assert!(!source.exists());
        assert_eq!(fs::read(destination).unwrap(), b"source");
    }

    #[test]
    fn destination_appearing_at_the_commit_boundary_keeps_both_trees_intact() {
        let root = tempfile::tempdir().unwrap();
        let staging = candidate(root.path(), "prepared");
        let destination = root.path().join("output");
        fs::create_dir(&destination).unwrap();
        assert!(publish(&staging, &destination).is_err());
        assert!(fs::read_dir(&destination).unwrap().next().is_none());
        assert_eq!(fs::read(staging.join("Scenario")).unwrap(), b"prepared");
        fs::write(destination.join("Scenario"), b"original").unwrap();
        assert!(publish(&staging, &destination).is_err());
        assert_eq!(fs::read(destination.join("Scenario")).unwrap(), b"original");
        assert_eq!(fs::read(staging.join("Scenario")).unwrap(), b"prepared");
    }

    #[test]
    fn racing_publishers_have_one_complete_winner_and_one_retained_candidate() {
        let root = tempfile::tempdir().unwrap();
        let first = candidate(root.path(), "first");
        let second = candidate(root.path(), "second");
        let destination = root.path().join("output");
        let barrier = Arc::new(Barrier::new(2));
        let workers: Vec<_> = [first.clone(), second.clone()]
            .into_iter()
            .map(|path| {
                let barrier = barrier.clone();
                let destination = destination.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    publish(&path, &destination)
                })
            })
            .collect();
        let results: Vec<_> = workers
            .into_iter()
            .map(|worker| worker.join().unwrap())
            .collect();
        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        let (winner, loser) = if results[0].is_ok() {
            (&first, &second)
        } else {
            (&second, &first)
        };
        assert!(!winner.exists() && loser.is_dir());
        assert_eq!(
            fs::read(destination.join("Scenario")).unwrap(),
            winner.file_name().unwrap().to_str().unwrap().as_bytes()
        );
        assert_eq!(
            fs::read(loser.join("Scenario")).unwrap(),
            loser.file_name().unwrap().to_str().unwrap().as_bytes()
        );
    }

    #[test]
    fn non_directory_source_cannot_replace_an_existing_file() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("source");
        let destination = root.path().join("destination");
        fs::write(&source, b"candidate").unwrap();
        fs::write(&destination, b"original").unwrap();
        assert_eq!(
            publish(&source, &destination).unwrap_err().kind(),
            io::ErrorKind::InvalidInput
        );
        assert_eq!(fs::read(destination).unwrap(), b"original");
    }
}
