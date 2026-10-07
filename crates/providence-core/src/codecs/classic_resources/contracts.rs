use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResourceEntry {
    pub resource_type: [u8; 4],
    pub id: i16,
    pub name: String,
    pub attributes: u8,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct ResourceIdentity {
    pub resource_type: [u8; 4],
    pub id: i16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceEntryEvidence {
    pub name: String,
    pub attributes: u8,
    pub byte_length: usize,
    /// Payload offset within the resource fork, not an enclosing AppleDouble file.
    pub fork_offset: usize,
    pub sha256: String,
    pub preview: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceEntryVersion {
    pub occurrences: usize,
    pub names: Vec<String>,
    pub attributes: Vec<u8>,
    pub payload_byte_lengths: Vec<usize>,
    pub payload_sha256: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceEntryChange {
    pub resource_type: String,
    pub resource_id: i16,
    pub before: ResourceEntryVersion,
    pub after: ResourceEntryVersion,
    pub declared_owned: bool,
    pub ambiguous_owned_identity: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceForkDiffReport {
    pub exact_container_bytes: bool,
    pub before_entries: usize,
    pub after_entries: usize,
    pub changed_resources: Vec<ResourceEntryChange>,
    pub changed_resource_count: usize,
    pub declared_owned_change_count: usize,
    pub unexpected_change_count: usize,
    pub ambiguous_owned_change_count: usize,
    pub within_declared_ownership: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResourceForkError {
    Malformed,
    MissingContainerResourceFork,
    DuplicateResource { resource_type: [u8; 4], id: i16 },
    TooManyTypes,
    TooManyResources([u8; 4]),
    TypeOrReferenceListTooLarge,
    DataOffsetTooLarge,
    ResourceNameTooLong,
    UnencodableResourceName,
}

impl std::fmt::Display for ResourceForkError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Malformed => write!(formatter, "malformed Classic resource fork"),
            Self::MissingContainerResourceFork => {
                write!(
                    formatter,
                    "AppleSingle/AppleDouble container has no resource fork"
                )
            }
            Self::DuplicateResource { resource_type, id } => write!(
                formatter,
                "duplicate {} resource {id}",
                String::from_utf8_lossy(resource_type)
            ),
            Self::TooManyTypes => write!(formatter, "resource fork has too many resource types"),
            Self::TooManyResources(resource_type) => write!(
                formatter,
                "resource fork has too many {} resources",
                String::from_utf8_lossy(resource_type)
            ),
            Self::TypeOrReferenceListTooLarge => {
                write!(
                    formatter,
                    "resource fork type/reference list exceeds 16-bit offsets"
                )
            }
            Self::DataOffsetTooLarge => {
                write!(
                    formatter,
                    "resource fork data offset exceeds 24-bit offsets"
                )
            }
            Self::ResourceNameTooLong => {
                write!(
                    formatter,
                    "resource name exceeds the Classic 255-byte limit"
                )
            }
            Self::UnencodableResourceName => {
                write!(formatter, "resource name contains text outside MacRoman")
            }
        }
    }
}

impl std::error::Error for ResourceForkError {}
