//! Complete fresh scenarios include zero-row native tables and an all-false solidity table.
use super::NativeFileFamily;
pub const CLASSIC_SCENARIO_BASELINE_FILES: &[(&str, NativeFileFamily, usize)] = &[
    ("Data BD", NativeFileFamily::BattleRecords, 0),
    ("Data DD", NativeFileFamily::LandActionPoints, 0),
    ("Data DDD", NativeFileFamily::DungeonActionPoints, 0),
    ("Data DL", NativeFileFamily::DungeonMaps, 0),
    ("Data ED", NativeFileFamily::SimpleEncounters, 0),
    ("Data ED2", NativeFileFamily::ComplexEncounters, 0),
    ("Data ED3", NativeFileFamily::ExtraActionPoints, 0),
    ("Data EDCD", NativeFileFamily::ExtraCodes, 0),
    ("Data LD", NativeFileFamily::LandMaps, 0),
    ("Data MD", NativeFileFamily::ScenarioMonsters, 0),
    ("Data NI", NativeFileFamily::ScenarioItemDefinitions, 0),
    ("Data RD", NativeFileFamily::LandRandomLevels, 0),
    ("Data RDD", NativeFileFamily::DungeonRandomLevels, 0),
    ("Data SD", NativeFileFamily::ShopRecords, 0),
    ("Data SD2", NativeFileFamily::ScenarioMessages, 0),
    (
        "Data Solids",
        NativeFileFamily::SpecialLandSolidity,
        super::SPECIAL_LAND_SOLIDITY_BYTES,
    ),
    ("Data TD", NativeFileFamily::TreasureRecords, 0),
    ("Data TD2", NativeFileFamily::RogueEncounters, 0),
    ("Data TD3", NativeFileFamily::TimedEncounters, 0),
];
