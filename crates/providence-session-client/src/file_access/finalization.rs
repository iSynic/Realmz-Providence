use super::*;

impl FileAccess {
    pub(super) fn finalization(&self, params: &mut Value) -> Result<(), String> {
        let Some(options) = params.get_mut("packageFinalization") else {
            return Ok(());
        };
        self.input(options, "applicationPackage")?;
        if options.get("applicationMediaCatalogPath").is_some() {
            self.input(options, "applicationMediaCatalogPath")?;
        }
        // Only Data Caste is consumed; do not imply a grant for its parent.
        let directory = absolute(options, "classicApplicationDataDirectory")?
            .canonicalize()
            .map_err(|error| format!("file-access: {error}"))?;
        let mut file = serde_json::json!({"path":directory.join("Data Caste")});
        self.input(&mut file, "path")?;
        if Path::new(file["path"].as_str().unwrap()) != directory.join("Data Caste") {
            return Err("file-access: finalization Data Caste cannot be a linked file".into());
        }
        options["classicApplicationDataDirectory"] = serde_json::json!(directory);
        Ok(())
    }
}
