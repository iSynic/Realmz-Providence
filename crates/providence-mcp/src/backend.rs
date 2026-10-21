use providence_session_client::{Request, Response, read_frame, write_frame};
use serde_json::Value;
use std::{
    io::BufReader,
    path::{Path, PathBuf},
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
};

pub struct Backend {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
    next: u64,
}
impl Backend {
    pub fn open(adapter: &Path, project: &Path, options: &[String]) -> Result<Self, String> {
        let mut command = Command::new(adapter);
        command
            .arg("serve-shared-project")
            .arg(project)
            .args(options)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn().map_err(|e| e.to_string())?;
        let input = child.stdin.take().ok_or("adapter stdin is unavailable")?;
        let output = BufReader::new(child.stdout.take().ok_or("adapter stdout is unavailable")?);
        Ok(Self {
            child,
            input,
            output,
            next: 1,
        })
    }
    pub fn call(&mut self, method: &str, params: Value) -> Result<Response, String> {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(12);
        loop {
            let response = self.call_once(method, params.clone())?;
            // This is an exact preflight retry before any receipt or write. A
            // revision conflict or uncertain outcome is never refreshed/retried.
            if !response
                .error
                .as_deref()
                .is_some_and(|e| e.starts_with("native-sync-required:"))
                || std::time::Instant::now() >= deadline
            {
                return Ok(response);
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
    }
    fn call_once(&mut self, method: &str, params: Value) -> Result<Response, String> {
        let id = self.next;
        self.next += 1;
        write_frame(
            &mut self.input,
            &Request {
                id,
                method: method.into(),
                params,
            },
        )
        .map_err(|e| e.to_string())?;
        let line = read_frame(&mut self.output)
            .map_err(|e| e.to_string())?
            .ok_or("adapter disconnected; reopen and reconcile before retrying")?;
        let response: Response = serde_json::from_str(&line).map_err(|e| e.to_string())?;
        if response.id != id {
            return Err("adapter response identity mismatch".into());
        }
        Ok(response)
    }
}
impl Drop for Backend {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

pub fn contained(root: &Path, path: &str, new: bool) -> Result<PathBuf, String> {
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let candidate = root.join(path);
    let resolved = if new && !candidate.exists() {
        let parent = candidate
            .parent()
            .ok_or("project parent is required")?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        parent.join(candidate.file_name().ok_or("project name is required")?)
    } else {
        candidate.canonicalize().map_err(|e| e.to_string())?
    };
    // A single-project grant includes the project itself. Creation and export
    // still require a child destination so they cannot replace a granted root.
    if (new && resolved == root) || !resolved.starts_with(&root) {
        return Err("path is outside the configured project root".into());
    }
    Ok(resolved)
}

#[cfg(test)]
mod tests;
