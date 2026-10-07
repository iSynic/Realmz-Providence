use super::*;
use crate::model::{
    ActionPoint, AssetDescriptor, BattleRecord, BlobId, CampaignMetadata, ClassicSourceBlob,
    ComplexEncounter, ExtraActionPoint, ExtraCodeRow, GlobalMacroHook, ItemRuleDefinition,
    LandLayout, LandlookCatalogMetadata, LevelType, MapCoordinate, MapLevel, MapRuntimeMetadata,
    MonsterDescription, MonsterRecord, MonsterSet, NativeRecordId, OptionLabelRecord,
    PlayerMapNameCatalog, PlayerMapRecord, QuestLabel, RandomRectangle, RogueEncounter,
    RuleNameCatalog, ScenarioApplicationContract, ScenarioMessage, ShopRecord, SimpleEncounter,
    SourcedCasteRule, SourcedItemRule, SourcedRaceRule, SourcedScenarioItemRule,
    SourcedSpellDefinition, SpecialLandSolidityCatalog, SpellDefinition, StableId, StartLocation,
    TerrainProfile, TimedEncounter, TreasureRecord,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum EditorCommand {
    RepairImportedContent(crate::import_repair::RepairCommand),
    ClassicRuleSelection(ClassicRuleSelectionCommand),
    UpdateMessageText {
        identity: StableId,
        text: String,
    },
    AuthorStrings(crate::text_authoring::StringEdit),
    CreateMessage {
        native_id: NativeRecordId,
        text: String,
    },
    ImportClassicScenarioBootstrap {
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        startup_native_path: String,
        campaign: Box<CampaignMetadata>,
        start_location: StartLocation,
    },
    ImportClassicOptionLabelSlice {
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        option_labels: Vec<OptionLabelRecord>,
    },
    UpdateOptionLabel {
        label: OptionLabelRecord,
    },
    CreateOptionLabel,
    DuplicateOptionLabel {
        source: StableId,
    },
    UpsertQuestLabel {
        label: QuestLabel,
    },
    DeleteQuestLabel {
        id: u8,
    },
    RetargetMessageReference {
        source: StableId,
        field: String,
        target_native_id: NativeRecordId,
    },
    RetargetActionReference {
        source: StableId,
        slot: u8,
        target_native_id: i16,
    },
    SetActionOpcode {
        source: StableId,
        slot: u8,
        raw_opcode: i16,
    },
    RetargetSimpleEncounterPrompt {
        source: StableId,
        target_native_id: i16,
    },
    UpdateSimpleEncounter {
        encounter: Box<SimpleEncounter>,
    },
    ApplySimpleEncounterDraft {
        draft: Box<SimpleEncounterRecordDraft>,
    },
    CreateSimpleEncounter,
    CopySimpleEncounter {
        source: StableId,
    },
    ImportClassicComplexEncounterSlice {
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        complex_encounters: Vec<ComplexEncounter>,
    },
    UpdateComplexEncounter {
        encounter: Box<ComplexEncounter>,
    },
    ApplyComplexEncounterDraft {
        draft: Box<ComplexEncounterRecordDraft>,
    },
    CreateComplexEncounter,
    CopyComplexEncounter {
        source: StableId,
    },
    RetargetComplexEncounterReference {
        source: StableId,
        field: String,
        target_id: i16,
    },
    ImportClassicRogueEncounterSlice {
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        rogue_encounters: Vec<RogueEncounter>,
    },
    UpdateRogueEncounter {
        encounter: Box<RogueEncounter>,
    },
    ApplyRogueEncounterDraft {
        encounter: Box<RogueEncounter>,
    },
    CreateRogueEncounter,
    CopyRogueEncounter {
        source: StableId,
    },
    RetargetRogueEncounterReference {
        source: StableId,
        field: String,
        target_id: i16,
    },
    ImportClassicTimedEncounterSlice {
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        timed_encounters: Vec<TimedEncounter>,
    },
    UpdateTimedEncounter {
        encounter: Box<TimedEncounter>,
    },
    ApplyTimedEncounterDraft {
        encounter: Box<TimedEncounter>,
    },
    CreateTimedEncounter,
    CopyTimedEncounter {
        source: StableId,
    },
    RetargetTimedEncounterReference {
        source: StableId,
        field: String,
        target_id: i16,
    },
    UpdateExtraActionPoint {
        extra_action_point: Box<ExtraActionPoint>,
    },
    CreateExtraActionPoint {
        native_id: Option<NativeRecordId>,
    },
    DuplicateExtraActionPoint {
        source: StableId,
        native_id: Option<NativeRecordId>,
    },
    DeleteExtraActionPoint {
        source: StableId,
    },
    UpdateActionPoint {
        action_point: Box<ActionPoint>,
    },
    CreateActionPoint {
        map: StableId,
        coordinate: MapCoordinate,
    },
    DuplicateActionPoint {
        source: StableId,
        coordinate: MapCoordinate,
    },
    ClearActionPoint {
        source: StableId,
    },
    ApplyActionPointStep {
        edit: ActionStepEdit,
    },
    ApplyActionPointDraft {
        draft: ActionPointRecordDraft,
    },
    MoveActionPointStep {
        source: StableId,
        from_slot: u8,
        to_slot: u8,
    },
    DuplicateActionPointStep {
        source: StableId,
        from_slot: u8,
        to_slot: u8,
    },
    ClearActionPointStep {
        source: StableId,
        slot: u8,
    },
    ApplyExtraActionPointStep {
        edit: ActionStepEdit,
    },
    ApplyExtraActionPointDraft {
        draft: ExtraActionPointRecordDraft,
    },
    MoveExtraActionPointStep {
        source: StableId,
        from_slot: u8,
        to_slot: u8,
    },
    DuplicateExtraActionPointStep {
        source: StableId,
        from_slot: u8,
        to_slot: u8,
    },
    ClearExtraActionPointStep {
        source: StableId,
        slot: u8,
    },
    CreateMap {
        level_type: LevelType,
    },
    DuplicateMap {
        source: StableId,
    },
    PaintLandMapCells {
        identity: StableId,
        cells: Vec<LandMapCellPaint>,
    },
    PaintLandTerrain {
        identity: StableId,
        paint: crate::map_paint::LandTerrainPaint,
    },
    ApplyLandPaintIntent {
        identity: StableId,
        intent: crate::land_paint_intent::LandPaintIntent,
    },
    ApplySmartTerrain(crate::smart_terrain::Apply),
    ApplyMagicBrush(crate::smart_terrain::staged::Apply),
    AcceptTerrainMapping(crate::terrain_mapping::Acceptance),
    ApplyLandCellBehavior {
        identity: StableId,
        edit: crate::land_cell_behavior::LandCellBehaviorEdit,
    },
    ApplyMapStamp {
        identity: StableId,
        placement: crate::map_stamp::StampPlacement,
    },
    UpdateLandMapCell {
        identity: StableId,
        x: u8,
        y: u8,
        tile: i16,
    },
    UpdateDungeonMapPrimitive {
        identity: StableId,
        x: u8,
        y: u8,
        primitive: crate::codecs::DungeonPrimitive,
        enabled: bool,
    },
    ApplyDungeonFeatures {
        identity: StableId,
        edit: crate::dungeon_features::DungeonFeatureEdit,
    },
    SetLandLayoutCell {
        row: u8,
        column: u8,
        target: Option<StableId>,
    },
    RemoveLandLayout,
    ImportClassicPlayerMapSlice {
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        player_maps: Vec<PlayerMapRecord>,
    },
    UpdatePlayerMap {
        player_map: Box<PlayerMapRecord>,
    },
    ApplyPlayerMapDraft {
        player_map: Box<PlayerMapRecord>,
        names: Option<PlayerMapNamesDraft>,
    },
    CreatePlayerMap,
    ImportClassicPlayerMapNames {
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        catalog: PlayerMapNameCatalog,
    },
    UpdatePlayerMapNames {
        native_id: u8,
        available_name: String,
        unavailable_name: String,
    },
    ApplyScenario {
        edit: super::ScenarioAuthoringEdit,
    },
    SetCampaignMetadata {
        metadata: Box<CampaignMetadata>,
    },
    SetStartLocation {
        location: StartLocation,
    },
    SetMapRuntimeMetadata {
        identity: StableId,
        metadata: Box<MapRuntimeMetadata>,
    },
    ApplyLevelSettings {
        identity: StableId,
        edit: crate::level_settings::LevelSettingsEdit,
    },
    UpsertMapRandomRectangle {
        map: StableId,
        rectangle: Box<RandomRectangle>,
    },
    ApplyRandomRectangleDraft {
        map: StableId,
        rectangle: Box<RandomRectangle>,
    },
    RemoveMapRandomRectangle {
        map: StableId,
        slot: u8,
    },
    RetargetRandomRectangleDoor {
        source: StableId,
        door_slot: u8,
        target_native_id: i16,
    },
    RetargetRandomRectangleReference {
        source: StableId,
        field: String,
        target_native_id: i16,
    },
    RetargetRandomRectangleBattleRange {
        source: StableId,
        low_id: i16,
        high_id: i16,
    },
    UpsertTerrainProfile {
        profile: Box<TerrainProfile>,
    },
    ImportLandlookMapstatsCatalog {
        catalog: Box<LandlookCatalogMetadata>,
        profiles: Vec<TerrainProfile>,
    },
    SetLandlookCatalogBase {
        landlook: i8,
        base_tile: i16,
        base_scale: i16,
    },
    ApplyCustomLandlook {
        landlook: i8,
        catalog: Option<Box<LandlookCatalogMetadata>>,
        profiles: Vec<TerrainProfile>,
        asset: Box<AssetDescriptor>,
        assign_map: Option<StableId>,
        replace: bool,
    },
    SetLandlookRangeSlot {
        landlook: i8,
        slot: u8,
        first_tile: i16,
        last_tile: i16,
    },
    SetSpecialLandSolidityCatalog {
        catalog: Box<SpecialLandSolidityCatalog>,
    },
    UpsertAsset {
        asset: Box<AssetDescriptor>,
    },
    ImportClassicMediaCatalog {
        annex_blob: BlobId,
        source: ClassicSourceBlob,
        assets: Vec<AssetDescriptor>,
    },
    RemoveAsset {
        identity: StableId,
    },
    UpsertMonsterAppearancePair {
        base: Box<AssetDescriptor>,
        facing: Box<AssetDescriptor>,
    },
    UpsertTextResourcePair {
        text: Box<AssetDescriptor>,
        style: Box<AssetDescriptor>,
    },
    RemoveMonsterAppearancePair {
        icon_id: i16,
    },
    UpsertExtraCode {
        row: ExtraCodeRow,
    },
    ApplyActionSettings {
        edit: ActionSettingsEdit,
    },
    RetargetExtraCodeValue {
        source: StableId,
        index: u8,
        target_id: i16,
    },
    RetargetExtraCodeBattleRange {
        source: StableId,
        low_id: i16,
        high_id: i16,
    },
    RetargetExtraCodeBranch {
        source: StableId,
        layout: ExtraCodeBranchLayout,
        mode: i16,
        target_id: i16,
    },
    UpsertRaceRule {
        rule: Box<SourcedRaceRule>,
    },
    ApplyRuleRecordDraft(Box<super::rule_authoring::PreparedRuleCommit>),
    ReplaceRaceRules {
        rules: Vec<SourcedRaceRule>,
    },
    UpsertCasteRule {
        rule: Box<SourcedCasteRule>,
    },
    ReplaceCasteRules {
        rules: Vec<SourcedCasteRule>,
    },
    SetRuleNameCatalog {
        catalog: RuleNameCatalog,
    },
    ReplaceItemRules {
        rules: Vec<SourcedItemRule>,
    },
    ReplaceScenarioItemRules {
        rules: Vec<SourcedScenarioItemRule>,
    },
    ImportStandardSpellCatalog {
        sources: Vec<ClassicSourceBlob>,
        spells: Vec<SourcedSpellDefinition>,
    },
    ImportClassicSpellSlice {
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        spells: Vec<SourcedSpellDefinition>,
    },
    UpdateScenarioSpell {
        record_index: u16,
        definition: Box<SpellDefinition>,
    },
    ApplyScenarioSpellDraft {
        draft: Box<super::SpellRecordDraft>,
    },
    ImportClassicLandSlice {
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        maps: Vec<MapLevel>,
        action_points: Vec<ActionPoint>,
        messages: Vec<ScenarioMessage>,
        simple_encounters: Vec<SimpleEncounter>,
        extra_codes: Vec<ExtraCodeRow>,
        extra_action_points: Vec<ExtraActionPoint>,
        global_macro_hooks: Option<Box<ScenarioApplicationContract>>,
        land_layout: Option<LandLayout>,
    },
    ImportClassicDungeonSlice {
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        maps: Vec<MapLevel>,
        action_points: Vec<ActionPoint>,
    },
    UpdateScenarioItem {
        record_index: u16,
        definition: Box<ItemRuleDefinition>,
    },
    ApplyScenarioItemDraft {
        draft: Box<super::ItemRecordDraft>,
        binary_blob: BlobId,
        text_blob: Option<BlobId>,
    },
    ApplyScenarioItemArtwork {
        record_index: u16,
        asset: Box<AssetDescriptor>,
    },
    ImportClassicMonsterSlice {
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        monster_sets: Vec<MonsterSet>,
        monster_descriptions: Vec<MonsterDescription>,
    },
    UpdateMonster {
        set_id: i16,
        monster: Box<MonsterRecord>,
    },
    ApplyMonsterDraft {
        draft: super::MonsterRecordDraft,
    },
    CommitMonsterOperation {
        operation: super::MonsterOperation,
        review_hash: String,
    },
    CreateMonster {
        set_id: i16,
        native_id: NativeRecordId,
    },
    DuplicateMonster {
        set_id: i16,
        source_id: NativeRecordId,
        target_id: NativeRecordId,
    },
    ClearMonster {
        set_id: i16,
        native_id: NativeRecordId,
    },
    SwitchMonsterRecords {
        set_id: i16,
        first_id: NativeRecordId,
        second_id: NativeRecordId,
    },
    CopyMonsterToAllSets {
        source_set_id: i16,
        native_id: NativeRecordId,
    },
    GenerateMonsterVariants {
        native_id: NativeRecordId,
    },
    ApplyMonsterLibraryTemplate {
        target_id: NativeRecordId,
        template: Box<MonsterRecord>,
        description: String,
        mode: crate::monster_library::MonsterLibraryCopyMode,
        replace: bool,
    },
    PopulateMonsterLibraryTemplates {
        copies: Vec<crate::monster_library::MonsterLibraryScenarioCopy>,
    },
    CommitMonsterLibraryTransfer {
        copies: Vec<crate::monster_library::MonsterLibraryScenarioCopy>,
        review_hash: String,
    },
    UpdateMonsterDescription {
        description: MonsterDescription,
    },
    RetargetMonsterReference {
        source: StableId,
        field: String,
        target_id: i16,
    },
    ImportClassicBattleSlice {
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        battles: Vec<BattleRecord>,
    },
    UpdateBattle {
        battle: Box<BattleRecord>,
    },
    CreateBattle {
        battle: Box<BattleRecord>,
        copy_source: Option<super::BattleCopySource>,
    },
    RewriteBattleMonsterReferences {
        rewrite: BattleMonsterReferenceRewrite,
    },
    RetargetBattleReference {
        source: StableId,
        field: String,
        target_id: i16,
    },
    ImportClassicTreasureSlice {
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        treasures: Vec<TreasureRecord>,
    },
    UpdateTreasure {
        treasure: Box<TreasureRecord>,
    },
    CreateTreasure {
        native_id: NativeRecordId,
    },
    ClearTreasure {
        native_id: NativeRecordId,
    },
    RetargetTreasureItem {
        source: StableId,
        slot: u8,
        target_id: i16,
    },
    ImportClassicShopSlice {
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        shops: Vec<ShopRecord>,
    },
    UpdateShop {
        shop: Box<ShopRecord>,
    },
    CreateShop {
        native_id: NativeRecordId,
    },
    ClearShop {
        native_id: NativeRecordId,
    },
    RetargetShopItem {
        source: StableId,
        slot: u16,
        target_id: i16,
    },
    SetScenarioApplication {
        contract: ScenarioApplicationContract,
    },
    SetGlobalMacroHook {
        hook: GlobalMacroHook,
        target: Option<StableId>,
    },
    Undo,
    Redo,
}
