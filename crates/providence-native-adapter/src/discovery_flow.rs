//! Flow cursors bind a derived graph to one index lifetime and exact catalog inputs.
use providence_core::{
    discovery::flow::{FlowCatalog, FlowGraph, FlowPage, FlowQuery, FlowTraversal},
    session::EditorSession,
};
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    sync::{
        Arc, Mutex, OnceLock,
        atomic::{AtomicU64, Ordering},
    },
};

pub(crate) fn summaries(
    session: &EditorSession,
    params: &Value,
    application: Option<&providence_core::rebuilt::ApplicationMediaCatalog>,
) -> Result<Value, String> {
    crate::session_routes::discovery::guard(session, params)?;
    let selections: Vec<providence_core::discovery::flow::FlowSelection> = serde_json::from_value(
        crate::request_params::coerce_integral_numbers(params["selections"].clone()),
    )
    .map_err(|error| format!("Invalid flow summary selection: {error}"))?;
    if selections.is_empty() || selections.len() > 64 {
        return Err("Request between 1 and 64 flow summaries.".into());
    }
    let items: Vec<_> = selections
        .iter()
        .map(|selection| {
            match providence_core::discovery::flow::describe_selection(
                session.snapshot(),
                session.discovery(),
                application,
                selection,
            ) {
                Ok(summary) => json!({"id": selection.node_id(), "summary": summary}),
                Err(error) => json!({"id": selection.node_id(), "error": error}),
            }
        })
        .collect();
    Ok(
        json!({"items":items, "revision":session.revision(), "projectId":session.snapshot().project_id, "generation":params.get("generation")}),
    )
}

#[cfg(test)]
mod tests;

#[derive(Default)]
struct FlowCache {
    graphs: VecDeque<(String, Arc<FlowGraph>)>,
    cursors: VecDeque<Cursor>,
}

#[derive(Clone)]
struct Cursor {
    token: String,
    binding: String,
    query: FlowQuery,
    graph: Arc<FlowGraph>,
    traversal: FlowTraversal,
    reply: Option<(FlowPage, Option<String>)>,
}

pub(crate) fn read(
    session: &EditorSession,
    params: &Value,
    catalog_key: &str,
    catalog: impl FnOnce() -> Result<FlowCatalog, String>,
) -> Result<Value, String> {
    crate::session_routes::discovery::guard(session, params)?;
    let query = query(params)?;
    let binding = serde_json::to_string(&(
        session.snapshot().project_id.0.as_str(),
        session.revision().0,
        session.discovery().cache_identity(),
        catalog_key,
    ))
    .unwrap();
    static CACHE: OnceLock<Mutex<FlowCache>> = OnceLock::new();
    let mut cache = CACHE
        .get_or_init(|| Mutex::new(FlowCache::default()))
        .lock()
        .map_err(|_| "Flow exploration is unavailable. Refresh to restart.")?;
    let cursor = match params.get("cursor") {
        None | Some(Value::Null) => None,
        Some(Value::String(value)) if value.len() <= 128 && !value.is_empty() => {
            Some(value.as_str())
        }
        _ => return Err("Flow cursor must be a nonempty continuation token.".into()),
    };
    let (page, next) = if let Some(token) = cursor {
        cache.resume(token, &binding, &query)?
    } else {
        let graph = cache.graph(&binding, || {
            Ok(FlowGraph::new(session.discovery(), &catalog()?))
        })?;
        let state = graph.start(query.clone())?;
        cache.advance(&binding, query, graph, state)
    };
    Ok(
        json!({"projectId":session.snapshot().project_id, "revision":session.revision(),
        "generation":params.get("generation"), "graph":page, "cursor":next}),
    )
}

fn query(params: &Value) -> Result<FlowQuery, String> {
    let mut query = serde_json::Map::new();
    for key in ["root", "direction", "depth", "categories"] {
        if let Some(value) = params.get(key) {
            query.insert(key.into(), value.clone());
        }
    }
    serde_json::from_value(crate::request_params::coerce_integral_numbers(
        Value::Object(query),
    ))
    .map_err(|e| format!("Invalid flow query: {e}"))
}

impl FlowCache {
    fn graph(
        &mut self,
        binding: &str,
        build: impl FnOnce() -> Result<FlowGraph, String>,
    ) -> Result<Arc<FlowGraph>, String> {
        if let Some((_, graph)) = self.graphs.iter().find(|(key, _)| key == binding) {
            return Ok(graph.clone());
        }
        let graph = Arc::new(build()?);
        self.graphs.push_back((binding.into(), graph.clone()));
        while self.graphs.len() > 2 {
            self.graphs.pop_front();
        }
        Ok(graph)
    }

    fn resume(
        &mut self,
        token: &str,
        binding: &str,
        query: &FlowQuery,
    ) -> Result<(FlowPage, Option<String>), String> {
        let cursor = self.cursors.iter().find(|r| r.token == token && r.binding == binding && r.query == *query)
            .cloned().ok_or("This flow continuation expired or belongs to different project, catalog, or query state. Refresh to restart.")?;
        if let Some(reply) = cursor.reply {
            return Ok(reply);
        }
        let reply = self.advance(binding, cursor.query, cursor.graph, cursor.traversal);
        if let Some(old) = self.cursors.iter_mut().find(|r| r.token == token) {
            old.reply = Some(reply.clone());
        }
        Ok(reply)
    }

    fn advance(
        &mut self,
        binding: &str,
        query: FlowQuery,
        graph: Arc<FlowGraph>,
        mut traversal: FlowTraversal,
    ) -> (FlowPage, Option<String>) {
        let page = graph.page(&mut traversal);
        let next = if page.complete || page.limit_reached {
            None
        } else {
            static NEXT: AtomicU64 = AtomicU64::new(1);
            let token = format!("flow-{}", NEXT.fetch_add(1, Ordering::Relaxed));
            self.cursors.push_back(Cursor {
                token: token.clone(),
                binding: binding.into(),
                query,
                graph,
                traversal,
                reply: None,
            });
            while self.cursors.len() > 8 {
                self.cursors.pop_front();
            }
            Some(token)
        };
        (page, next)
    }
}
