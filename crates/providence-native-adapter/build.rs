use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Command,
};

fn main() {
    println!("cargo:rerun-if-env-changed=PROVIDENCE_BUILD_COMMIT");
    let manifest_directory = env::var("CARGO_MANIFEST_DIR").expect("Cargo sets CARGO_MANIFEST_DIR");
    let repository_root = Path::new(&manifest_directory).join("../..");
    if let Some(git_directory) = git_directory(&repository_root) {
        let git_head = git_directory.join("HEAD");
        println!("cargo:rerun-if-changed={}", git_head.display());
        if let Ok(head) = fs::read_to_string(&git_head)
            && let Some(reference) = head.trim().strip_prefix("ref: ")
        {
            println!(
                "cargo:rerun-if-changed={}",
                git_directory.join(reference).display()
            );
        }
    }

    let commit = env::var("PROVIDENCE_BUILD_COMMIT")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            let output = Command::new("git")
                .args(["rev-parse", "HEAD"])
                .current_dir(&repository_root)
                .output()
                .ok()?;
            output
                .status
                .success()
                .then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
        })
        .unwrap_or_else(|| "unavailable".into());
    println!("cargo:rustc-env=PROVIDENCE_BUILD_COMMIT={commit}");
}

fn git_directory(repository_root: &Path) -> Option<PathBuf> {
    let marker = repository_root.join(".git");
    if marker.is_dir() {
        return Some(marker);
    }
    let contents = fs::read_to_string(marker).ok()?;
    let path = contents.trim().strip_prefix("gitdir: ")?;
    let path = PathBuf::from(path);
    Some(if path.is_absolute() {
        path
    } else {
        repository_root.join(path)
    })
}
