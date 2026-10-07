use serde::{Deserialize, Serialize};

use crate::rebuilt::{REBUILT_V3_SCHEMA_SHA256, RebuiltV3CompilerIdentity};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvidenceBuildIdentity {
    pub kind: String,
    pub format_version: u8,
    pub tool: String,
    pub version: String,
    pub commit: String,
    pub source_tree: String,
    pub source_dirty: bool,
    pub schema_sha256: String,
    pub cargo_lock_sha256: String,
    pub rustc_version: String,
    pub cargo_version: String,
    pub target: String,
    pub profile: String,
}

pub fn current(tool: impl Into<String>) -> ProvidenceBuildIdentity {
    ProvidenceBuildIdentity {
        kind: "providence.tool-build-identity".into(),
        format_version: 1,
        tool: tool.into(),
        version: env!("CARGO_PKG_VERSION").into(),
        commit: env!("PROVIDENCE_BUILD_COMMIT").into(),
        source_tree: env!("PROVIDENCE_SOURCE_TREE").into(),
        source_dirty: env!("PROVIDENCE_SOURCE_DIRTY") == "true",
        schema_sha256: REBUILT_V3_SCHEMA_SHA256.into(),
        cargo_lock_sha256: env!("PROVIDENCE_CARGO_LOCK_SHA256").into(),
        rustc_version: env!("PROVIDENCE_RUSTC_VERSION").into(),
        cargo_version: env!("PROVIDENCE_CARGO_VERSION").into(),
        target: env!("PROVIDENCE_BUILD_TARGET").into(),
        profile: env!("PROVIDENCE_BUILD_PROFILE").into(),
    }
}

pub fn asserted_compiler_identity(
    asserted_commit: Option<&str>,
    minimum_engine_version: impl Into<String>,
) -> Result<RebuiltV3CompilerIdentity, String> {
    let build = current("providence-compiler");
    if let Some(asserted) = asserted_commit.filter(|value| !value.trim().is_empty())
        && asserted != build.commit
    {
        return Err(format!(
            "compiler commit assertion '{asserted}' does not match embedded build commit '{}'",
            build.commit
        ));
    }
    Ok(RebuiltV3CompilerIdentity {
        version: build.version,
        commit: build.commit,
        minimum_engine_version: minimum_engine_version.into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compiler_identity_uses_the_embedded_commit_and_rejects_a_false_label() {
        let build = current("test");
        let identity = asserted_compiler_identity(Some(&build.commit), "0.1.0").unwrap();
        assert_eq!(identity.commit, build.commit);
        assert!(asserted_compiler_identity(Some("not-the-build"), "0.1.0").is_err());
    }
}
