//! Explicit native support changes replace external catalogs without editing the scenario.
use super::*;

impl State {
    pub(super) fn replace_support(
        &mut self,
        client: u64,
        params: &Value,
        context: &mut Context<'_>,
    ) -> Result<Value, String> {
        if self
            .clients
            .values()
            .filter(|r| matches!(r.kind.as_str(), "native" | "mcp"))
            .count()
            != 1
            || !self
                .clients
                .get(&client)
                .is_some_and(|r| r.kind == "native" && r.connected)
        {
            return Err(
                "support-in-use: disconnect other clients before changing application support"
                    .into(),
            );
        }
        if self.has_drafts() {
            return Err(
                "draft-active: settle all native drafts before changing application support".into(),
            );
        }
        let options: Vec<String> = serde_json::from_value(params["options"].clone())
            .map_err(|e| format!("invalid support options: {e}"))?;
        if options.len() > 32 {
            return Err("too many application-support options".into());
        }
        let before = support::identities(&options)?;
        let libraries =
            crate::library_arguments::open_library_arguments(&mut options.clone().into_iter())?;
        if support::identities(&options)? != before {
            return Err("application-support-changed: inputs changed while opening the replacement catalogs".into());
        }
        self.generation = format!(
            "{:x}",
            Sha256::digest(format!("{}:{before}", self.generation))
        );
        self.options = options;
        self.support_inputs = before;
        self.changes = Default::default();
        self.coordination.paused = true;
        self.coordination.clear();
        *context.libraries = libraries;
        *context.jobs = ConnectionJobs::new(context.libraries.split().0);
        let mut result = self.describe(context.session);
        result["supportChanged"] = json!(true);
        result["historyScope"] = json!("external-application-support; no project Undo entry");
        Ok(result)
    }
}
