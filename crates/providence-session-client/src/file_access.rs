//! Local client grants are configuration, never portable project data or tool input.
mod directories;
mod finalization;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
#[cfg(test)]
mod tests;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FileAccess {
    #[serde(default)]
    pub input_roots: Vec<PathBuf>,
    #[serde(default)]
    pub output_root: Option<PathBuf>,
}

impl FileAccess {
    pub fn from_handshake(value: &Value) -> Result<Self, String> {
        let access: Self = if value.is_null() {
            Self::default()
        } else {
            serde_json::from_value(value.clone())
                .map_err(|error| format!("file-access: invalid grants: {error}"))?
        };
        access.normalized()
    }

    pub fn normalized(mut self) -> Result<Self, String> {
        if self.input_roots.len() > 8 {
            return Err("file-access: at most eight input roots are supported".into());
        }
        self.input_roots = self
            .input_roots
            .iter()
            .map(|path| root(path))
            .collect::<Result<_, _>>()?;
        self.input_roots.sort();
        self.input_roots.dedup();
        self.output_root = self.output_root.as_deref().map(root).transpose()?;
        Ok(self)
    }

    pub fn proxy_options(options: &[String], kind: &str) -> Result<(Self, Vec<String>), String> {
        if !options.len().is_multiple_of(2) {
            return Err("proxy options require values".into());
        }
        let mut access = Self::default();
        let mut support = Vec::new();
        for pair in options.chunks_exact(2) {
            match pair[0].as_str() {
                "--mcp-input-root" | "--mcp-output-root" if kind != "mcp" => {
                    return Err("file-access: MCP grants belong to MCP clients".into());
                }
                "--mcp-input-root" => access.input_roots.push(PathBuf::from(&pair[1])),
                "--mcp-output-root" => {
                    if access
                        .output_root
                        .replace(PathBuf::from(&pair[1]))
                        .is_some()
                    {
                        return Err("file-access: duplicate output root".into());
                    }
                }
                _ => support.extend_from_slice(pair),
            }
        }
        Ok((access.normalized()?, support))
    }

    pub fn authorize(&self, method: &str, params: &mut Value) -> Result<(), String> {
        match method {
            "special-land-solidity.preview" | "special-land-solidity.initialize" => {
                self.input(params, "path")
            }
            "project.inspect-classic-scenario-import" | "project.import-classic-scenario.begin" => {
                self.input_directory(params, "directory")?;
                self.input_directory(params, "applicationDataDirectory")
            }
            "project.compile-classic-slice" => self.output(params, "directory"),
            "export.inspect-artifact" => self.output(params, "path"),
            "project.compile-rebuilt-package" | "export.begin" => {
                self.finalization(params)?;
                self.output(params, "path")
            }
            "project.inspect-rebuilt-package" => self.finalization(params),
            "media.import.prepare" | "media.import.commit" => {
                self.input(params, "path")?;
                if params
                    .get("reversePath")
                    .is_some_and(|value| !value.is_null())
                {
                    self.input(params, "reversePath")?;
                }
                Ok(())
            }
            _ => Ok(()),
        }
    }

    fn input(&self, params: &mut Value, key: &str) -> Result<(), String> {
        let path = absolute(params, key)?
            .canonicalize()
            .map_err(|error| format!("file-access: input is unavailable: {error}"))?;
        if !path.is_file() || !self.input_roots.iter().any(|root| path.starts_with(root)) {
            return Err("file-access: input is outside the configured input roots".into());
        }
        params[key] = serde_json::json!(path);
        Ok(())
    }

    fn output(&self, params: &mut Value, key: &str) -> Result<(), String> {
        let root = self
            .output_root
            .as_ref()
            .ok_or("file-access: configure an output root before publication")?;
        let path = absolute(params, key)?;
        let resolved = if path.exists() {
            path.canonicalize()
        } else {
            path.parent()
                .ok_or("file-access: output parent is required")?
                .canonicalize()
                .map(|parent| parent.join(path.file_name().unwrap_or_default()))
        }
        .map_err(|error| format!("file-access: output is unavailable: {error}"))?;
        if resolved == *root || !resolved.starts_with(root) {
            return Err("file-access: output is outside the configured output root".into());
        }
        params[key] = serde_json::json!(resolved);
        Ok(())
    }
}

fn absolute(params: &Value, key: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(
        params[key]
            .as_str()
            .ok_or_else(|| format!("file-access: {key} is required"))?,
    );
    if !path.is_absolute() {
        return Err(format!("file-access: {key} must be an absolute path"));
    }
    Ok(path)
}

fn root(path: &Path) -> Result<PathBuf, String> {
    let path = path
        .canonicalize()
        .map_err(|error| format!("file-access: root is unavailable: {error}"))?;
    if !path.is_dir() {
        return Err("file-access: roots must be existing directories".into());
    }
    Ok(path)
}
