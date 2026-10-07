use super::NativeManifest;
use crate::codecs::{
    BattleCodecError, CasteCodecError, ClassicTextResourceError, ClassicWorldCodecError,
    ComplexEncounterCodecError, ExtraCodeCodecError, GlobalMacroCodecError, ItemCodecError,
    LandLayoutCodecError, MapstatsCodecError, MessageCodecError, MonsterCodecError,
    OptionLabelCodecError, OwnedByteDiffReport, PlayerMapCodecError, PlayerMapNameCodecError,
    RandomLevelCodecError, ResourceForkError, RogueEncounterCodecError, ScenarioContactCodecError,
    ScenarioIconCodecError, ScenarioPictureCodecError, ScenarioSoundCodecError,
    ScenarioStartupCodecError, ScenarioSupportCodecError, ShopCodecError,
    SpecialLandSolidityCodecError, SpecialLandTileCodecError, SpellCodecError,
    TimedEncounterCodecError, TreasureCodecError,
};
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Debug)]
pub enum ClassicSliceCompileError {
    Compatibility(Vec<String>),
    World(ClassicWorldCodecError),
    LandLayout(LandLayoutCodecError),
    PlayerMaps(PlayerMapCodecError),
    PlayerMapNames(PlayerMapNameCodecError),
    RandomLevels(RandomLevelCodecError),
    Messages(MessageCodecError),
    OptionLabels(OptionLabelCodecError),
    ExtraCodes(ExtraCodeCodecError),
    GlobalMacros(GlobalMacroCodecError),
    Monsters(MonsterCodecError),
    Battles(BattleCodecError),
    Treasures(TreasureCodecError),
    Shops(ShopCodecError),
    Castes(CasteCodecError),
    Races(crate::codecs::RaceCodecError),
    Items(ItemCodecError),
    Spells(SpellCodecError),
    ComplexEncounters(ComplexEncounterCodecError),
    RogueEncounters(RogueEncounterCodecError),
    TimedEncounters(TimedEncounterCodecError),
    ScenarioPictures(ScenarioPictureCodecError),
    ScenarioSounds(ScenarioSoundCodecError),
    ScenarioMusic(crate::codecs::ScenarioMusicError),
    ScenarioTextResources(ClassicTextResourceError),
    ScenarioIcons(ScenarioIconCodecError),
    SpecialLandSolidity(SpecialLandSolidityCodecError),
    SpecialLandTiles(SpecialLandTileCodecError),
    ScenarioStartup(ScenarioStartupCodecError),
    ScenarioSecurity(crate::codecs::ScenarioSecurityCodecError),
    ScenarioContact(ScenarioContactCodecError),
    ScenarioSupport(ScenarioSupportCodecError),
    CustomLandlooks(MapstatsCodecError),
    ScenarioResources(ResourceForkError),
    InvalidResourceRemoval {
        resource_type: String,
        resource_id: i32,
    },
}

#[derive(Debug)]
pub enum ClassicNoEditCertificationError {
    Compile(ClassicSliceCompileError),
    FileSet {
        missing: Vec<String>,
        unexpected: Vec<String>,
    },
    ByteDifferences(Vec<String>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClassicOwnedEditCertification {
    pub manifest: NativeManifest,
    pub exact_file_count: usize,
    pub changed_files: Vec<OwnedByteDiffReport>,
    pub file_transitions: Vec<ClassicOwnedFileTransition>,
    pub resource_edits: Vec<ClassicOwnedResourceEdit>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassicOwnedResourceEdit {
    pub native_path: String,
    pub resource_keys: Vec<String>,
    pub before_bytes: usize,
    pub after_bytes: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassicOwnedFileTransition {
    pub from_path: Option<String>,
    pub to_path: String,
    pub before_bytes: usize,
    pub after_bytes: usize,
}

#[derive(Debug)]
pub enum ClassicOwnedEditCertificationError {
    Compile(ClassicSliceCompileError),
    FileSet {
        missing: Vec<String>,
        unexpected: Vec<String>,
    },
    UnregisteredChangedFiles(Vec<String>),
    OutsideDeclaredOwnership(Vec<String>),
}

impl std::fmt::Display for ClassicOwnedEditCertificationError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Compile(error) => error.fmt(formatter),
            Self::FileSet {
                missing,
                unexpected,
            } => write!(
                formatter,
                "Classic owned-edit reconstruction changed the source file set; missing [{}], unexpected [{}]",
                missing.join(", "),
                unexpected.join(", ")
            ),
            Self::UnregisteredChangedFiles(paths) => write!(
                formatter,
                "Classic owned-edit reconstruction changed files without a fixed-record ownership descriptor: {}",
                paths.join(", ")
            ),
            Self::OutsideDeclaredOwnership(paths) => write!(
                formatter,
                "Classic owned-edit reconstruction changed bytes outside declared ownership for {}",
                paths.join(", ")
            ),
        }
    }
}

impl std::fmt::Display for ClassicNoEditCertificationError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Compile(error) => error.fmt(formatter),
            Self::FileSet {
                missing,
                unexpected,
            } => write!(
                formatter,
                "Classic no-edit reconstruction changed the source file set; missing [{}], unexpected [{}]",
                missing.join(", "),
                unexpected.join(", ")
            ),
            Self::ByteDifferences(paths) => write!(
                formatter,
                "Classic no-edit reconstruction changed source bytes for {}",
                paths.join(", ")
            ),
        }
    }
}

impl std::fmt::Display for ClassicSliceCompileError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Compatibility(codes) => write!(
                formatter,
                "Classic certification compile is blocked: {}",
                bounded_compatibility_code_summary(codes)
            ),
            Self::World(error) => error.fmt(formatter),
            Self::LandLayout(error) => error.fmt(formatter),
            Self::PlayerMaps(error) => error.fmt(formatter),
            Self::PlayerMapNames(error) => error.fmt(formatter),
            Self::RandomLevels(error) => error.fmt(formatter),
            Self::Messages(error) => error.fmt(formatter),
            Self::OptionLabels(error) => error.fmt(formatter),
            Self::ExtraCodes(error) => error.fmt(formatter),
            Self::GlobalMacros(error) => error.fmt(formatter),
            Self::Monsters(error) => error.fmt(formatter),
            Self::Battles(error) => error.fmt(formatter),
            Self::Treasures(error) => error.fmt(formatter),
            Self::Shops(error) => error.fmt(formatter),
            Self::Castes(error) => error.fmt(formatter),
            Self::Races(error) => error.fmt(formatter),
            Self::Items(error) => error.fmt(formatter),
            Self::Spells(error) => error.fmt(formatter),
            Self::ComplexEncounters(error) => error.fmt(formatter),
            Self::RogueEncounters(error) => error.fmt(formatter),
            Self::TimedEncounters(error) => error.fmt(formatter),
            Self::ScenarioPictures(error) => error.fmt(formatter),
            Self::ScenarioSounds(error) => error.fmt(formatter),
            Self::ScenarioMusic(error) => error.fmt(formatter),
            Self::ScenarioTextResources(error) => error.fmt(formatter),
            Self::ScenarioIcons(error) => error.fmt(formatter),
            Self::SpecialLandSolidity(error) => error.fmt(formatter),
            Self::SpecialLandTiles(error) => error.fmt(formatter),
            Self::ScenarioStartup(error) => error.fmt(formatter),
            Self::ScenarioSecurity(error) => error.fmt(formatter),
            Self::ScenarioContact(error) => error.fmt(formatter),
            Self::ScenarioSupport(error) => error.fmt(formatter),
            Self::CustomLandlooks(error) => error.fmt(formatter),
            Self::ScenarioResources(error) => error.fmt(formatter),
            Self::InvalidResourceRemoval {
                resource_type,
                resource_id,
            } => write!(
                formatter,
                "Classic resource removal {resource_type} {resource_id} does not fit native type/id geometry"
            ),
        }
    }
}

fn bounded_compatibility_code_summary(codes: &[String]) -> String {
    const MAX_CODES: usize = 32;
    let mut groups = BTreeMap::<&str, usize>::new();
    for code in codes {
        *groups.entry(code).or_default() += 1;
    }
    let mut labels = groups
        .iter()
        .take(MAX_CODES)
        .map(|(code, count)| {
            if *count == 1 {
                (*code).to_string()
            } else {
                format!("{code} ({count})")
            }
        })
        .collect::<Vec<_>>();
    if groups.len() > MAX_CODES {
        labels.push(format!("+{} more blocker kinds", groups.len() - MAX_CODES));
    }
    labels.join(", ")
}

impl std::error::Error for ClassicSliceCompileError {}

impl From<ClassicWorldCodecError> for ClassicSliceCompileError {
    fn from(error: ClassicWorldCodecError) -> Self {
        Self::World(error)
    }
}

impl From<LandLayoutCodecError> for ClassicSliceCompileError {
    fn from(error: LandLayoutCodecError) -> Self {
        Self::LandLayout(error)
    }
}

impl From<RandomLevelCodecError> for ClassicSliceCompileError {
    fn from(error: RandomLevelCodecError) -> Self {
        Self::RandomLevels(error)
    }
}

impl From<MessageCodecError> for ClassicSliceCompileError {
    fn from(error: MessageCodecError) -> Self {
        Self::Messages(error)
    }
}

impl From<OptionLabelCodecError> for ClassicSliceCompileError {
    fn from(error: OptionLabelCodecError) -> Self {
        Self::OptionLabels(error)
    }
}

impl From<ExtraCodeCodecError> for ClassicSliceCompileError {
    fn from(error: ExtraCodeCodecError) -> Self {
        Self::ExtraCodes(error)
    }
}

impl From<GlobalMacroCodecError> for ClassicSliceCompileError {
    fn from(error: GlobalMacroCodecError) -> Self {
        Self::GlobalMacros(error)
    }
}

impl From<MonsterCodecError> for ClassicSliceCompileError {
    fn from(error: MonsterCodecError) -> Self {
        Self::Monsters(error)
    }
}

impl From<BattleCodecError> for ClassicSliceCompileError {
    fn from(error: BattleCodecError) -> Self {
        Self::Battles(error)
    }
}

impl From<TreasureCodecError> for ClassicSliceCompileError {
    fn from(error: TreasureCodecError) -> Self {
        Self::Treasures(error)
    }
}

impl From<ShopCodecError> for ClassicSliceCompileError {
    fn from(error: ShopCodecError) -> Self {
        Self::Shops(error)
    }
}

impl From<CasteCodecError> for ClassicSliceCompileError {
    fn from(error: CasteCodecError) -> Self {
        Self::Castes(error)
    }
}

impl From<ItemCodecError> for ClassicSliceCompileError {
    fn from(error: ItemCodecError) -> Self {
        Self::Items(error)
    }
}

impl From<SpellCodecError> for ClassicSliceCompileError {
    fn from(error: SpellCodecError) -> Self {
        Self::Spells(error)
    }
}

impl From<ComplexEncounterCodecError> for ClassicSliceCompileError {
    fn from(error: ComplexEncounterCodecError) -> Self {
        Self::ComplexEncounters(error)
    }
}

impl From<RogueEncounterCodecError> for ClassicSliceCompileError {
    fn from(error: RogueEncounterCodecError) -> Self {
        Self::RogueEncounters(error)
    }
}

impl From<TimedEncounterCodecError> for ClassicSliceCompileError {
    fn from(error: TimedEncounterCodecError) -> Self {
        Self::TimedEncounters(error)
    }
}

impl From<ScenarioPictureCodecError> for ClassicSliceCompileError {
    fn from(error: ScenarioPictureCodecError) -> Self {
        Self::ScenarioPictures(error)
    }
}

impl From<ScenarioSoundCodecError> for ClassicSliceCompileError {
    fn from(error: ScenarioSoundCodecError) -> Self {
        Self::ScenarioSounds(error)
    }
}

impl From<ClassicTextResourceError> for ClassicSliceCompileError {
    fn from(error: ClassicTextResourceError) -> Self {
        Self::ScenarioTextResources(error)
    }
}

impl From<ScenarioIconCodecError> for ClassicSliceCompileError {
    fn from(error: ScenarioIconCodecError) -> Self {
        Self::ScenarioIcons(error)
    }
}

impl From<PlayerMapCodecError> for ClassicSliceCompileError {
    fn from(error: PlayerMapCodecError) -> Self {
        Self::PlayerMaps(error)
    }
}

impl From<PlayerMapNameCodecError> for ClassicSliceCompileError {
    fn from(error: PlayerMapNameCodecError) -> Self {
        Self::PlayerMapNames(error)
    }
}

impl From<SpecialLandSolidityCodecError> for ClassicSliceCompileError {
    fn from(error: SpecialLandSolidityCodecError) -> Self {
        Self::SpecialLandSolidity(error)
    }
}

impl From<ScenarioStartupCodecError> for ClassicSliceCompileError {
    fn from(error: ScenarioStartupCodecError) -> Self {
        Self::ScenarioStartup(error)
    }
}

impl From<ScenarioContactCodecError> for ClassicSliceCompileError {
    fn from(error: ScenarioContactCodecError) -> Self {
        Self::ScenarioContact(error)
    }
}

impl From<ScenarioSupportCodecError> for ClassicSliceCompileError {
    fn from(error: ScenarioSupportCodecError) -> Self {
        Self::ScenarioSupport(error)
    }
}

impl From<MapstatsCodecError> for ClassicSliceCompileError {
    fn from(error: MapstatsCodecError) -> Self {
        Self::CustomLandlooks(error)
    }
}
