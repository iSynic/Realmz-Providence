//! Conservative fast paths for edits that cannot change typed references.

use super::{EditorCommand, EditorSession};

impl EditorSession {
    pub(super) fn leaves_references_unchanged(&self, command: &EditorCommand) -> bool {
        match command {
            EditorCommand::ClassicRuleSelection(_) => true,
            EditorCommand::ApplyScenarioSpellDraft { draft } if draft.allocation.is_none() => {
                self.preserves_spell_references(draft.record_index, &draft.definition)
            }
            EditorCommand::UpdateScenarioSpell {
                record_index,
                definition,
            } => self.preserves_spell_references(*record_index, definition),
            EditorCommand::UpdateMessageText { .. } => true,
            EditorCommand::AuthorStrings(crate::text_authoring::StringEdit::Import { .. }) => true,
            EditorCommand::PaintLandTerrain { .. } => true,
            EditorCommand::ApplyLandPaintIntent { .. } => true,
            EditorCommand::ApplyMapStamp { placement, .. } => {
                !placement.resource.cells.iter().any(|cell| cell.tile < 0)
            }
            EditorCommand::ApplySmartTerrain(_) => true,
            EditorCommand::ApplyMagicBrush(_) => true,
            EditorCommand::AcceptTerrainMapping(_) => true,
            EditorCommand::ApplyDungeonFeatures { .. } => true,
            EditorCommand::UpdateLandMapCell {
                identity,
                x,
                y,
                tile,
            } => self
                .snapshot
                .world
                .maps
                .iter()
                .find(|map| map.identity == *identity)
                .and_then(|map| {
                    map.tiles
                        .get(usize::from(*y) * crate::model::CLASSIC_MAP_SIZE + usize::from(*x))
                })
                .is_some_and(|previous| *previous >= 0 && *tile >= 0),
            EditorCommand::PaintLandMapCells { identity, cells } => self
                .snapshot
                .world
                .maps
                .iter()
                .find(|map| map.identity == *identity)
                .is_some_and(|map| {
                    cells.iter().all(|cell| {
                        map.tiles
                            .get(
                                usize::from(cell.y) * crate::model::CLASSIC_MAP_SIZE
                                    + usize::from(cell.x),
                            )
                            .is_some_and(|previous| *previous >= 0 && cell.tile >= 0)
                    })
                }),
            _ => false,
        }
    }
}
