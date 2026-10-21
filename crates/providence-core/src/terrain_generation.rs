//! Seeded, bounded tile generation. Only applied native cells enter authored truth.
use crate::{
    map_connectivity::{self, Connection, Route, Status},
    map_paint,
    model::*,
    session::{LandMapCellPaint, SessionError},
    terrain_joining::AtlasEvidence,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;

mod domains;
mod review;
mod solver;
pub use review::reviewed_paint;
#[cfg(test)]
pub(crate) mod tests;

pub const ALGORITHM_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Density {
    Sparse,
    Balanced,
    Dense,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Intent {
    pub tileset_id: StableId,
    pub atlas_blob: BlobId,
    pub mapping_revision: u64,
    pub family: String,
    pub density: Density,
    pub seed: u32,
    pub mask: Vec<MapCoordinate>,
    pub locks: Vec<MapCoordinate>,
    pub connections: Vec<Connection>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Outcome {
    Success,
    Contradiction,
    BudgetExhausted,
    Canceled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub algorithm_version: u32,
    pub outcome: Outcome,
    pub painted_cells: Vec<LandMapCellPaint>,
    pub protected_cells: Vec<MapCoordinate>,
    pub routes: Vec<Route>,
    pub work: usize,
    pub decisions: usize,
    pub reason: String,
    pub review_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Apply {
    pub identity: StableId,
    pub intent: Intent,
    pub atlas: AtlasEvidence,
    pub review_hash: String,
}

pub fn preview(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    intent: &Intent,
    atlas: &AtlasEvidence,
    canceled: &mut impl FnMut() -> bool,
) -> Result<Plan, SessionError> {
    let prepared = domains::prepare(snapshot, identity, intent, atlas)?;
    let mut search = solver::Search::new(prepared, intent);
    let mut routes = vec![];
    let result = search.solve(canceled, &mut |tiles| {
        if intent.connections.is_empty() {
            return true;
        }
        let mut map = snapshot
            .world
            .maps
            .iter()
            .find(|map| map.identity == *identity)
            .unwrap()
            .clone();
        for cell in tiles {
            map.tiles[map_connectivity::index(MapCoordinate {
                x: cell.x,
                y: cell.y,
            })] = cell.tile;
        }
        routes = map_connectivity::preview_map(snapshot, &map, &intent.connections);
        routes.iter().all(|route| route.status == Status::Connected)
    });
    finish(identity, intent, atlas, search, result, routes)
}

fn finish(
    identity: &StableId,
    intent: &Intent,
    atlas: &AtlasEvidence,
    search: solver::Search,
    result: Result<Vec<LandMapCellPaint>, Outcome>,
    routes: Vec<Route>,
) -> Result<Plan, SessionError> {
    let (outcome, painted_cells, reason) = match result {
        Ok(cells) => (
            Outcome::Success,
            cells,
            "Exact terrain joins and required walking connections passed.",
        ),
        Err(Outcome::Contradiction) => (
            Outcome::Contradiction,
            vec![],
            "No exact solution satisfies these boundaries, locks and walking connections. Adjust the selection or constraints.",
        ),
        Err(Outcome::Canceled) => (
            Outcome::Canceled,
            vec![],
            "Generation canceled. The map is unchanged.",
        ),
        Err(_) => (
            Outcome::BudgetExhausted,
            vec![],
            "The bounded search stopped. Try a smaller area, another seed or fewer constraints.",
        ),
    };
    let mut plan = Plan {
        algorithm_version: ALGORITHM_VERSION,
        outcome,
        painted_cells,
        protected_cells: search.protected_cells(),
        routes,
        work: search.work(),
        decisions: search.decisions(),
        reason: reason.into(),
        review_hash: String::new(),
    };
    plan.review_hash = format!(
        "{:x}",
        Sha256::digest(
            serde_json::to_vec(&(identity, intent, atlas, &plan))
                .expect("terrain plan serialization")
        )
    );
    Ok(plan)
}

pub fn coordinates(
    identity: &StableId,
    cells: &[MapCoordinate],
) -> Result<BTreeSet<usize>, SessionError> {
    if cells.len() > 8100 || cells.iter().any(|cell| cell.x >= 90 || cell.y >= 90) {
        return Err(map_paint::invalid(
            identity,
            "Terrain selections and locks must fit this 90 by 90 map.",
        ));
    }
    Ok(cells.iter().copied().map(map_connectivity::index).collect())
}
