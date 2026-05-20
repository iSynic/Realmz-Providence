use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum ProvidenceError {
    #[error("{path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("JSON error in {path}: {source}")]
    Json {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
    #[error("{0}")]
    Message(String),
}

pub type Result<T> = std::result::Result<T, ProvidenceError>;

impl ProvidenceError {
    pub fn message(message: impl Into<String>) -> Self {
        Self::Message(message.into())
    }
}

pub trait IoPath<T> {
    fn with_path(self, path: impl Into<PathBuf>) -> Result<T>;
}

impl<T> IoPath<T> for std::io::Result<T> {
    fn with_path(self, path: impl Into<PathBuf>) -> Result<T> {
        let path = path.into();
        self.map_err(|source| ProvidenceError::Io { path, source })
    }
}

pub trait JsonPath<T> {
    fn with_json_path(self, path: impl Into<PathBuf>) -> Result<T>;
}

impl<T> JsonPath<T> for serde_json::Result<T> {
    fn with_json_path(self, path: impl Into<PathBuf>) -> Result<T> {
        let path = path.into();
        self.map_err(|source| ProvidenceError::Json { path, source })
    }
}

impl serde::Serialize for ProvidenceError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
