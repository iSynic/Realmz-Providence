use super::*;

impl State {
    pub fn pin_support(&mut self, expected: Value) -> Result<(), String> {
        let actual = support::identities(&self.options)?;
        if actual != expected {
            return Err(
                "application-support-changed: inputs changed while opening the session".into(),
            );
        }
        self.support_inputs = actual;
        Ok(())
    }
    pub fn load_receipt_gate(&mut self, store: &ProjectStore) -> Result<(), String> {
        self.unresolved_operations = receipts::unresolved(store)?;
        Ok(())
    }
    pub fn load_holds(&mut self, path: std::path::PathBuf) -> Result<(), String> {
        self.holds = holds::Holds::load(path)?;
        Ok(())
    }
    pub(super) fn persist_holds(&self) -> Result<(), String> {
        self.holds.persist(
            self.clients
                .values()
                .filter(|r| r.kind == "native")
                .map(|r| holds::Hold {
                    owner: r.owner.clone(),
                    draft_active: r.draft,
                    locations: r.draft_locations.clone(),
                }),
        )
    }
    pub(super) fn control(
        &mut self,
        client: u64,
        kind: &str,
        request: &Request,
        context: &mut Context<'_>,
    ) -> Option<Result<Response, String>> {
        let id = request.id;
        let params = &request.params;
        let result = match request.method.as_str() {
            "session.changes" => self.read_feed(id, params),
            "session.operation-status" => {
                receipts::status(context.store, params).map(|r| success(id, r))
            }
            "session.reconcile-operation" => self
                .reconcile_receipt(context, params)
                .map(|r| success(id, r)),
            "session.replace-support" => {
                if kind != "native" {
                    return Some(Err(
                        "only the native editor may replace its application support".into(),
                    ));
                }
                self.replace_support(client, params, context)
                    .map(|r| success(id, r))
            }
            "session.capabilities" => Ok(success(
                id,
                json!({"tools":providence_session_client::capabilities::all()}),
            )),
            "session.collaboration" => {
                Ok(success(id, self.collaboration_projection(context.session)))
            }
            "session.draft"
            | "session.write-permit"
            | "session.external-edits"
            | "session.release-hold"
            | "session.disconnect-client"
            | "session.detach" => {
                let owner = match self.native_control_target(client, kind, &request.method) {
                    Ok(owner) => owner,
                    Err(error) => return Some(Err(error)),
                };
                self.native_control(owner, request, context.session)
                    .map(|r| success(id, r))
            }
            _ => return None,
        };
        Some(result)
    }
    fn reconcile_receipt(
        &mut self,
        context: &Context<'_>,
        params: &Value,
    ) -> Result<Value, String> {
        let result = recovery::reconcile(context.store, context.session, params)?;
        self.load_receipt_gate(context.store)?;
        Ok(result)
    }
    fn collaboration_projection(&mut self, session: &EditorSession) -> Value {
        let mut result = self.coordination.projection();
        result["draftActive"] = json!(self.has_drafts());
        result["clients"] = json!(self.clients.iter().filter(|(_,r)|matches!(r.kind.as_str(),"native"|"mcp")).map(|(id,r)|json!({"id":id,"kind":r.kind,"connected":r.connected,"draftActive":r.draft,"ready":r.ready,"owner":r.owner,"draftLocations":r.draft_locations})).collect::<Vec<_>>());
        result["disconnectedHolds"] = json!(self.holds.disconnected);
        result["unresolvedOperations"] = json!(self.unresolved_operations);
        result["revision"] = json!(session.revision());
        result["localResourceCursor"] = json!(self.local_resource_cursor);
        result["latestChange"] = json!(self.feed.back());
        result
    }
    fn native_control(
        &mut self,
        client: u64,
        request: &Request,
        session: &EditorSession,
    ) -> Result<Value, String> {
        let params = &request.params;
        match request.method.as_str() {
            "session.draft" => {
                let active = params["active"].as_bool().ok_or("active is required")?;
                let locations = holds::draft_locations(params)?;
                let state = self.clients.get_mut(&client).unwrap();
                state.draft = active;
                state.draft_locations = if active { locations } else { vec![] };
                state.ready = true;
                if active {
                    self.coordination.clear();
                }
                self.persist_holds()?;
            }
            "session.write-permit" => {
                if params["inputFrozen"] != true
                    || self.clients[&client].draft
                    || !self.clients[&client].ready
                {
                    return Err("draft-active: freeze native input and settle pending controls before granting a write permit".into());
                }
                self.coordination.acknowledge(
                    client,
                    params["token"].as_str().ok_or("token is required")?,
                    params["revision"].as_u64().ok_or("revision is required")?,
                )?;
            }
            "session.external-edits" => {
                self.coordination.paused =
                    !params["allowed"].as_bool().ok_or("allowed is required")?;
                if self.coordination.paused {
                    self.coordination.clear();
                }
            }
            "session.release-hold" => self.release_hold(params)?,
            "session.disconnect-client" => {
                let target = params["clientId"].as_u64().ok_or("clientId is required")?;
                if !self.clients.get(&target).is_some_and(|r| r.kind == "mcp") {
                    return Err("only an assistant client can be disconnected here".into());
                }
                self.clients.remove(&target);
                self.coordination.clear();
            }
            "session.detach" => {
                if params["draftsResolved"] != true {
                    return Err("resolve native drafts before clean detach".into());
                }
                self.clients.remove(&client);
                self.persist_holds()?;
            }
            _ => return Err("unrecognized native session control".into()),
        }
        Ok(self.collaboration_projection(session))
    }
    fn release_hold(&mut self, params: &Value) -> Result<(), String> {
        if params["confirmed"] != true {
            return Err(
                "explicit confirmation is required to release a disconnected editing hold".into(),
            );
        }
        let owner = params["owner"].as_str().ok_or("owner is required")?;
        if self
            .clients
            .values()
            .any(|r| r.owner == owner && r.connected)
        {
            return Err("a connected editor must resolve its own draft".into());
        }
        self.holds.disconnected.retain(|r| r.owner != owner);
        self.clients.retain(|_, r| r.owner != owner);
        self.persist_holds()
    }
}
