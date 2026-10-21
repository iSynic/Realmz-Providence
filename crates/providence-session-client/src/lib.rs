//! Local session framing is independent of editor projections and MCP.
pub mod capabilities;
pub mod endpoint;
pub mod file_access;
pub mod listener;
pub mod process;
use interprocess::local_socket::{Stream, prelude::*};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{self, BufRead, BufReader, Read, Write};

pub const HOST_PROTOCOL: u32 = 3;

pub fn authority_identity() -> Value {
    serde_json::json!({"hostProtocol":HOST_PROTOCOL,"authoritySha256":env!("PROVIDENCE_AUTHORITY_SHA256")})
}

/// Matches feature receipt IDs while remaining unique across proxy reconnects.
pub fn new_operation_id() -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(uuid::Uuid::new_v4().as_bytes()))
}
pub const MAX_FRAME_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub id: u64,
    pub method: String,
    #[serde(default)]
    pub params: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    pub id: u64,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outcome_unknown: Option<bool>,
}
impl Response {
    pub fn success(id: u64, result: Value) -> Self {
        Self {
            id,
            ok: true,
            result: Some(result),
            error: None,
            outcome_unknown: None,
        }
    }
    pub fn failure(id: u64, message: impl Into<String>) -> Self {
        Self {
            id,
            ok: false,
            result: None,
            error: Some(message.into()),
            outcome_unknown: None,
        }
    }
}

pub fn read_frame(reader: &mut impl BufRead) -> io::Result<Option<String>> {
    let mut frame = String::new();
    let count = reader.take(MAX_FRAME_BYTES + 1).read_line(&mut frame)?;
    if count == 0 {
        return Ok(None);
    }
    if count as u64 > MAX_FRAME_BYTES || !frame.ends_with('\n') {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "session frame exceeds limit or is incomplete",
        ));
    }
    Ok(Some(frame))
}
pub fn write_frame(writer: &mut impl Write, value: &impl Serialize) -> io::Result<()> {
    let mut bytes = serde_json::to_vec(value)?;
    if bytes.len() as u64 >= MAX_FRAME_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "session response exceeds frame limit",
        ));
    }
    bytes.push(b'\n');
    writer.write_all(&bytes)?;
    writer.flush()
}

pub struct Client {
    stream: BufReader<Stream>,
    next_id: u64,
    pub attachment: Value,
}
impl Client {
    pub fn connect(endpoint: &endpoint::Endpoint, handshake: Value) -> Result<Self, String> {
        let stream = Stream::connect(endpoint.name()?).map_err(|e| e.to_string())?;
        let mut client = Self {
            stream: BufReader::new(stream),
            next_id: 1,
            attachment: Value::Null,
        };
        let reply = client.call(
            "host.attach",
            serde_json::json!({"token":endpoint.token,"protocol":HOST_PROTOCOL,"client":handshake}),
        )?;
        if !reply.ok {
            return Err(reply
                .error
                .unwrap_or_else(|| "session attachment failed".into()));
        }
        client.attachment = reply.result.unwrap_or(Value::Null);
        Ok(client)
    }
    pub fn call(&mut self, method: &str, params: Value) -> Result<Response, String> {
        let id = self.next_id;
        self.next_id += 1;
        self.request(&Request {
            id,
            method: method.into(),
            params,
        })
    }
    pub fn request(&mut self, request: &Request) -> Result<Response, String> {
        write_frame(self.stream.get_mut(), request).map_err(|e| e.to_string())?;
        let line = read_frame(&mut self.stream)
            .map_err(|e| e.to_string())?
            .ok_or("session disconnected; reconcile the operation before retrying")?;
        let response: Response = serde_json::from_str(&line).map_err(|e| e.to_string())?;
        if response.id != request.id {
            return Err("session response identity mismatch".into());
        }
        Ok(response)
    }
}
