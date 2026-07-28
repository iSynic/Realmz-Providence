use crate::error::{IoPath, ProvidenceError, Result};
use crate::project::ProvidenceProject;
use crate::remake_exporter::export_remake_campaign;
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::io::ErrorKind;
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use tungstenite::{accept, Error as WebSocketError, Message, WebSocket};

const PREVIEW_PROTOCOL_VERSION: u32 = 1;
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_MESSAGE_BYTES: usize = 1024 * 1024;

#[derive(Default)]
pub struct PreviewManager {
    session: Mutex<Option<PreviewSession>>,
}

struct PreviewSession {
    command_sender: mpsc::Sender<Value>,
    child: Arc<Mutex<Child>>,
    temp_root: PathBuf,
    session_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewSettings {
    pub godot_executable: String,
    pub remake_path: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewEntry {
    pub kind: String,
    #[serde(default)]
    pub trigger_id: String,
    #[serde(default)]
    pub battle_id: i64,
    #[serde(default)]
    pub slot: i64,
    #[serde(default)]
    pub level_type: String,
    #[serde(default)]
    pub level_index: i64,
    #[serde(default)]
    pub x: i64,
    #[serde(default)]
    pub y: i64,
}

impl Default for PreviewEntry {
    fn default() -> Self {
        Self {
            kind: "start".to_string(),
            trigger_id: String::new(),
            battle_id: -1,
            slot: 0,
            level_type: "land".to_string(),
            level_index: 0,
            x: 0,
            y: 0,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchPreviewRequest {
    pub project_dir: String,
    pub project: ProvidenceProject,
    pub settings: PreviewSettings,
    #[serde(default)]
    pub entry: PreviewEntry,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchPreviewReport {
    pub session_id: String,
    pub package_path: String,
    pub package_hash: String,
    pub process_id: u32,
}

#[tauri::command]
pub fn launch_remake_preview(
    app: AppHandle,
    manager: State<'_, PreviewManager>,
    request: LaunchPreviewRequest,
) -> Result<LaunchPreviewReport> {
    stop_session(&manager)?;

    let session_id = random_hex(16);
    let nonce = random_hex(32);
    let temp_root = std::env::temp_dir().join(format!("realmz-providence-preview-{session_id}"));
    let building_path = temp_root.join("package.building");
    let package_path = temp_root.join("package");
    let profile_path = temp_root.join("profile");
    fs::create_dir_all(&temp_root).with_path(&temp_root)?;
    if let Err(error) = export_remake_campaign(
        &request.project,
        Path::new(&request.project_dir),
        &building_path,
    ) {
        let _ = fs::remove_dir_all(&temp_root);
        return Err(error);
    }
    fs::rename(&building_path, &package_path).with_path(&package_path)?;

    let manifest_path = package_path.join("campaign.json");
    let manifest: Value = serde_json::from_slice(
        &fs::read(&manifest_path).with_path(&manifest_path)?,
    )
    .map_err(|error| ProvidenceError::message(format!(
        "Could not read preview campaign manifest: {error}"
    )))?;
    let package_hash = manifest
        .pointer("/integrity/packageHash")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|error| ProvidenceError::message(format!(
            "Could not bind the Remake preview loopback socket: {error}"
        )))?;
    let port = listener
        .local_addr()
        .map_err(|error| ProvidenceError::message(format!(
            "Could not resolve the Remake preview loopback port: {error}"
        )))?
        .port();
    listener
        .set_nonblocking(true)
        .map_err(|error| ProvidenceError::message(format!(
            "Could not configure the Remake preview listener: {error}"
        )))?;

    let mut command = runtime_command(&request.settings)?;
    command.args([
        "--",
        "--preview-port",
        &port.to_string(),
        "--preview-nonce",
        &nonce,
        "--preview-package",
        &package_path.to_string_lossy(),
        "--preview-profile",
        &profile_path.to_string_lossy(),
    ]);
    let child = command.spawn().map_err(|error| ProvidenceError::message(format!(
        "Could not launch Realmz Remake preview: {error}"
    )))?;
    let process_id = child.id();
    let child = Arc::new(Mutex::new(child));

    let stream = match accept_preview_connection(&listener, &child) {
        Ok(stream) => stream,
        Err(error) => {
            if let Ok(mut process) = child.lock() {
                let _ = process.kill();
            }
            let _ = fs::remove_dir_all(&temp_root);
            return Err(error);
        }
    };
    let mut socket = accept(stream).map_err(|error| ProvidenceError::message(format!(
        "Realmz Remake did not complete the preview WebSocket handshake: {error}"
    )))?;
    socket.get_mut().set_read_timeout(Some(HANDSHAKE_TIMEOUT)).map_err(|error| {
        ProvidenceError::message(format!("Could not configure preview socket timeout: {error}"))
    })?;
    if let Err(error) = authenticate_handshake(&mut socket, &nonce)
        .and_then(|_| await_package_loaded(&mut socket))
    {
        terminate_child(&child);
        let _ = fs::remove_dir_all(&temp_root);
        return Err(error);
    }

    let launch_request = json!({
        "type": "launch-entry",
        "requestId": format!("{session_id}:launch"),
        "entry": request.entry,
    });
    if let Err(error) = socket.send(Message::Text(launch_request.to_string().into())) {
        terminate_child(&child);
        let _ = fs::remove_dir_all(&temp_root);
        return Err(ProvidenceError::message(format!(
            "Could not send the preview launch request: {error}"
        )));
    }
    socket
        .get_mut()
        .set_read_timeout(Some(Duration::from_millis(100)))
        .map_err(|error| ProvidenceError::message(format!(
            "Could not configure preview event polling: {error}"
        )))?;

    let (command_sender, command_receiver) = mpsc::channel::<Value>();
    let thread_child = child.clone();
    let thread_root = temp_root.clone();
    let thread_session_id = session_id.clone();
    thread::spawn(move || {
        run_preview_connection(
            app,
            socket,
            command_receiver,
            thread_child,
            &thread_session_id,
        );
        let _ = fs::remove_dir_all(thread_root);
    });

    *manager.session.lock().map_err(lock_error)? = Some(PreviewSession {
        command_sender,
        child,
        temp_root,
        session_id: session_id.clone(),
    });
    Ok(LaunchPreviewReport {
        session_id,
        package_path: package_path.to_string_lossy().replace('\\', "/"),
        package_hash,
        process_id,
    })
}

#[tauri::command]
pub fn send_remake_preview_command(
    manager: State<'_, PreviewManager>,
    message: Value,
) -> Result<()> {
    if !message.is_object() {
        return Err(ProvidenceError::message(
            "Preview command must be a JSON object",
        ));
    }
    let guard = manager.session.lock().map_err(lock_error)?;
    let session = guard.as_ref().ok_or_else(|| {
        ProvidenceError::message("No Realmz Remake preview is running")
    })?;
    session.command_sender.send(message).map_err(|_| {
        ProvidenceError::message("Realmz Remake preview connection has closed")
    })
}

#[tauri::command]
pub fn stop_remake_preview(manager: State<'_, PreviewManager>) -> Result<()> {
    stop_session(&manager)
}

fn stop_session(manager: &PreviewManager) -> Result<()> {
    let session = manager.session.lock().map_err(lock_error)?.take();
    if let Some(session) = session {
        let _ = session.command_sender.send(json!({
            "type": "stop",
            "requestId": format!("{}:stop", session.session_id),
        }));
        thread::sleep(Duration::from_millis(100));
        if let Ok(mut child) = session.child.lock() {
            if child.try_wait().ok().flatten().is_none() {
                let _ = child.kill();
            }
        }
        let _ = fs::remove_dir_all(session.temp_root);
    }
    Ok(())
}

fn runtime_command(settings: &PreviewSettings) -> Result<Command> {
    let remake_path = PathBuf::from(settings.remake_path.trim());
    if remake_path.is_file() {
        return Ok(Command::new(remake_path));
    }
    if !remake_path.is_dir() {
        return Err(ProvidenceError::message(
            "Choose a Realmz Remake checkout, Godot project folder, or installed executable",
        ));
    }
    let project_path = if remake_path.join("project.godot").is_file() {
        remake_path
    } else if remake_path.join("src").join("project.godot").is_file() {
        remake_path.join("src")
    } else {
        return Err(ProvidenceError::message(
            "The selected Realmz Remake checkout has no project.godot",
        ));
    };
    let godot = PathBuf::from(settings.godot_executable.trim());
    if !godot.is_file() {
        return Err(ProvidenceError::message(
            "Choose the Godot executable used to run the local Remake checkout",
        ));
    }
    let mut command = Command::new(godot);
    command.arg("--path").arg(project_path);
    Ok(command)
}

fn accept_preview_connection(
    listener: &TcpListener,
    child: &Arc<Mutex<Child>>,
) -> Result<TcpStream> {
    let deadline = Instant::now() + HANDSHAKE_TIMEOUT;
    loop {
        match listener.accept() {
            Ok((stream, address)) if address.ip().is_loopback() => return Ok(stream),
            Ok(_) => continue,
            Err(error) if error.kind() == ErrorKind::WouldBlock => {}
            Err(error) => {
                return Err(ProvidenceError::message(format!(
                    "Realmz Remake preview listener failed: {error}"
                )));
            }
        }
        if child
            .lock()
            .map_err(lock_error)?
            .try_wait()
            .map_err(|error| ProvidenceError::message(format!(
                "Could not inspect the Realmz Remake preview process: {error}"
            )))?
            .is_some()
        {
            return Err(ProvidenceError::message(
                "Realmz Remake exited before connecting to Providence",
            ));
        }
        if Instant::now() >= deadline {
            return Err(ProvidenceError::message(
                "Realmz Remake did not connect to Providence within 15 seconds",
            ));
        }
        thread::sleep(Duration::from_millis(25));
    }
}

fn authenticate_handshake(socket: &mut WebSocket<TcpStream>, nonce: &str) -> Result<()> {
    let message = socket.read().map_err(|error| ProvidenceError::message(format!(
        "Could not read the Realmz Remake preview handshake: {error}"
    )))?;
    let text = message.to_text().map_err(|_| {
        ProvidenceError::message("Realmz Remake preview handshake was not text")
    })?;
    if text.len() > MAX_MESSAGE_BYTES {
        return Err(ProvidenceError::message(
            "Realmz Remake preview handshake exceeded the message limit",
        ));
    }
    let value: Value = serde_json::from_str(text).map_err(|error| {
        ProvidenceError::message(format!("Realmz Remake preview handshake was invalid: {error}"))
    })?;
    if value.get("type").and_then(Value::as_str) != Some("handshake")
        || value.get("protocolVersion").and_then(Value::as_u64)
            != Some(PREVIEW_PROTOCOL_VERSION.into())
        || value.get("nonce").and_then(Value::as_str) != Some(nonce)
    {
        return Err(ProvidenceError::message(
            "Realmz Remake preview authentication failed",
        ));
    }
    Ok(())
}

fn await_package_loaded(socket: &mut WebSocket<TcpStream>) -> Result<()> {
    loop {
        let message = socket.read().map_err(|error| ProvidenceError::message(format!(
            "Realmz Remake did not finish loading the preview package: {error}"
        )))?;
        if !message.is_text() {
            continue;
        }
        let text = message.to_text().unwrap_or_default();
        if text.len() > MAX_MESSAGE_BYTES {
            return Err(ProvidenceError::message(
                "Realmz Remake preview response exceeded the message limit",
            ));
        }
        let value: Value = serde_json::from_str(text).map_err(|error| {
            ProvidenceError::message(format!("Realmz Remake preview response was invalid: {error}"))
        })?;
        if value.get("type").and_then(Value::as_str) != Some("response")
            || value.get("requestId").and_then(Value::as_str) != Some("")
        {
            continue;
        }
        if value.get("status").and_then(Value::as_str) == Some("ok") {
            return Ok(());
        }
        return Err(ProvidenceError::message(
            value
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("Realmz Remake rejected the preview package"),
        ));
    }
}

fn run_preview_connection(
    app: AppHandle,
    mut socket: WebSocket<TcpStream>,
    command_receiver: mpsc::Receiver<Value>,
    child: Arc<Mutex<Child>>,
    session_id: &str,
) {
    loop {
        while let Ok(command) = command_receiver.try_recv() {
            if socket
                .send(Message::Text(command.to_string().into()))
                .is_err()
            {
                return;
            }
        }
        match socket.read() {
            Ok(message) if message.is_text() => {
                if let Ok(text) = message.to_text() {
                    if text.len() <= MAX_MESSAGE_BYTES {
                        if let Ok(mut event) = serde_json::from_str::<Value>(text) {
                            if let Some(object) = event.as_object_mut() {
                                object.insert(
                                    "previewSessionId".to_string(),
                                    Value::String(session_id.to_string()),
                                );
                            }
                            let _ = app.emit("remake-preview-event", event);
                        }
                    }
                }
            }
            Ok(message) if message.is_close() => return,
            Ok(_) => {}
            Err(WebSocketError::Io(error))
                if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {}
            Err(WebSocketError::ConnectionClosed | WebSocketError::AlreadyClosed) => return,
            Err(error) => {
                let _ = app.emit(
                    "remake-preview-event",
                    json!({
                        "type": "runtime-error",
                        "previewSessionId": session_id,
                        "message": error.to_string(),
                    }),
                );
                return;
            }
        }
        if child
            .lock()
            .ok()
            .and_then(|mut process| process.try_wait().ok().flatten())
            .is_some()
        {
            return;
        }
    }
}

fn random_hex(bytes: usize) -> String {
    let mut value = vec![0_u8; bytes];
    OsRng.fill_bytes(&mut value);
    hex::encode(value)
}

fn terminate_child(child: &Arc<Mutex<Child>>) {
    if let Ok(mut process) = child.lock() {
        let _ = process.kill();
        let _ = process.wait();
    }
}

fn lock_error<T>(_: std::sync::PoisonError<T>) -> ProvidenceError {
    ProvidenceError::message("Realmz Remake preview state lock was poisoned")
}
