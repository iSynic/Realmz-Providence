use std::{collections::BTreeMap, path::PathBuf};

pub(super) struct BuildOptions {
    pub source_root: PathBuf,
    pub catalog_root: PathBuf,
    pub package_path: PathBuf,
    pub lock_path: PathBuf,
    pub fixture_root: Option<PathBuf>,
    pub commit: String,
    pub fixture_commit: String,
}

impl BuildOptions {
    pub(super) fn parse(args: &[String]) -> Result<Self, String> {
        let options = parse_options(args)?;
        let source_root = required_path(&options, "--source")?;
        let catalog_root = required_path(&options, "--catalog")?;
        let package_path = required_path(&options, "--package")?;
        let lock_path = required_path(&options, "--lock")?;
        let fixture_root = options.get("--fixtures").map(PathBuf::from);
        let commit = providence_core::build_identity::asserted_compiler_identity(
            options.get("--commit").map(String::as_str),
            "0.1.0",
        )?
        .commit;
        let fixture_commit = options
            .get("--fixtures-commit")
            .cloned()
            .unwrap_or_else(|| commit.clone());
        Ok(Self {
            source_root,
            catalog_root,
            package_path,
            lock_path,
            fixture_root,
            commit,
            fixture_commit,
        })
    }
}

fn parse_options(args: &[String]) -> Result<BTreeMap<String, String>, String> {
    if !args.len().is_multiple_of(2) {
        return Err(usage());
    }
    let mut options = BTreeMap::new();
    for pair in args.as_chunks::<2>().0 {
        if !pair[0].starts_with("--") || options.insert(pair[0].clone(), pair[1].clone()).is_some()
        {
            return Err(usage());
        }
    }
    Ok(options)
}

fn required_path(options: &BTreeMap<String, String>, name: &str) -> Result<PathBuf, String> {
    options.get(name).map(PathBuf::from).ok_or_else(usage)
}

pub(crate) fn usage() -> String {
    "usage: providence-application-library build-identity | providence-application-library build --source DIR --catalog DIR --package FILE --lock FILE [--commit HASH] [--fixtures DIR] [--fixtures-commit HASH] | providence-application-library slim-scenarios --application-package FILE --application-media-catalog FILE --classic-application-data DIR --classic-scenarios-root DIR --input-dir DIR --output-dir DIR --lock FILE [--commit HASH] | providence-application-library migrate-synthetic-fixture --source FILE --migration FILE --output FILE --negative-output FILE --lock FILE [--commit HASH]".into()
}
