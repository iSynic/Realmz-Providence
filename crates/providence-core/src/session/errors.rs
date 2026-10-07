use super::{ExtraCodeBranchLayout, Revision};
use crate::model::{LevelType, NativeRecordId, StableId};

mod formatting;
#[cfg(test)]
mod tests;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionError {
    RevisionConflict {
        expected: Revision,
        actual: Revision,
    },
    MessageNotFound(StableId),
    InvalidMessageDraft(String),
    DuplicateMessageId(NativeRecordId),
    OptionLabelNotFound(StableId),
    InvalidOptionLabel {
        identity: StableId,
        reason: String,
    },
    InvalidQuestLabel {
        id: u8,
        reason: String,
    },
    QuestLabelNotFound(u8),
    ReferenceNotFound {
        source: StableId,
        field: String,
    },
    ActionReferenceNotFound {
        source: StableId,
        slot: u8,
    },
    SimpleEncounterNotFound(StableId),
    InvalidSimpleEncounter {
        identity: StableId,
        reason: String,
    },
    ComplexEncounterNotFound(StableId),
    InvalidComplexEncounter {
        identity: StableId,
        reason: String,
    },
    InvalidComplexEncounterReference {
        source: StableId,
        field: String,
    },
    RogueEncounterNotFound(StableId),
    InvalidRogueEncounter {
        identity: StableId,
        reason: String,
    },
    InvalidRogueEncounterReference {
        source: StableId,
        field: String,
    },
    TimedEncounterNotFound(StableId),
    InvalidTimedEncounter {
        identity: StableId,
        reason: String,
    },
    InvalidTimedEncounterReference {
        source: StableId,
        field: String,
    },
    ExtraActionPointNotFound(StableId),
    InvalidExtraActionPoint {
        identity: StableId,
        reason: String,
    },
    ActionPointNotFound(StableId),
    InvalidActionPoint {
        identity: StableId,
        reason: String,
    },
    MapNotFound(StableId),
    InvalidMapKind {
        identity: StableId,
        expected: LevelType,
    },
    InvalidMapCatalog {
        level_type: LevelType,
        reason: String,
    },
    InvalidMapPaint {
        identity: StableId,
        reason: String,
    },
    InvalidDungeonPrimitive {
        identity: StableId,
        primitive: crate::codecs::DungeonPrimitive,
        reason: String,
    },
    MapRuntimeNotFound(StableId),
    RandomRectangleNotFound(StableId),
    InvalidRandomRectangle {
        identity: StableId,
        reason: String,
    },
    MapCoordinateOutOfRange {
        x: u8,
        y: u8,
    },
    LandLayoutCoordinateOutOfRange {
        row: u8,
        column: u8,
    },
    InvalidLandLayoutCellCount(usize),
    InvalidLandLayoutTarget(StableId),
    PlayerMapNotFound(StableId),
    InvalidPlayerMap {
        identity: StableId,
        reason: String,
    },
    InvalidScenarioContact(String),
    InvalidScenarioDraft(String),
    DuplicateAssetResource {
        resource_type: String,
        resource_id: i32,
    },
    AssetNotFound(StableId),
    AssetInUse(StableId),
    InvalidItemArtwork(String),
    InvalidMediaPair(String),
    InvalidMonsterAppearance(String),
    InvalidExtraCodeReference {
        source: StableId,
        index: u8,
    },
    InvalidActionSettings {
        source: StableId,
        slot: u8,
        reason: String,
    },
    InvalidExtraCodeBranchMode {
        source: StableId,
        layout: ExtraCodeBranchLayout,
        mode: i16,
    },
    DuplicateClassicRuleId {
        kind: &'static str,
        classic_id: i32,
    },
    ScenarioItemNotFound(u16),
    InvalidScenarioItem {
        record_index: u16,
        reason: String,
    },
    InvalidScenarioItemIdentity {
        record_index: u16,
        classic_id: i16,
    },
    ScenarioSpellNotFound(u16),
    InvalidScenarioSpell {
        record_index: u16,
        reason: String,
    },
    InvalidScenarioSpellIdentity {
        record_index: u16,
        classic_id: i16,
    },
    InvalidClassicImport(String),
    InvalidGlobalMacroTarget(StableId),
    MonsterNotFound(StableId),
    MonsterDescriptionNotFound(NativeRecordId),
    InvalidMonster {
        identity: StableId,
        reason: String,
    },
    InvalidMonsterReference {
        source: StableId,
        field: String,
    },
    InvalidBattleMonsterRewrite(String),
    BattleNotFound(StableId),
    InvalidBattle {
        identity: StableId,
        reason: String,
    },
    InvalidBattleReference {
        source: StableId,
        field: String,
    },
    TreasureNotFound(StableId),
    InvalidTreasure {
        identity: StableId,
        reason: String,
    },
    InvalidTreasureReference {
        source: StableId,
        slot: u8,
    },
    ShopNotFound(StableId),
    InvalidShop {
        identity: StableId,
        reason: String,
    },
    InvalidShopReference {
        source: StableId,
        slot: u16,
    },
    NothingToUndo,
    NothingToRedo,
}

impl std::fmt::Display for SessionError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.fmt_session(formatter)
            .or_else(|| self.fmt_text(formatter))
            .or_else(|| self.fmt_actions(formatter))
            .or_else(|| self.fmt_complex_encounters(formatter))
            .or_else(|| self.fmt_other_encounters(formatter))
            .or_else(|| self.fmt_maps(formatter))
            .or_else(|| self.fmt_world(formatter))
            .or_else(|| self.fmt_assets(formatter))
            .or_else(|| self.fmt_rules(formatter))
            .or_else(|| self.fmt_monsters(formatter))
            .or_else(|| self.fmt_battles(formatter))
            .or_else(|| self.fmt_economy(formatter))
            .or_else(|| self.fmt_extra_codes(formatter))
            .expect("each session error belongs to a formatting family")
    }
}

impl std::error::Error for SessionError {}
