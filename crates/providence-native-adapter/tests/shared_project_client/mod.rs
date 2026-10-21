use providence_session_client::{Request, Response, read_frame, write_frame};
mod host;
pub use host::OwnedHost;
use serde_json::Value;
use std::{
    io::{BufRead, BufReader},
    path::Path,
    process::{Child, ChildStdin, Command, Stdio},
    sync::mpsc,
    time::Duration,
};

pub struct Proxy {
    child: Child,
    input: ChildStdin,
    output: mpsc::Receiver<Response>,
    next: u64,
    diagnostics: Option<mpsc::Receiver<String>>,
}
impl Proxy {
    pub fn open(path: &Path, native: bool) -> Self {
        Self::open_kind(path, if native { "native" } else { "mcp" })
    }
    pub fn open_kind(path: &Path, kind: &str) -> Self {
        Self::launch(path, kind, false, &[])
    }
    pub fn traced_native(path: &Path) -> Self {
        Self::launch(path, "native", true, &[])
    }
    pub fn with_options(path: &Path, options: &[String]) -> Self {
        Self::launch(path, "native", false, options)
    }
    pub fn native_control(path: &Path, binding: &Value) -> Self {
        Self::launch(
            path,
            "native-control",
            false,
            &[
                "--native-parent-id".into(),
                binding["clientId"].to_string(),
                "--native-control-token".into(),
                binding["token"].as_str().unwrap().into(),
            ],
        )
    }
    fn launch(path: &Path, kind: &str, trace: bool, options: &[String]) -> Self {
        let mut command = Command::new(env!("CARGO_BIN_EXE_providence-native-adapter"));
        command
            .arg(match kind {
                "native" => "serve-native-project",
                "observer" => "serve-observer-project",
                "native-control" => "serve-native-control-project",
                _ => "serve-shared-project",
            })
            .arg(path);
        if kind == "native" {
            command.args(["--native-client-id", "test-window"]);
        }
        command.args(options);
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(if trace {
                Stdio::piped()
            } else {
                Stdio::inherit()
            });
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn().unwrap();
        let input = child.stdin.take().unwrap();
        let diagnostics = read_diagnostics(&mut child);
        let output = read_responses(&mut child);
        Self {
            child,
            input,
            output,
            next: 1,
            diagnostics,
        }
    }
    pub fn wait_diagnostic(&self, expected: &str) {
        let diagnostics = self.diagnostics.as_ref().expect("traced proxy");
        loop {
            let line = diagnostics
                .recv_timeout(Duration::from_secs(15))
                .expect("bounded proxy diagnostic");
            if line.contains(expected) {
                return;
            }
        }
    }
    pub fn call(&mut self, method: &str, params: Value) -> Response {
        let id = self.begin_call(method, params);
        self.finish_call(id)
    }
    pub fn begin_call(&mut self, method: &str, params: Value) -> u64 {
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
        .unwrap();
        id
    }
    pub fn finish_call(&mut self, id: u64) -> Response {
        let response = self
            .output
            .recv_timeout(Duration::from_secs(15))
            .expect("bounded proxy response");
        assert_eq!(response.id, id);
        response
    }
    pub fn ok(&mut self, method: &str, params: Value) -> Value {
        let response = self.call(method, params);
        assert!(response.ok, "{}: {:?}", method, response.error);
        response.result.unwrap()
    }
}

fn read_diagnostics(child: &mut Child) -> Option<mpsc::Receiver<String>> {
    child.stderr.take().map(|stderr| {
        let (sender, receiver) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if sender.send(line).is_err() {
                    break;
                }
            }
        });
        receiver
    })
}

fn read_responses(child: &mut Child) -> mpsc::Receiver<Response> {
    let mut reader = BufReader::new(child.stdout.take().unwrap());
    let (sender, output) = mpsc::channel();
    std::thread::spawn(move || {
        while let Ok(Some(line)) = read_frame(&mut reader) {
            let Ok(response) = serde_json::from_str(&line) else {
                break;
            };
            if sender.send(response).is_err() {
                break;
            }
        }
    });
    output
}
impl Drop for Proxy {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
