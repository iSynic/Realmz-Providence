use super::versions::*;
use crate::model::ProjectSnapshot;

pub(super) fn migrate_script_and_spell_catalogs(
    snapshot: &mut ProjectSnapshot,
    source_version: u32,
) {
    if source_version < EXTRA_ACTION_POINT_CATALOG_SNAPSHOT_FORMAT_VERSION {
        snapshot.extra_action_points.clear();
    }
    if source_version < PRE_SPELL_CATALOG_SNAPSHOT_FORMAT_VERSION {
        snapshot.timed_encounters.clear();
    }
    if source_version < OPTION_LABEL_CATALOG_SNAPSHOT_FORMAT_VERSION {
        snapshot.standard_spells.clear();
    }
    if source_version < NAMED_SPELL_CATALOG_SNAPSHOT_FORMAT_VERSION {
        for spell in &mut snapshot.scenario_spells {
            if spell.definition.name.is_empty() {
                spell.definition.name =
                    crate::codecs::default_scenario_spell_name(spell.definition.record_index);
            }
            spell.text_source_blob = None;
            spell.name_authored = false;
        }
    }
    if source_version < OPTION_LABEL_CATALOG_SNAPSHOT_FORMAT_VERSION {
        snapshot.option_labels.clear();
    }
}

pub(super) fn migrate_encounter_catalogs(snapshot: &mut ProjectSnapshot, source_version: u32) {
    if source_version < SHOP_CATALOG_SNAPSHOT_FORMAT_VERSION {
        snapshot.shops.clear();
    }
    if source_version < TREASURE_CATALOG_SNAPSHOT_FORMAT_VERSION {
        snapshot.treasures.clear();
    }
    if source_version < TIMED_ENCOUNTER_CATALOG_SNAPSHOT_FORMAT_VERSION {
        snapshot.rogue_encounters.clear();
    }
    if source_version < ROGUE_ENCOUNTER_CATALOG_SNAPSHOT_FORMAT_VERSION {
        snapshot.complex_encounters.clear();
    }
    if source_version < BATTLE_CATALOG_SNAPSHOT_FORMAT_VERSION {
        snapshot.monster_sets.clear();
        snapshot.monster_descriptions.clear();
    }
}

pub(super) fn clear_later_snapshot_catalogs(snapshot: &mut ProjectSnapshot, source_version: u32) {
    if source_version < 34 {
        snapshot.script_descriptors.clear();
    }
    if source_version < PRE_SCRIPT_DESCRIPTOR_CATALOG_SNAPSHOT_FORMAT_VERSION {
        snapshot.classic_resource_removals.clear();
    }
}
