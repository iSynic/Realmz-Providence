//! Spell presentation follows source-defined sound/frame offsets and the complete battle atlas.
use super::scenario_resolution::{push_resource, push_resource_if_nonzero};
use super::{
    RebuiltV3MediaRelation, RebuiltV3MediaRequirement, RebuiltV3RuntimeMediaReference,
    RebuiltV3SpellDefinition,
};
use crate::model::ProjectSnapshot;

pub(super) fn append(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
    spells: &[RebuiltV3SpellDefinition],
) {
    for spell in spells {
        if spell.queue_icon != 0 {
            push_resource(
                references,
                snapshot,
                spell.id.clone(),
                "queueIcon.battleAtlas".into(),
                RebuiltV3MediaRelation::BattleAtlas,
                RebuiltV3MediaRequirement::ApplicationRequired,
                "PICT",
                302,
            );
        }
        for (field, value) in [
            ("soundStart+600", spell.sound_start),
            ("soundEnd+600", spell.sound_end),
        ] {
            let resource_id = i32::from(value) + 600;
            push_resource_if_nonzero(
                references,
                snapshot,
                spell.id.clone(),
                field.into(),
                RebuiltV3MediaRelation::SpellSound,
                "snd ",
                resource_id.abs(),
            );
        }
        let start = 11_992 + i32::from(spell.look_start) * 8;
        let end = if spell.look_end == 0 {
            12_032
        } else {
            11_992 + i32::from(spell.look_end) * 8
        };
        for (field, first) in [("lookStart", start), ("lookEnd", end)] {
            for frame in 0..8 {
                push_resource_if_nonzero(
                    references,
                    snapshot,
                    spell.id.clone(),
                    format!("{field}.frames[{frame}]"),
                    RebuiltV3MediaRelation::SpellEffect,
                    "cicn",
                    first + frame,
                );
            }
        }
    }
}
