use serde::{Deserialize, Serialize};

mod classic_battles;
mod classic_castes;
mod classic_complex_encounters;
mod classic_extra_codes;
mod classic_global_macros;
mod classic_item_text;
mod classic_items;
mod classic_land_layout;
mod classic_mace;
mod classic_mapstats;
mod classic_media_catalog;
mod classic_messages;
#[cfg(test)]
mod classic_monster_edit_tests;
mod classic_monsters;
mod classic_option_labels;
mod classic_pict;
mod classic_player_map_names;
mod classic_player_maps;
mod classic_races;
mod classic_random_levels;
mod classic_resources;
mod classic_rogue_encounters;
mod classic_rule_authoring;
mod classic_rule_names;
mod classic_scenario_contact;
mod classic_scenario_icons;
mod classic_scenario_music;
mod classic_scenario_pictures;
mod classic_scenario_security;
mod classic_scenario_sounds;
mod classic_scenario_startup;
mod classic_scenario_support;
mod classic_shops;
mod classic_snd;
mod classic_special_land_solidity;
mod classic_special_land_tiles;
mod classic_spells;
mod classic_text_feedback;
mod classic_text_resources;
mod classic_timed_encounters;
mod classic_treasures;
mod classic_world;
mod owned_byte_diff;
mod runtime_png;
mod runtime_wav;
pub use classic_battles::*;
pub use classic_castes::*;
pub use classic_complex_encounters::*;
pub use classic_extra_codes::*;
pub use classic_global_macros::*;
pub use classic_item_text::{
    ItemTextFeedback, encode_scenario_item_text_resources,
    encode_scenario_item_text_resources_for_draft, inspect_item_text,
};
pub use classic_items::*;
pub use classic_land_layout::*;
pub use classic_mapstats::*;
pub use classic_media_catalog::*;
pub use classic_messages::*;
pub use classic_monsters::*;
pub use classic_option_labels::*;
pub use classic_pict::*;
pub use classic_player_map_names::*;
pub use classic_player_maps::*;
pub use classic_races::*;
pub use classic_random_levels::*;
pub use classic_resources::*;
pub use classic_rogue_encounters::*;
pub use classic_rule_authoring::*;
pub use classic_rule_names::*;
pub use classic_scenario_contact::*;
pub use classic_scenario_icons::*;
pub use classic_scenario_music::*;
pub use classic_scenario_pictures::*;
pub use classic_scenario_security::*;
pub use classic_scenario_sounds::*;
pub use classic_scenario_startup::*;
pub use classic_scenario_support::*;
pub use classic_shops::*;
pub use classic_snd::*;
pub use classic_special_land_solidity::*;
pub use classic_special_land_tiles::*;
pub use classic_spells::*;
pub use classic_text_feedback::*;
pub use classic_text_resources::*;
pub use classic_timed_encounters::*;
pub use classic_treasures::*;
pub use classic_world::*;
pub use owned_byte_diff::*;
pub use runtime_png::*;
pub use runtime_wav::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NativeFileFamily {
    ScenarioMessages,
    OptionLabels,
    LandLayout,
    PlayerMaps,
    PlayerMapNameResources,
    LandMaps,
    LandRandomLevels,
    DungeonMaps,
    DungeonRandomLevels,
    LandActionPoints,
    DungeonActionPoints,
    ExtraActionPoints,
    SimpleEncounters,
    ComplexEncounters,
    RogueEncounters,
    TimedEncounters,
    ExtraCodes,
    GlobalMacroHooks,
    RaceRules,
    CasteRules,
    ItemDefinitions,
    ScenarioItemDefinitions,
    ScenarioItemNames,
    StandardSpellDefinitions,
    ScenarioSpellDefinitions,
    ScenarioSpellNames,
    ScenarioMonsters,
    MonsterVariantRecords,
    MegaMonsterVariantRecords,
    MonsterDescriptions,
    BattleRecords,
    TreasureRecords,
    ShopRecords,
    ScenarioPictureResources,
    ScenarioIconResources,
    SpecialLandTileResources,
    SpecialLandSolidity,
    ScenarioSoundResources,
    ScenarioTextResources,
    ScenarioResourceFork,
    ScenarioContactInfo,
    ScenarioStartup,
    ScenarioSecurityStartup,
    ScenarioSecurityBackup,
    ScenarioRestrictions,
    ScenarioSupport,
    CustomLandlookMetadata,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CompatibilityOverlayPolicy {
    RegenerateEditedRow,
    OverlayOwnedBytes,
    PreserveOnly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnedByteRange {
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodecDescriptor {
    pub family: NativeFileFamily,
    pub native_path: &'static str,
    pub record_bytes: usize,
    pub owned_byte_ranges: &'static [OwnedByteRange],
    pub compatibility_overlay: CompatibilityOverlayPolicy,
}

impl CodecDescriptor {
    pub fn canonical_unowned_append_byte(self, within_record: usize) -> Option<u8> {
        match self.family {
            NativeFileFamily::LandRandomLevels | NativeFileFamily::DungeonRandomLevels
                if within_record == RANDOM_LEVEL_PADDING_OFFSET =>
            {
                Some(0)
            }
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceCodecDescriptor {
    pub family: NativeFileFamily,
    pub native_path: &'static str,
    pub resource_type: [u8; 4],
    pub minimum_resource_id: i16,
    pub maximum_resource_id: i16,
    pub payload_is_fully_owned: bool,
}

pub const SCENARIO_PICTURE_RESOURCE_CODEC: ResourceCodecDescriptor = ResourceCodecDescriptor {
    family: NativeFileFamily::ScenarioPictureResources,
    native_path: "Scenario.rsrc",
    resource_type: *b"PICT",
    minimum_resource_id: SCENARIO_PICTURE_MIN_ID,
    maximum_resource_id: SCENARIO_PICTURE_MAX_ID,
    payload_is_fully_owned: true,
};

pub const SCENARIO_SOUND_RESOURCE_CODEC: ResourceCodecDescriptor = ResourceCodecDescriptor {
    family: NativeFileFamily::ScenarioSoundResources,
    native_path: "Scenario.rsrc",
    resource_type: *b"snd ",
    minimum_resource_id: SCENARIO_SOUND_MIN_ID,
    maximum_resource_id: SCENARIO_SOUND_MAX_ID,
    payload_is_fully_owned: true,
};

pub const SCENARIO_TEXT_RESOURCE_CODEC: ResourceCodecDescriptor = ResourceCodecDescriptor {
    family: NativeFileFamily::ScenarioTextResources,
    native_path: "Scenario.rsrc",
    resource_type: *b"TEXT",
    minimum_resource_id: i16::MIN,
    maximum_resource_id: i16::MAX,
    payload_is_fully_owned: true,
};

pub const SCENARIO_ICON_RESOURCE_CODEC: ResourceCodecDescriptor = ResourceCodecDescriptor {
    family: NativeFileFamily::ScenarioIconResources,
    native_path: "Scenario.rsrc",
    resource_type: *b"cicn",
    minimum_resource_id: SCENARIO_ICON_MIN_ID,
    maximum_resource_id: SCENARIO_ICON_MAX_ID,
    payload_is_fully_owned: true,
};

pub const SPECIAL_LAND_TILE_RESOURCE_CODEC: ResourceCodecDescriptor = ResourceCodecDescriptor {
    family: NativeFileFamily::SpecialLandTileResources,
    native_path: "Scenario.rsrc",
    resource_type: *b"cicn",
    minimum_resource_id: SPECIAL_LAND_TILE_MIN_ID,
    maximum_resource_id: SPECIAL_LAND_TILE_MAX_ID,
    payload_is_fully_owned: true,
};

pub const PLAYER_MAP_NAME_RESOURCE_CODEC: ResourceCodecDescriptor = ResourceCodecDescriptor {
    family: NativeFileFamily::PlayerMapNameResources,
    native_path: "Scenario.rsrc",
    resource_type: *b"STR#",
    minimum_resource_id: PLAYER_MAP_AVAILABLE_NAMES_RESOURCE_ID,
    maximum_resource_id: PLAYER_MAP_UNAVAILABLE_NAMES_RESOURCE_ID,
    payload_is_fully_owned: true,
};

pub const RESOURCE_CODEC_REGISTRY: &[ResourceCodecDescriptor] = &[
    SCENARIO_PICTURE_RESOURCE_CODEC,
    SCENARIO_SOUND_RESOURCE_CODEC,
    SCENARIO_ICON_RESOURCE_CODEC,
    SPECIAL_LAND_TILE_RESOURCE_CODEC,
    PLAYER_MAP_NAME_RESOURCE_CODEC,
    SCENARIO_TEXT_RESOURCE_CODEC,
];

pub const SCENARIO_MESSAGE_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::ScenarioMessages,
    native_path: "Data SD2",
    record_bytes: 256,
    owned_byte_ranges: &[OwnedByteRange { start: 0, end: 256 }],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const OPTION_LABEL_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::OptionLabels,
    native_path: "Data OD",
    record_bytes: OPTION_LABEL_RECORD_BYTES,
    owned_byte_ranges: &[OwnedByteRange {
        start: 0,
        end: OPTION_LABEL_RECORD_BYTES,
    }],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const LAND_LAYOUT_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::LandLayout,
    native_path: "Layout",
    record_bytes: LAND_LAYOUT_BYTES,
    owned_byte_ranges: &[OwnedByteRange {
        start: 0,
        end: LAND_LAYOUT_BYTES,
    }],
    compatibility_overlay: CompatibilityOverlayPolicy::OverlayOwnedBytes,
};

pub const PLAYER_MAP_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::PlayerMaps,
    native_path: "Data MD2",
    record_bytes: PLAYER_MAP_RECORD_BYTES,
    owned_byte_ranges: &[
        OwnedByteRange { start: 0, end: 74 },
        OwnedByteRange {
            start: 76,
            end: PLAYER_MAP_RECORD_BYTES,
        },
    ],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const LAND_MAP_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::LandMaps,
    native_path: "Data LD",
    record_bytes: MAP_LEVEL_BYTES,
    owned_byte_ranges: &[OwnedByteRange {
        start: 0,
        end: MAP_LEVEL_BYTES,
    }],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const DUNGEON_MAP_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::DungeonMaps,
    native_path: "Data DL",
    record_bytes: MAP_LEVEL_BYTES,
    owned_byte_ranges: &[OwnedByteRange {
        start: 0,
        end: MAP_LEVEL_BYTES,
    }],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const LAND_RANDOM_LEVEL_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::LandRandomLevels,
    native_path: "Data RD",
    record_bytes: RANDOM_LEVEL_RECORD_BYTES,
    owned_byte_ranges: &[
        OwnedByteRange {
            start: 0,
            end: RANDOM_LEVEL_PADDING_OFFSET,
        },
        OwnedByteRange {
            start: RANDOM_LEVEL_PADDING_OFFSET + 1,
            end: RANDOM_LEVEL_RECORD_BYTES,
        },
    ],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const DUNGEON_RANDOM_LEVEL_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::DungeonRandomLevels,
    native_path: "Data RDD",
    record_bytes: RANDOM_LEVEL_RECORD_BYTES,
    owned_byte_ranges: &[
        OwnedByteRange {
            start: 0,
            end: RANDOM_LEVEL_PADDING_OFFSET,
        },
        OwnedByteRange {
            start: RANDOM_LEVEL_PADDING_OFFSET + 1,
            end: RANDOM_LEVEL_RECORD_BYTES,
        },
    ],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const LAND_ACTION_POINT_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::LandActionPoints,
    native_path: "Data DD",
    record_bytes: ACTION_POINT_RECORD_BYTES,
    owned_byte_ranges: &[OwnedByteRange {
        start: 0,
        end: ACTION_POINT_RECORD_BYTES,
    }],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const DUNGEON_ACTION_POINT_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::DungeonActionPoints,
    native_path: "Data DDD",
    record_bytes: ACTION_POINT_RECORD_BYTES,
    owned_byte_ranges: &[OwnedByteRange {
        start: 0,
        end: ACTION_POINT_RECORD_BYTES,
    }],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const EXTRA_ACTION_POINT_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::ExtraActionPoints,
    native_path: "Data ED3",
    record_bytes: EXTRA_ACTION_POINT_RECORD_BYTES,
    owned_byte_ranges: &[OwnedByteRange {
        start: 0,
        end: EXTRA_ACTION_POINT_RECORD_BYTES,
    }],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const SIMPLE_ENCOUNTER_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::SimpleEncounters,
    native_path: "Data ED",
    record_bytes: SIMPLE_ENCOUNTER_RECORD_BYTES,
    owned_byte_ranges: &[OwnedByteRange {
        start: 0,
        end: SIMPLE_ENCOUNTER_RECORD_BYTES,
    }],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const COMPLEX_ENCOUNTER_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::ComplexEncounters,
    native_path: "Data ED2",
    record_bytes: COMPLEX_ENCOUNTER_RECORD_BYTES,
    owned_byte_ranges: &[OwnedByteRange {
        start: 0,
        end: COMPLEX_ENCOUNTER_RECORD_BYTES,
    }],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const ROGUE_ENCOUNTER_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::RogueEncounters,
    native_path: "Data TD2",
    record_bytes: ROGUE_ENCOUNTER_RECORD_BYTES,
    owned_byte_ranges: &[OwnedByteRange {
        start: 0,
        end: ROGUE_ENCOUNTER_RECORD_BYTES,
    }],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const TIMED_ENCOUNTER_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::TimedEncounters,
    native_path: "Data TD3",
    record_bytes: TIMED_ENCOUNTER_RECORD_BYTES,
    owned_byte_ranges: &[OwnedByteRange {
        start: 0,
        end: TIMED_ENCOUNTER_OWNED_BYTES,
    }],
    compatibility_overlay: CompatibilityOverlayPolicy::OverlayOwnedBytes,
};

pub const EXTRA_CODE_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::ExtraCodes,
    native_path: "Data EDCD",
    record_bytes: EXTRA_CODE_RECORD_BYTES,
    owned_byte_ranges: &[OwnedByteRange {
        start: 0,
        end: EXTRA_CODE_RECORD_BYTES,
    }],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const GLOBAL_MACRO_HOOK_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::GlobalMacroHooks,
    native_path: "Global",
    record_bytes: GLOBAL_MACRO_HOOK_BYTES,
    owned_byte_ranges: &[
        OwnedByteRange { start: 0, end: 6 },
        OwnedByteRange { start: 8, end: 12 },
    ],
    compatibility_overlay: CompatibilityOverlayPolicy::OverlayOwnedBytes,
};

pub const SCENARIO_STARTUP_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::ScenarioStartup,
    native_path: "<scenario-name>",
    record_bytes: SCENARIO_STARTUP_BYTES,
    owned_byte_ranges: &[
        OwnedByteRange { start: 0, end: 20 },
        OwnedByteRange {
            start: 60,
            end: SCENARIO_STARTUP_BYTES,
        },
    ],
    compatibility_overlay: CompatibilityOverlayPolicy::OverlayOwnedBytes,
};

pub const SCENARIO_CONTACT_INFO_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::ScenarioContactInfo,
    native_path: "Data CI",
    record_bytes: SCENARIO_CONTACT_INFO_BYTES,
    owned_byte_ranges: &[
        OwnedByteRange {
            start: 0,
            end: 1792,
        },
        OwnedByteRange {
            start: 4352,
            end: SCENARIO_CONTACT_INFO_BYTES,
        },
    ],
    compatibility_overlay: CompatibilityOverlayPolicy::OverlayOwnedBytes,
};

pub const SCENARIO_SECURITY_STARTUP_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::ScenarioSecurityStartup,
    native_path: "<scenario-marker>",
    record_bytes: SCENARIO_STARTUP_BYTES,
    owned_byte_ranges: &[OwnedByteRange {
        start: 0,
        end: SCENARIO_STARTUP_BYTES,
    }],
    compatibility_overlay: CompatibilityOverlayPolicy::OverlayOwnedBytes,
};

pub const SCENARIO_SECURITY_BACKUP_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::ScenarioSecurityBackup,
    native_path: "Data CS",
    record_bytes: SCENARIO_STARTUP_BYTES,
    owned_byte_ranges: &[],
    compatibility_overlay: CompatibilityOverlayPolicy::PreserveOnly,
};

pub const SCENARIO_RESTRICTIONS_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::ScenarioRestrictions,
    native_path: "Data RI",
    record_bytes: SCENARIO_RESTRICTIONS_BYTES,
    owned_byte_ranges: &[OwnedByteRange {
        start: 0,
        end: SCENARIO_RESTRICTIONS_BYTES,
    }],
    compatibility_overlay: CompatibilityOverlayPolicy::OverlayOwnedBytes,
};

pub const SCENARIO_SUPPORT_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::ScenarioSupport,
    native_path: "Scenario",
    record_bytes: SCENARIO_SUPPORT_BYTES,
    owned_byte_ranges: &[],
    compatibility_overlay: CompatibilityOverlayPolicy::PreserveOnly,
};

pub const CUSTOM_LANDLOOK_METADATA_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::CustomLandlookMetadata,
    native_path: "Data Custom <1..3> BD",
    record_bytes: MAPSTATS_RECORD_BYTES,
    owned_byte_ranges: &[
        OwnedByteRange { start: 0, end: 18 },
        OwnedByteRange { start: 20, end: 38 },
    ],
    compatibility_overlay: CompatibilityOverlayPolicy::OverlayOwnedBytes,
};

pub const SPECIAL_LAND_SOLIDITY_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::SpecialLandSolidity,
    native_path: "Data Solids",
    record_bytes: SPECIAL_LAND_SOLIDITY_BYTES,
    owned_byte_ranges: &[OwnedByteRange {
        start: 0,
        end: SPECIAL_LAND_SOLIDITY_BYTES,
    }],
    compatibility_overlay: CompatibilityOverlayPolicy::OverlayOwnedBytes,
};

pub const RACE_RULE_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::RaceRules,
    native_path: "Data Race",
    record_bytes: RACE_RECORD_BYTES,
    owned_byte_ranges: &[
        OwnedByteRange { start: 0, end: 96 },
        OwnedByteRange {
            start: 112,
            end: 346,
        },
    ],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const CASTE_RULE_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::CasteRules,
    native_path: "Data Caste",
    record_bytes: CASTE_RECORD_BYTES,
    owned_byte_ranges: &[
        OwnedByteRange { start: 0, end: 240 },
        OwnedByteRange {
            start: 248,
            end: 448,
        },
    ],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const ITEM_DEFINITION_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::ItemDefinitions,
    native_path: "Data ID",
    record_bytes: ITEM_RECORD_BYTES,
    owned_byte_ranges: &[
        OwnedByteRange { start: 0, end: 56 },
        OwnedByteRange {
            start: 70,
            end: ITEM_RECORD_BYTES,
        },
    ],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const SCENARIO_ITEM_DEFINITION_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::ScenarioItemDefinitions,
    native_path: "Data NI",
    record_bytes: ITEM_RECORD_BYTES,
    owned_byte_ranges: &[
        OwnedByteRange { start: 0, end: 56 },
        OwnedByteRange {
            start: 70,
            end: ITEM_RECORD_BYTES,
        },
    ],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const SCENARIO_MONSTER_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::ScenarioMonsters,
    native_path: "Data MD",
    record_bytes: MONSTER_RECORD_BYTES,
    owned_byte_ranges: &[OwnedByteRange {
        start: 0,
        end: MONSTER_RECORD_BYTES,
    }],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const MONSTER_VARIANT_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::MonsterVariantRecords,
    native_path: "Data MD1",
    record_bytes: MONSTER_RECORD_BYTES,
    owned_byte_ranges: &[OwnedByteRange {
        start: 0,
        end: MONSTER_RECORD_BYTES,
    }],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const MEGA_MONSTER_VARIANT_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::MegaMonsterVariantRecords,
    native_path: "Data MD-1",
    record_bytes: MONSTER_RECORD_BYTES,
    owned_byte_ranges: &[OwnedByteRange {
        start: 0,
        end: MONSTER_RECORD_BYTES,
    }],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const MONSTER_DESCRIPTION_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::MonsterDescriptions,
    native_path: "Data DES",
    record_bytes: MONSTER_DESCRIPTION_RECORD_BYTES,
    owned_byte_ranges: &[OwnedByteRange {
        start: 0,
        end: MONSTER_DESCRIPTION_RECORD_BYTES,
    }],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const BATTLE_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::BattleRecords,
    native_path: "Data BD",
    record_bytes: BATTLE_RECORD_BYTES,
    owned_byte_ranges: &[OwnedByteRange {
        start: 0,
        end: BATTLE_RECORD_BYTES,
    }],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const TREASURE_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::TreasureRecords,
    native_path: "Data TD",
    record_bytes: TREASURE_RECORD_BYTES,
    owned_byte_ranges: &[OwnedByteRange {
        start: 0,
        end: TREASURE_RECORD_BYTES,
    }],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const SHOP_CODEC: CodecDescriptor = CodecDescriptor {
    family: NativeFileFamily::ShopRecords,
    native_path: "Data SD",
    record_bytes: SHOP_RECORD_BYTES,
    owned_byte_ranges: &[OwnedByteRange {
        start: 0,
        end: SHOP_RECORD_BYTES,
    }],
    compatibility_overlay: CompatibilityOverlayPolicy::RegenerateEditedRow,
};

pub const CODEC_REGISTRY: &[CodecDescriptor] = &[
    SCENARIO_MESSAGE_CODEC,
    OPTION_LABEL_CODEC,
    LAND_LAYOUT_CODEC,
    PLAYER_MAP_CODEC,
    LAND_MAP_CODEC,
    LAND_RANDOM_LEVEL_CODEC,
    DUNGEON_MAP_CODEC,
    DUNGEON_RANDOM_LEVEL_CODEC,
    LAND_ACTION_POINT_CODEC,
    DUNGEON_ACTION_POINT_CODEC,
    EXTRA_ACTION_POINT_CODEC,
    SIMPLE_ENCOUNTER_CODEC,
    COMPLEX_ENCOUNTER_CODEC,
    ROGUE_ENCOUNTER_CODEC,
    TIMED_ENCOUNTER_CODEC,
    EXTRA_CODE_CODEC,
    GLOBAL_MACRO_HOOK_CODEC,
    SCENARIO_CONTACT_INFO_CODEC,
    SCENARIO_STARTUP_CODEC,
    SCENARIO_SECURITY_STARTUP_CODEC,
    SCENARIO_SECURITY_BACKUP_CODEC,
    SCENARIO_RESTRICTIONS_CODEC,
    SCENARIO_SUPPORT_CODEC,
    CUSTOM_LANDLOOK_METADATA_CODEC,
    SPECIAL_LAND_SOLIDITY_CODEC,
    RACE_RULE_CODEC,
    CASTE_RULE_CODEC,
    ITEM_DEFINITION_CODEC,
    SCENARIO_ITEM_DEFINITION_CODEC,
    STANDARD_SPELL_CODEC,
    SCENARIO_SPELL_CODEC,
    SCENARIO_MONSTER_CODEC,
    MONSTER_VARIANT_CODEC,
    MEGA_MONSTER_VARIANT_CODEC,
    MONSTER_DESCRIPTION_CODEC,
    BATTLE_CODEC,
    TREASURE_CODEC,
    SHOP_CODEC,
];

pub fn descriptor(family: NativeFileFamily) -> &'static CodecDescriptor {
    CODEC_REGISTRY
        .iter()
        .find(|candidate| candidate.family == family)
        .expect("every native family must have one descriptor")
}

pub fn validate_registry() -> Result<(), &'static str> {
    for (index, descriptor) in CODEC_REGISTRY.iter().enumerate() {
        if descriptor.record_bytes == 0 {
            return Err("codec record width must be nonzero");
        }
        if descriptor.owned_byte_ranges.is_empty()
            && descriptor.compatibility_overlay != CompatibilityOverlayPolicy::PreserveOnly
        {
            return Err("codec must declare at least one owned-byte range");
        }
        if !descriptor.owned_byte_ranges.is_empty()
            && descriptor.compatibility_overlay == CompatibilityOverlayPolicy::PreserveOnly
        {
            return Err("preserve-only codecs cannot declare owned-byte ranges");
        }
        for (range_index, range) in descriptor.owned_byte_ranges.iter().enumerate() {
            if range.start >= range.end || range.end > descriptor.record_bytes {
                return Err("owned-byte range must be nonempty and fit the record");
            }
            if range_index > 0 && descriptor.owned_byte_ranges[range_index - 1].end > range.start {
                return Err("owned-byte ranges must be sorted and nonoverlapping");
            }
        }
        if CODEC_REGISTRY[..index].iter().any(|seen| {
            seen.family == descriptor.family || seen.native_path == descriptor.native_path
        }) {
            return Err("codec family and native path must be unique");
        }
    }
    for (index, descriptor) in RESOURCE_CODEC_REGISTRY.iter().enumerate() {
        if descriptor.minimum_resource_id > descriptor.maximum_resource_id {
            return Err("resource codec ID range must be nonempty");
        }
        if !descriptor.payload_is_fully_owned {
            return Err("resource codecs must declare explicit payload ownership");
        }
        if RESOURCE_CODEC_REGISTRY[..index].iter().any(|seen| {
            seen.family == descriptor.family
                || (seen.native_path == descriptor.native_path
                    && seen.resource_type == descriptor.resource_type)
                    && seen.minimum_resource_id <= descriptor.maximum_resource_id
                    && descriptor.minimum_resource_id <= seen.maximum_resource_id
        }) {
            return Err("resource codec families and owned resource ID ranges must be unique");
        }
        if CODEC_REGISTRY
            .iter()
            .any(|seen| seen.family == descriptor.family)
        {
            return Err("fixed-record and resource codec families must be distinct");
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "codecs/message_codec_tests.rs"]
mod tests;
