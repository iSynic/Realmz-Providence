//! Opaque, index-local read cursors retain unfinished caller paths and cycle ancestry.
use super::{
    DiscoveryIndex,
    trace::{Frontier, TraceBatch, TraceQuery},
};
use std::{
    collections::VecDeque,
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
};

#[derive(Debug, Clone)]
struct CachedBatch {
    token: String,
    key: String,
    batch: TraceBatch,
}

#[derive(Debug, Default)]
pub(super) struct TraceCache(Mutex<VecDeque<CachedBatch>>);

impl TraceCache {
    pub(super) fn read(
        &self,
        index: &DiscoveryIndex,
        query: &TraceQuery<'_>,
    ) -> Result<(String, TraceBatch), String> {
        let key = format!(
            "{}|{}|{}|{}|{:?}|{:?}|{:?}|{:?}|{:?}|{:?}|{:?}",
            query.kind,
            query.id,
            query.depth_limit.clamp(1, 32),
            query.filter,
            query.identity,
            query.scope,
            query.ancestors,
            query.required_position,
            query.ancestor_positions,
            query.ancestor_contexts,
            query.caller_context
        );
        let mut cache = self
            .0
            .lock()
            .map_err(|_| "Caller exploration cache is unavailable")?;
        let pending = if let Some(token) = query.batch_token {
            let old = cache.iter().find(|entry| entry.token == token && entry.key == key)
                .ok_or("This caller exploration expired or belongs to a different query. Refresh to restart.")?;
            if !query.advance_work {
                return Ok((old.token.clone(), old.batch.clone()));
            }
            old.batch.pending.clone()
        } else {
            initial_frontier(query)?
        };
        let batch = index.walk_callers(pending, query.depth_limit.clamp(1, 32));
        static NEXT: AtomicU64 = AtomicU64::new(1);
        let token = format!("callers-{}", NEXT.fetch_add(1, Ordering::Relaxed));
        cache.push_back(CachedBatch {
            token: token.clone(),
            key,
            batch: batch.clone(),
        });
        // Four bounded batches support a window's paging and immediate Back navigation.
        while cache.len() > 4 {
            cache.pop_front();
        }
        Ok((token, batch))
    }
}

fn initial_frontier(query: &TraceQuery<'_>) -> Result<VecDeque<Frontier>, String> {
    if query.ancestors.len() > 128 || query.ancestors.iter().any(|id| id.len() > 512) {
        return Err(
            "Caller ancestry exceeds the bounded exploration context. Restart from Search.".into(),
        );
    }
    let path = if query.ancestors.is_empty() {
        query
            .identity
            .map(|identity| vec![identity.to_owned()])
            .unwrap_or_default()
    } else {
        query.ancestors.to_vec()
    };
    let positions = if query.ancestor_positions.is_empty() {
        let mut positions = vec![None; path.len()];
        if let Some(last) = positions.last_mut() {
            *last = query.required_position;
        }
        positions
    } else {
        if query.ancestor_positions.len() != path.len() {
            return Err("Caller positions must match their ancestry identities.".into());
        }
        query.ancestor_positions.to_vec()
    };
    let contexts = initial_contexts(query, path.len())?;
    Ok(VecDeque::from([Frontier {
        kind: query.kind.into(),
        id: query.id.into(),
        base_depth: path.len(),
        path,
        next_edge: 0,
        scope: query.scope.map(str::to_owned),
        identity: query.identity.map(str::to_owned),
        required_position: query.required_position,
        positions,
        contexts,
        caller_context: query.caller_context.map(str::to_owned),
    }]))
}

fn initial_contexts(query: &TraceQuery<'_>, length: usize) -> Result<Vec<Option<String>>, String> {
    if query.caller_context.is_some_and(|s| s.len() > 512)
        || query
            .ancestor_contexts
            .iter()
            .flatten()
            .any(|s| s.len() > 512)
    {
        return Err("Caller context exceeds the bounded identity size.".into());
    }
    let mut contexts = if query.ancestor_contexts.is_empty() {
        vec![None; length]
    } else {
        if query.ancestor_contexts.len() != length {
            return Err("Caller contexts must match their ancestry identities.".into());
        }
        query.ancestor_contexts.to_vec()
    };
    if let Some(last) = contexts.last_mut() {
        *last = query.caller_context.map(str::to_owned);
    }
    Ok(contexts)
}
