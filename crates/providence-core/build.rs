use sha2::{Digest, Sha256};
use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Command,
};

fn main() {
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest directory"));
    let root = manifest.join("../..");
    watch_git_head(&root);
    println!(
        "cargo:rerun-if-changed={}",
        root.join("Cargo.lock").display()
    );
    println!("cargo:rerun-if-env-changed=PROVIDENCE_BUILD_COMMIT");
    println!("cargo:rerun-if-env-changed=PROVIDENCE_SOURCE_TREE");

    let commit = configured_or_git("PROVIDENCE_BUILD_COMMIT", &root, &["rev-parse", "HEAD"]);
    let tree = configured_or_git(
        "PROVIDENCE_SOURCE_TREE",
        &root,
        &["rev-parse", "HEAD^{tree}"],
    );
    let dirty = command_text(
        &root,
        "git",
        &["status", "--porcelain", "--untracked-files=no"],
    )
    .is_some_and(|value| !value.trim().is_empty());
    let cargo_lock = fs::read(root.join("Cargo.lock")).unwrap_or_default();
    let rustc =
        command_text(&root, "rustc", &["--version"]).unwrap_or_else(|| "unavailable".into());
    let cargo =
        command_text(&root, "cargo", &["--version"]).unwrap_or_else(|| "unavailable".into());

    emit("PROVIDENCE_BUILD_COMMIT", &commit);
    emit("PROVIDENCE_SOURCE_TREE", &tree);
    emit(
        "PROVIDENCE_SOURCE_DIRTY",
        if dirty { "true" } else { "false" },
    );
    emit("PROVIDENCE_CARGO_LOCK_SHA256", &sha256(&cargo_lock));
    emit("PROVIDENCE_RUSTC_VERSION", &rustc);
    emit("PROVIDENCE_CARGO_VERSION", &cargo);
    emit(
        "PROVIDENCE_BUILD_TARGET",
        &env::var("TARGET").unwrap_or_else(|_| "unavailable".into()),
    );
    emit(
        "PROVIDENCE_BUILD_PROFILE",
        &env::var("PROFILE").unwrap_or_else(|_| "unavailable".into()),
    );
}

fn configured_or_git(name: &str, root: &Path, arguments: &[&str]) -> String {
    env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| command_text(root, "git", arguments))
        .unwrap_or_else(|| "unavailable".into())
}

fn command_text(root: &Path, program: &str, arguments: &[&str]) -> Option<String> {
    let output = Command::new(program)
        .args(arguments)
        .current_dir(root)
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn watch_git_head(root: &Path) {
    let marker = root.join(".git");
    let Some(git_directory) = git_directory(&marker) else {
        return;
    };
    let head = git_directory.join("HEAD");
    println!("cargo:rerun-if-changed={}", head.display());
    if let Ok(contents) = fs::read_to_string(&head)
        && let Some(reference) = contents.trim().strip_prefix("ref: ")
    {
        println!(
            "cargo:rerun-if-changed={}",
            git_directory.join(reference).display()
        );
    }
}

fn git_directory(marker: &Path) -> Option<PathBuf> {
    if marker.is_dir() {
        return Some(marker.to_path_buf());
    }
    let contents = fs::read_to_string(marker).ok()?;
    let path = PathBuf::from(contents.trim().strip_prefix("gitdir: ")?);
    Some(if path.is_absolute() {
        path
    } else {
        marker.parent()?.join(path)
    })
}

fn emit(name: &str, value: &str) {
    println!("cargo:rustc-env={name}={value}");
}

fn sha256(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}
