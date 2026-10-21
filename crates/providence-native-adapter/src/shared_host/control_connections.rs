//! Draft notifications use a bounded capability of one connected native owner.
use super::*;

impl State {
    pub(super) fn native_control_target(
        &self,
        client: u64,
        kind: &str,
        method: &str,
    ) -> Result<u64, String> {
        match kind {
            "native" => Ok(client),
            "native-control" if method == "session.draft" => self.native_control_owner(client),
            _ => Err("only the native draft owner may manage editing holds and permissions".into()),
        }
    }
    pub(super) fn bind_native_control(
        &mut self,
        client: u64,
        kind: &str,
        params: &Value,
    ) -> Result<Option<u64>, String> {
        if kind != "native-control" {
            return Ok(None);
        }
        let binding = &params["client"]["nativeControl"];
        let parent = binding["clientId"]
            .as_u64()
            .ok_or("native-control-authentication: owner is required")?;
        let native = self
            .clients
            .get(&parent)
            .filter(|client| client.connected && client.kind == "native")
            .ok_or("native-control-authentication: owner is not connected")?;
        if binding["token"].as_str() != Some(native.control_token.as_str()) {
            return Err("native-control-authentication: invalid owner capability".into());
        }
        if client <= native.control_generation {
            return Err(
                "native-control-stale: a newer control connection was already bound".into(),
            );
        }
        // Keep the high-water mark on the owner even after its newest control
        // disconnects; an older accepted socket may still be awaiting attach.
        self.clients.get_mut(&parent).unwrap().control_generation = client;
        // Preserve revoked identities until their sockets detach, so an old
        // connection cannot reauthenticate or overwrite a newer draft report.
        for control in self
            .clients
            .values_mut()
            .filter(|control| control.control_parent == Some(parent))
        {
            control.connected = false;
        }
        Ok(Some(parent))
    }

    pub(super) fn native_control_owner(&self, client: u64) -> Result<u64, String> {
        let parent = self
            .clients
            .get(&client)
            .filter(|client| client.connected)
            .and_then(|client| client.control_parent)
            .ok_or("native-control-stale: reconnect the native owner")?;
        self.clients
            .get(&parent)
            .filter(|client| client.connected && client.kind == "native")
            .map(|_| parent)
            .ok_or_else(|| "native-control-stale: the native owner disconnected".into())
    }

    pub(super) fn register_native_owner(&mut self, client: u64) -> Result<(), String> {
        let owner = &self.clients[&client].owner;
        if owner.is_empty() || owner.len() > 128 {
            self.clients.remove(&client);
            return Err("native client owner identity is required".into());
        }
        if self.clients.iter().any(|(id, candidate)| {
            *id != client && candidate.owner == *owner && candidate.connected
        }) {
            self.clients.remove(&client);
            return Err("native-owner-active: this editor already has a connected session".into());
        }
        let owner = owner.clone();
        self.clients
            .retain(|id, candidate| *id == client || candidate.owner != owner);
        self.holds.disconnected.retain(|hold| hold.owner != owner);
        self.coordination.paused = true;
        self.coordination.clear();
        self.persist_holds()
    }
}
