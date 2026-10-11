//! A full import reads shared containers once within a bounded, job-local scope.

use std::{
    cell::RefCell,
    collections::BTreeMap,
    fs, io,
    path::{Path, PathBuf},
    sync::Arc,
};

#[derive(Default)]
struct Cache {
    bytes: usize,
    files: BTreeMap<PathBuf, Vec<u8>>,
    forks: BTreeMap<PathBuf, Arc<Vec<providence_core::codecs::ResourceEntry>>>,
}

pub(crate) fn entries(
    path: &Path,
    bytes: &[u8],
) -> Result<
    Arc<Vec<providence_core::codecs::ResourceEntry>>,
    providence_core::codecs::ResourceForkError,
> {
    INPUTS.with(|inputs| {
        let mut inputs = inputs.borrow_mut();
        if let Some(entries) = inputs.as_ref().and_then(|cache| cache.forks.get(path)) {
            return Ok(entries.clone());
        }
        let entries =
            Arc::new(providence_core::codecs::parse_resource_entries_preserving_duplicates(bytes)?);
        let size = entries
            .iter()
            .map(|entry| entry.data.len() + entry.name.len() + 64)
            .sum::<usize>();
        if let Some(cache) = inputs.as_mut()
            && cache.bytes.saturating_add(size) <= 64 * 1024 * 1024
        {
            cache.bytes += size;
            cache.forks.insert(path.into(), entries.clone());
        }
        Ok(entries)
    })
}

thread_local! { static INPUTS: RefCell<Option<Cache>> = const { RefCell::new(None) }; }

pub(crate) struct Scope(Option<Cache>);

impl Scope {
    pub(crate) fn begin() -> Self {
        Self(INPUTS.with(|inputs| inputs.replace(Some(Cache::default()))))
    }
}

impl Drop for Scope {
    fn drop(&mut self) {
        INPUTS.with(|inputs| inputs.replace(self.0.take()));
    }
}

pub(crate) fn read(path: impl AsRef<Path>) -> io::Result<Vec<u8>> {
    let path = path.as_ref();
    INPUTS.with(|inputs| {
        let mut inputs = inputs.borrow_mut();
        let Some(cache) = inputs.as_mut() else {
            return fs::read(path);
        };
        if let Some(bytes) = cache.files.get(path) {
            return Ok(bytes.clone());
        }
        let bytes = fs::read(path)?;
        if cache.bytes.saturating_add(bytes.len()) <= 64 * 1024 * 1024 {
            cache.bytes += bytes.len();
            cache.files.insert(path.into(), bytes.clone());
        }
        Ok(bytes)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn container_reads_are_stable_during_import_and_do_not_leak_across_jobs() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("source");
        fs::write(&path, b"captured").unwrap();
        {
            let _scope = Scope::begin();
            assert_eq!(read(&path).unwrap(), b"captured");
            fs::write(&path, b"changed").unwrap();
            assert_eq!(read(&path).unwrap(), b"captured");
        }
        assert_eq!(read(&path).unwrap(), b"changed");
    }
}
