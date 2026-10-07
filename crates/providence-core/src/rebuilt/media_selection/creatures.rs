use super::scenario_resolution::{push_resource, push_sound};
use super::{RebuiltV3MediaRelation, RebuiltV3MediaRequirement, RebuiltV3RuntimeMediaReference};
use super::{RebuiltV3MonsterDefinition, RebuiltV3RogueEncounter};
use crate::model::{ProjectSnapshot, StableId};

pub(super) fn append_monsters<'a>(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
    monsters: impl IntoIterator<Item = &'a RebuiltV3MonsterDefinition>,
) {
    for monster in monsters {
        if monster.icon_id > 0 {
            push_resource(
                references,
                snapshot,
                monster.id.clone(),
                "iconId".into(),
                RebuiltV3MediaRelation::MonsterIcon,
                RebuiltV3MediaRequirement::StockFallbackAllowed,
                "cicn",
                i32::from(monster.icon_id),
            );
            push_resource(
                references,
                snapshot,
                monster.id.clone(),
                "facingRightIconId".into(),
                RebuiltV3MediaRelation::MonsterFacing,
                RebuiltV3MediaRequirement::OptionalCompanion,
                "cicn",
                i32::from(monster.icon_id) + 308,
            );
        }
    }
}

pub(super) fn append_rogues(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
    rogue_encounters: &[RebuiltV3RogueEncounter],
) {
    for encounter in rogue_encounters {
        for (field, sounds) in [
            ("successSounds", encounter.success_sounds.as_slice()),
            ("failureSounds", encounter.failure_sounds.as_slice()),
            ("promptSounds", encounter.prompt_sounds.as_slice()),
        ] {
            for (slot, sound_id) in sounds.iter().copied().enumerate() {
                push_sound(
                    references,
                    snapshot,
                    StableId(format!("rogue-encounter:{}", encounter.id)),
                    format!("{field}[{slot}]"),
                    sound_id,
                    RebuiltV3MediaRelation::RogueSound,
                );
            }
        }
    }
}
