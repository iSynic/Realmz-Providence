use std::collections::BTreeMap;

#[derive(Debug, Default)]
pub(crate) struct NativeScenarioManifest {
    files: BTreeMap<String, Vec<u8>>,
    written_files: Vec<String>,
    pass_through_files: Vec<String>,
}

impl NativeScenarioManifest {
    pub(crate) fn insert_generated(&mut self, name: impl Into<String>, bytes: Vec<u8>) {
        let name = name.into();
        self.files.insert(name.clone(), bytes);
        if !self.written_files.contains(&name) {
            self.written_files.push(name.clone());
        }
        self.pass_through_files
            .retain(|candidate| candidate != &name);
    }

    pub(crate) fn insert_pass_through(&mut self, name: impl Into<String>, bytes: Vec<u8>) {
        let name = name.into();
        self.files.insert(name.clone(), bytes);
        if !self.pass_through_files.contains(&name) {
            self.pass_through_files.push(name);
        }
    }

    pub(crate) fn files(&self) -> &BTreeMap<String, Vec<u8>> {
        &self.files
    }

    pub(crate) fn written_files(&self) -> &[String] {
        &self.written_files
    }

    pub(crate) fn pass_through_files(&self) -> &[String] {
        &self.pass_through_files
    }
}

#[cfg(test)]
mod tests {
    use super::NativeScenarioManifest;

    #[test]
    fn generated_files_overlay_pass_through_bytes_in_sorted_manifest() {
        let mut manifest = NativeScenarioManifest::default();
        manifest.insert_pass_through("z-last", vec![9]);
        manifest.insert_pass_through("Data SD2", vec![1]);
        manifest.insert_generated("Data SD2", vec![2]);
        manifest.insert_generated("a-first", vec![3]);

        assert_eq!(
            manifest
                .files()
                .keys()
                .map(String::as_str)
                .collect::<Vec<_>>(),
            vec!["Data SD2", "a-first", "z-last"]
        );
        assert_eq!(manifest.files()["Data SD2"], vec![2]);
        assert_eq!(manifest.written_files(), ["Data SD2", "a-first"]);
        assert_eq!(manifest.pass_through_files(), ["z-last"]);
    }
}
