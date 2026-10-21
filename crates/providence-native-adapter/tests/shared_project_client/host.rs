use std::{
    path::Path,
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};

pub struct OwnedHost(Child);

impl OwnedHost {
    pub fn start(project: &Path) -> Self {
        let mut command = Command::new(env!("CARGO_BIN_EXE_providence-native-adapter"));
        command
            .arg("host-project")
            .arg(project)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::inherit());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut host = Self(command.spawn().unwrap());
        let descriptor = providence_session_client::endpoint::descriptor_path(project).unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while !descriptor.is_file() {
            assert!(
                host.0.try_wait().unwrap().is_none(),
                "owned host exited before publishing its endpoint"
            );
            assert!(
                Instant::now() < deadline,
                "owned host startup exceeded its deadline"
            );
            std::thread::sleep(Duration::from_millis(10));
        }
        host
    }

    pub fn crash(&mut self) {
        self.0.kill().unwrap();
        self.0.wait().unwrap();
    }
}

impl Drop for OwnedHost {
    fn drop(&mut self) {
        if self.0.try_wait().ok().flatten().is_none() {
            let _ = self.0.kill();
        }
        let _ = self.0.wait();
    }
}
