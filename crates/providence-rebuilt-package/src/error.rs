use crate::limits::{MAX_ARCHIVE_ENTRIES, MAX_ENTRY_BYTES};

#[derive(Debug)]
pub enum RebuiltV3ArchiveError {
    DuplicatePath(String),
    MissingFile(String),
    UnexpectedFile(String),
    FileIntegrityMismatch(String),
    TooManyEntries(usize),
    EntryTooLarge { path: String, bytes: u64 },
    DuplicateArchiveEntry(String),
    MissingManifest,
    UnexpectedArchiveEntry(String),
    NondeterministicEntryOrder,
    NondeterministicEntryMetadata(String),
    InvalidJson { path: String, reason: String },
    NonCanonicalJson(String),
    InvalidManifest(String),
    ContentIdMismatch { expected: String, actual: String },
    PackageHashMismatch { expected: String, actual: String },
    InvalidDocument { path: String, reason: String },
    Zip(zip::result::ZipError),
    Io(std::io::Error),
}

impl std::fmt::Display for RebuiltV3ArchiveError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let message = match self {
            Self::DuplicatePath(path) => {
                format!("archive input path '{path}' is duplicated")
            }
            Self::MissingFile(path) => {
                format!("manifest file '{path}' has no archive input")
            }
            Self::UnexpectedFile(path) => {
                format!("archive input '{path}' is absent from the manifest")
            }
            Self::FileIntegrityMismatch(path) => format!(
                "archive input '{path}' does not match its manifest byte length and SHA-256"
            ),
            Self::TooManyEntries(entries) => format!(
                "Rebuilt archive has {entries} entries; the inspection limit is {MAX_ARCHIVE_ENTRIES}"
            ),
            Self::EntryTooLarge { path, bytes } => format!(
                "Rebuilt archive entry '{path}' declares {bytes} bytes; the inspection limit is {MAX_ENTRY_BYTES}"
            ),
            Self::DuplicateArchiveEntry(path) => {
                format!("Rebuilt archive entry '{path}' is duplicated")
            }
            Self::MissingManifest => "Rebuilt archive has no manifest.json".into(),
            Self::UnexpectedArchiveEntry(path) => {
                format!("Rebuilt archive entry '{path}' is absent from manifest.json")
            }
            Self::NondeterministicEntryOrder => {
                "Rebuilt archive entries are not lexically sorted".into()
            }
            Self::NondeterministicEntryMetadata(path) => format!(
                "Rebuilt archive entry '{path}' does not use the certified stored/default-time/0644 metadata"
            ),
            Self::InvalidJson { path, reason } => {
                format!("Rebuilt archive entry '{path}' is invalid JSON: {reason}")
            }
            Self::NonCanonicalJson(path) => {
                format!("Rebuilt archive entry '{path}' is not canonical JSON")
            }
            Self::InvalidManifest(reason) => {
                format!("Rebuilt manifest contract is invalid: {reason}")
            }
            Self::ContentIdMismatch { expected, actual } => {
                format!("Rebuilt content ID is {actual}, but manifest.json declares {expected}")
            }
            Self::PackageHashMismatch { expected, actual } => {
                format!("Rebuilt package hash is {actual}, but manifest.json declares {expected}")
            }
            Self::InvalidDocument { path, reason } => {
                format!("Rebuilt document '{path}' is invalid: {reason}")
            }
            Self::Zip(error) => return error.fmt(formatter),
            Self::Io(error) => return error.fmt(formatter),
        };
        formatter.write_str(&message)
    }
}

impl std::error::Error for RebuiltV3ArchiveError {}

impl From<zip::result::ZipError> for RebuiltV3ArchiveError {
    fn from(error: zip::result::ZipError) -> Self {
        Self::Zip(error)
    }
}

impl From<std::io::Error> for RebuiltV3ArchiveError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}
