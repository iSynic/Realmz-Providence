//! Session policy is independent of socket framing and feature dispatch.
use super::*;
use crate::{catalogs::OpenLibraries, transport};
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, VecDeque};
#[path = "control_connections.rs"]
mod control_connections;
#[path = "controls.rs"]
mod controls;
#[path = "rejections.rs"]
mod rejections;
#[path = "support_change.rs"]
mod support_change;

pub(super) struct Context<'a> {
    pub session: &'a mut EditorSession,
    pub store: &'a ProjectStore,
    pub libraries: &'a mut OpenLibraries,
    pub jobs: &'a mut ConnectionJobs,
}
impl Context<'_> {
    fn dispatch(&mut self, request: Request) -> Response {
        let (catalogs, monster) = self.libraries.split();
        transport::process_request(
            self.session,
            Some(self.store),
            catalogs,
            monster,
            self.jobs,
            request,
            None,
        )
    }
}
pub(super) struct ClientState {
    pub file_access: providence_session_client::file_access::FileAccess,
    pub kind: String,
    pub connected: bool,
    pub draft: bool,
    pub ready: bool,
    pub owner: String,
    pub draft_locations: Vec<holds::DraftLocation>,
    control_token: String,
    control_generation: u64,
    control_parent: Option<u64>,
}
pub(super) struct State {
    token: String,
    pub generation: String,
    options: Vec<String>,
    support_inputs: Value,
    pub clients: BTreeMap<u64, ClientState>,
    pub changes: changes::PreparedChanges,
    exports: export_jobs::Jobs,
    feed: VecDeque<Value>,
    sequence: u64,
    local_resource_cursor: u64,
    coordination: collaboration::Coordination,
    holds: holds::Holds,
    unresolved_operations: Vec<Value>,
}
impl State {
    #[cfg(test)]
    pub fn hold_export(
        &mut self,
        point: export_jobs::TestPoint,
    ) -> (std::sync::mpsc::Receiver<()>, std::sync::mpsc::Sender<()>) {
        self.exports.hold_next(point)
    }
    pub fn new(token: &str, options: &[String]) -> Self {
        Self {
            token: token.into(),
            generation: format!("{:x}", Sha256::digest(token)),
            options: options.to_vec(),
            support_inputs: json!([]),
            clients: BTreeMap::new(),
            changes: Default::default(),
            exports: Default::default(),
            feed: VecDeque::new(),
            sequence: 0,
            local_resource_cursor: 0,
            coordination: Default::default(),
            holds: Default::default(),
            unresolved_operations: Vec::new(),
        }
    }
    pub fn disconnect(&mut self, client: u64) -> Result<(), String> {
        if self
            .clients
            .get(&client)
            .is_some_and(|r| r.kind == "native")
        {
            self.clients.get_mut(&client).unwrap().connected = false;
        } else {
            self.clients.remove(&client);
        }
        self.persist_holds()
    }
    pub fn has_drafts(&self) -> bool {
        !self.holds.disconnected.is_empty()
            || self
                .clients
                .values()
                .any(|r| r.kind == "native" && (r.draft || !r.ready || !r.connected))
    }
    /// Attached connections whose presence keeps the host serving.
    pub fn open_clients(&self) -> BTreeSet<u64> {
        let open = |client: &ClientState| client.connected && client.kind != "native-control";
        self.clients
            .iter()
            .filter_map(|(id, client)| open(client).then_some(*id))
            .collect()
    }
    pub fn has_connected_clients(&self) -> bool {
        !self.open_clients().is_empty()
    }
    pub fn dispatch(
        &mut self,
        client: u64,
        request: Request,
        context: &mut Context<'_>,
    ) -> Response {
        let id = request.id;
        self.handle(client, request, context)
            .unwrap_or_else(|error| {
                let uncertain = error.starts_with("outcome-unknown:");
                let mut response = failure(id, error);
                response.outcome_unknown = uncertain.then_some(true);
                response
            })
    }
    fn handle(
        &mut self,
        client: u64,
        mut request: Request,
        context: &mut Context<'_>,
    ) -> Result<Response, String> {
        if request.method == "host.attach" {
            if self.clients.contains_key(&client) {
                return Err("host-authentication: this connection is already attached".into());
            }
            return self.attach(client, request.id, &request.params);
        }
        let kind = self.authorized_request(client, &mut request)?;
        if request.method == "session.describe" {
            return Ok(success(request.id, self.describe(context.session)));
        }
        let capability = providence_session_client::capabilities::by_method(&request.method);
        let mutates = request.method == "changes.commit"
            || capability
                .as_ref()
                .is_some_and(|r| r.mutation || r.external_effect)
            || (kind == "native"
                && capability.is_none()
                && !revision_scope::review(&request.method)
                && request.params.get("expectedRevision").is_some());
        if mutates && let Some(response) = receipts::replay(context.store, &request)? {
            return Ok(response);
        }
        if let Err(error) = self.guard(context.session, &request, &kind) {
            if mutates && error.starts_with("revision-conflict:") {
                return self.reject_stale(&request, &kind, error, context);
            }
            return Err(error);
        }
        if let Some(result) = self.control(client, &kind, &request, context) {
            return result;
        }
        import_policy::guard(context.session, &request.method, &kind)?;
        self.guard_write(&request, &kind, mutates)?;
        if request.method == "changes.prepare" {
            let (catalogs, _) = context.libraries.split();
            let prepared = self.changes.prepare(
                context.session,
                context.store,
                catalogs,
                &request.params,
                &self.generation,
                (kind == "mcp").then_some(&self.clients[&client].file_access),
            )?;
            let mut response = success(request.id, prepared);
            self.annotate(&mut response, context.session, "changes.prepare");
            return Ok(response);
        }
        if kind == "mcp" && request.method != "changes.commit" && capability.is_none() {
            return Err(format!("capability-unavailable: {}", request.method));
        }
        self.execute(client, request, mutates, context)
    }
    fn authorized_request(&self, client: u64, request: &mut Request) -> Result<String, String> {
        let method = request.method.as_str();
        let kind = &self
            .clients
            .get(&client)
            .ok_or("host-authentication: attach first")?
            .kind;
        if kind == "native-control" {
            self.native_control_owner(client)?;
            if !matches!(
                method,
                "session.describe" | "session.collaboration" | "session.changes" | "session.draft"
            ) {
                return Err("native-control-only: this connection only reads status and registers its owner's draft".into());
            }
        }
        // Status transports share the host but cannot acquire an editing
        // capability, manage drafts, or prepare any effect.
        if kind == "observer"
            && !matches!(
                method,
                "session.describe" | "session.collaboration" | "session.changes"
            )
        {
            return Err("observer-read-only: this connection only reads session status".into());
        }
        if kind == "mcp" {
            self.clients[&client]
                .file_access
                .authorize(method, &mut request.params)?;
        }
        Ok(kind.clone())
    }
    fn guard_write(&mut self, request: &Request, kind: &str, mutates: bool) -> Result<(), String> {
        if (mutates || request.method == "changes.prepare")
            && support::identities(&self.options)? != self.support_inputs
        {
            return Err("application-support-changed: reopen with the exact support inputs before preparing or committing changes".into());
        }
        if mutates && !self.unresolved_operations.is_empty() {
            return Err("operation-unresolved: inspect pending operation receipts and the reopened project before further writes".into());
        }
        if (mutates || request.method == "changes.prepare") && kind == "mcp" && self.has_drafts() {
            return Err("draft-active: apply or discard the native draft before MCP edits".into());
        }
        if mutates && kind == "mcp" {
            let native = self
                .clients
                .iter()
                .filter(|(_, r)| r.kind == "native" && r.connected)
                .map(|(id, _)| *id)
                .collect::<Vec<_>>();
            self.coordination.preflight(request, &native)?;
        }
        Ok(())
    }
    fn attach(&mut self, client: u64, id: u64, params: &Value) -> Result<Response, String> {
        if params["token"] != self.token
            || params["protocol"] != providence_session_client::HOST_PROTOCOL
        {
            return Err("host-authentication: incompatible or unauthorized session".into());
        }
        let current = serde_json::to_value(providence_core::build_identity::current(
            "providence-native-adapter",
        ))
        .map_err(|e| e.to_string())?;
        if params["client"]["build"] != current
            || params["client"]["authority"] != providence_session_client::authority_identity()
            || params["client"]["supportInputs"] != self.support_inputs
        {
            return Err(
                "host-incompatible: build or application-support configuration differs".into(),
            );
        }
        let kind = params["client"]["kind"]
            .as_str()
            .filter(|r| matches!(*r, "mcp" | "native" | "observer" | "native-control"))
            .ok_or("invalid client kind")?;
        let control_parent = self.bind_native_control(client, kind, params)?;
        self.clients.insert(
            client,
            ClientState {
                file_access: providence_session_client::file_access::FileAccess::from_handshake(
                    &params["client"]["fileAccess"],
                )?,
                kind: kind.into(),
                connected: true,
                draft: false,
                ready: kind != "native",
                owner: params["client"]["owner"].as_str().unwrap_or("").to_string(),
                draft_locations: vec![],
                control_token: if kind == "native" {
                    providence_session_client::new_operation_id()
                } else {
                    String::new()
                },
                control_parent,
                control_generation: 0,
            },
        );
        if kind == "native" {
            self.register_native_owner(client)?;
        }
        let mut attached = json!({"sessionGeneration":self.generation});
        if kind == "native" {
            attached["nativeControl"] =
                json!({"clientId":client,"token":self.clients[&client].control_token});
        }
        Ok(success(id, attached))
    }
    fn describe(&self, session: &EditorSession) -> Value {
        let mut result = crate::session_summary::session_projection(session);
        result["sessionGeneration"] = json!(self.generation);
        result["provenance"] = self.provenance();
        result["changeCursor"] = json!(self.sequence);
        result["localResourceCursor"] = json!(self.local_resource_cursor);
        result["nativeDraftActive"] = json!(self.has_drafts());
        result["externalEditsPaused"] = json!(self.coordination.paused);
        result["undoEntry"] = json!(
            session
                .undo_history()
                .last()
                .and_then(|entry| entry.attribution.as_ref())
        );
        result["redoEntry"] = json!(
            session
                .redo_history()
                .last()
                .and_then(|entry| entry.attribution.as_ref())
        );
        result["clients"] = json!(self.clients.iter().filter(|(_,r)|matches!(r.kind.as_str(),"native"|"mcp")).map(|(id,r)|json!({"id":id,"kind":r.kind,"connected":r.connected,"draftActive":r.draft,"ready":r.ready})).collect::<Vec<_>>());
        result
    }
    fn execute(
        &mut self,
        client: u64,
        mut request: Request,
        mutation: bool,
        context: &mut Context<'_>,
    ) -> Result<Response, String> {
        let receipt = if mutation {
            Some(receipts::begin_with_provenance(
                context.store,
                &request,
                self.provenance(),
            )?)
        } else {
            None
        };
        if let Some(receipts::Start::Replay(mut response)) = receipt {
            response.id = request.id;
            return Ok(response);
        }
        let id = request.id;
        let before = context.session.revision();
        let method = request.method.clone();
        if matches!(
            request.method.as_str(),
            "validation.begin" | "readiness.begin"
        ) {
            request.params["_retainCapturedRevision"] = json!(self.clients[&client].kind == "mcp");
        }
        request.params["_historyAttribution"] = json!(self.attribution(client, &request));
        let mut response = self.dispatch_effect(client, request, context);
        if mutation {
            self.coordination.clear();
        }
        if context.session.revision() != before
            || (method == "paint-resources.apply" && response.ok)
        {
            self.record_change(client, &method, context.session, response.result.as_ref());
        }
        self.annotate(&mut response, context.session, &method);
        if let Some(receipts::Start::New(path)) = receipt
            && let Err(error) = receipts::finish(&path, &response)
        {
            response = failure(id, error);
            response.outcome_unknown = Some(true);
        }
        Ok(response)
    }
    fn dispatch_effect(
        &mut self,
        client: u64,
        request: Request,
        context: &mut Context<'_>,
    ) -> Response {
        match request.method.as_str() {
            "changes.commit" => self.commit(client, &request, context),
            "export.begin" | "export.poll" | "export.cancel" | "export.inspect-artifact" => {
                let provenance = self.provenance();
                let (catalogs, _) = context.libraries.split();
                match self.exports.dispatch(
                    export_jobs::CaptureContext {
                        session: context.session,
                        store: context.store,
                        catalogs,
                        options: &self.options,
                        provenance,
                    },
                    &request.method,
                    &request.params,
                ) {
                    Ok(result) => success(request.id, result),
                    Err(error) => failure(request.id, error),
                }
            }
            _ => context.dispatch(request),
        }
    }
    fn commit(&mut self, client: u64, request: &Request, context: &mut Context<'_>) -> Response {
        let result = match self.changes.commit(
            context.session,
            context.store,
            &request.params,
            &self.generation,
            self.attribution(client, request),
        ) {
            Ok(result) => result,
            Err(error) => return failure(request.id, error),
        };
        let journal = json!({"method":"changes.commit","params":request.params,"clientId":client,"clientKind":self.clients[&client].kind});
        match context.store.checkpoint_session(context.session, &journal) {
            Ok(_) => success(request.id, result),
            Err(error) => {
                let mut response = failure(
                    request.id,
                    format!("checkpoint failed; reopen and reconcile: {error}"),
                );
                response.outcome_unknown = Some(true);
                response
            }
        }
    }
    fn annotate(&self, response: &mut Response, session: &EditorSession, method: &str) {
        if let Some(result) = response.result.as_mut().and_then(Value::as_object_mut) {
            let revision = result
                .get("sourceRevision")
                .or_else(|| result.get("revision"))
                .cloned()
                .unwrap_or_else(|| json!(session.revision()));
            result.insert("sessionGeneration".into(), json!(self.generation));
            result.insert("projectId".into(), json!(session.snapshot().project_id));
            result.insert("sourceRevision".into(), revision);
            result.insert("provenance".into(), self.provenance());
            result.insert("historyScope".into(), json!(revision_scope::label(method)));
            if revision_scope::library_owned(method) {
                result.insert("sourceRevision".into(), json!(session.revision()));
            }
        }
    }
    fn provenance(&self) -> Value {
        json!({"supportInputs":self.support_inputs,
            "buildIdentity":providence_core::build_identity::current("providence-native-adapter"),
            "authority":providence_session_client::authority_identity(),
            "hostProtocol":providence_session_client::HOST_PROTOCOL})
    }
    fn attribution(
        &self,
        client: u64,
        request: &Request,
    ) -> providence_core::session::HistoryAttribution {
        providence_core::session::HistoryAttribution {
            operation_id: request.params["operationId"]
                .as_str()
                .unwrap_or("")
                .to_string(),
            client_kind: self.clients[&client].kind.clone(),
            label: if self.clients[&client].kind == "mcp" {
                "Assistant scenario edits"
            } else {
                "Native edit"
            }
            .into(),
        }
    }
    fn guard(&self, session: &EditorSession, request: &Request, kind: &str) -> Result<(), String> {
        let params = &request.params;
        let identity = if kind != "mcp" {
            params.get("_hostSession").unwrap_or(params)
        } else {
            params
        };
        if identity["sessionGeneration"] != self.generation
            || identity["projectId"] != session.snapshot().project_id.0
        {
            return Err("session-stale: refresh project and session identity".into());
        }
        let revision_independent = request.method.ends_with(".poll")
            || request.method.ends_with(".cancel")
            || matches!(
                request.method.as_str(),
                "session.operation-status"
                    | "session.reconcile-operation"
                    | "session.changes"
                    | "session.collaboration"
                    | "session.draft"
                    | "session.write-permit"
                    | "session.external-edits"
                    | "session.release-hold"
                    | "session.disconnect-client"
                    | "session.detach"
            );
        let native_read = kind == "native"
            && (params.get("expectedRevision").is_none()
                || revision_scope::library_owned(&request.method));
        if !revision_independent
            && !native_read
            && params["expectedRevision"].as_u64() != Some(session.revision().0)
        {
            return Err(format!(
                "revision-conflict: current revision is {}",
                session.revision().0
            ));
        }
        Ok(())
    }
    fn record_change(
        &mut self,
        client: u64,
        method: &str,
        session: &EditorSession,
        result: Option<&Value>,
    ) {
        self.sequence += 1;
        if method == "paint-resources.apply" {
            self.local_resource_cursor = self.sequence;
        }
        let entities = result.and_then(|r| {
            r.get("changedEntities")
                .or_else(|| r.pointer("/change/changedEntities"))
        });
        self.feed.push_back(json!({"cursor":self.sequence,"revision":session.revision(),"clientId":client,"clientKind":self.clients[&client].kind,"method":method,"changedEntities":entities,"refreshRequired":true,"refreshScopes":if method == "paint-resources.apply" {vec!["paint-resources"]} else {vec!["project"]},"canUndo":session.can_undo(),"canRedo":session.can_redo()}));
        while self.feed.len() > 256 {
            self.feed.pop_front();
        }
    }
    fn read_feed(&self, id: u64, params: &Value) -> Result<Response, String> {
        let cursor = params["cursor"].as_u64().ok_or("cursor is required")?;
        if cursor > self.sequence
            || self
                .feed
                .front()
                .is_some_and(|r| cursor + 1 < r["cursor"].as_u64().unwrap())
        {
            return Err("change-cursor-expired: resynchronize the session".into());
        }
        Ok(success(
            id,
            json!({"cursor":self.sequence,"changes":self.feed.iter().filter(|r|r["cursor"].as_u64().unwrap()>cursor).collect::<Vec<_>>()}),
        ))
    }
}
pub(super) fn success(id: u64, result: Value) -> Response {
    Response {
        id,
        ok: true,
        result: Some(result),
        error: None,
        outcome_unknown: None,
    }
}
pub(super) fn failure(id: u64, error: String) -> Response {
    Response {
        id,
        ok: false,
        result: None,
        error: Some(error),
        outcome_unknown: None,
    }
}
