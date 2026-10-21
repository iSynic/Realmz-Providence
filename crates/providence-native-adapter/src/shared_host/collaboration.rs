//! Native clients freeze input before granting an exact external write permit.
//! A reported clean draft alone cannot close the late-typing race.
use crate::Request;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    time::{Duration, Instant},
};

struct Intent {
    key: String,
    revision: u64,
    granted: BTreeSet<u64>,
    expires: Instant,
}
#[derive(Default)]
pub(super) struct Coordination {
    pub paused: bool,
    intent: Option<Intent>,
}
impl Coordination {
    pub fn preflight(&mut self, request: &Request, native: &[u64]) -> Result<(), String> {
        if self.paused {
            return Err("edits-paused: allow assistant edits in Providence Connections".into());
        }
        if native.is_empty() {
            return Ok(());
        }
        self.expire();
        let key = fingerprint(request)?;
        let revision = request.params["expectedRevision"]
            .as_u64()
            .ok_or("expectedRevision is required")?;
        if self.intent.is_none() {
            self.intent = Some(Intent {
                key: key.clone(),
                revision,
                granted: BTreeSet::new(),
                expires: Instant::now() + Duration::from_secs(15),
            });
        }
        let intent = self.intent.as_ref().unwrap();
        if intent.key != key || intent.revision != revision {
            return Err(
                "native-sync-pending: another external write is waiting for native input to settle"
                    .into(),
            );
        }
        if !native.iter().all(|id| intent.granted.contains(id)) {
            return Err("native-sync-required: waiting for native draft and input synchronization; no write attempted".into());
        }
        Ok(())
    }
    pub fn projection(&mut self) -> Value {
        self.expire();
        json!({"editsPaused":self.paused,"writeIntent":self.intent.as_ref().map(|r|json!({"token":r.key,"revision":r.revision}))})
    }
    pub fn acknowledge(&mut self, client: u64, token: &str, revision: u64) -> Result<(), String> {
        self.expire();
        let intent = self
            .intent
            .as_mut()
            .ok_or("native-sync-expired: no pending write")?;
        if intent.key != token || intent.revision != revision {
            return Err(
                "native-sync-stale: input permit does not match the pending revision".into(),
            );
        }
        intent.granted.insert(client);
        Ok(())
    }
    pub fn clear(&mut self) {
        self.intent = None;
    }
    fn expire(&mut self) {
        if self
            .intent
            .as_ref()
            .is_some_and(|r| Instant::now() >= r.expires)
        {
            self.clear();
        }
    }
}
fn fingerprint(request: &Request) -> Result<String, String> {
    let bytes = serde_json::to_vec(&json!({"method":request.method,"params":request.params}))
        .map_err(|e| e.to_string())?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn every_native_client_must_freeze_for_the_same_write_and_revision() {
        let mut sync = Coordination::default();
        let mut request = Request {
            id: 1,
            method: "changes.commit".into(),
            params: json!({"expectedRevision":4,"operationId":"edit"}),
        };
        assert!(
            sync.preflight(&request, &[2, 3])
                .unwrap_err()
                .starts_with("native-sync-required:")
        );
        let token = sync.projection()["writeIntent"]["token"]
            .as_str()
            .unwrap()
            .to_owned();
        assert!(sync.acknowledge(2, &token, 5).is_err());
        sync.acknowledge(2, &token, 4).unwrap();
        assert!(sync.preflight(&request, &[2, 3]).is_err());
        sync.acknowledge(3, &token, 4).unwrap();
        assert!(sync.preflight(&request, &[2, 3]).is_ok());
        request.params["operationId"] = json!("different");
        assert!(
            sync.preflight(&request, &[2, 3])
                .unwrap_err()
                .starts_with("native-sync-pending:")
        );
        sync.clear();
        assert!(sync.acknowledge(2, &token, 4).is_err());
    }
}
