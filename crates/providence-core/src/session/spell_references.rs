//! Typed spell fields expose exact media owners and contextual summon destinations.
use super::reference_targets::classic_media_reference;
use crate::{
    model::{ProjectSnapshot, SourcedSpellDefinition},
    references::{
        ByteProvenance, FieldPath, ReferenceDescriptor, RepairAction, ResolutionState, TargetKind,
    },
};

pub(super) fn references(snapshot: &ProjectSnapshot) -> Vec<ReferenceDescriptor> {
    let mut output = Vec::new();
    for row in snapshot
        .standard_spells
        .iter()
        .chain(&snapshot.scenario_spells)
    {
        append(snapshot, row, &mut output);
    }
    output
}

fn append(
    snapshot: &ProjectSnapshot,
    row: &SourcedSpellDefinition,
    output: &mut Vec<ReferenceDescriptor>,
) {
    let spell = &row.definition;
    if signature(spell).is_none() {
        return;
    }
    let path = if spell.classic_id >= 5000 {
        "Data Spell"
    } else {
        "Data S"
    };
    for (field, value, offset) in [
        ("soundStart", spell.sound_start, 21),
        ("soundEnd", spell.sound_end, 22),
    ] {
        if value != 0 {
            output.push(media(
                snapshot,
                row,
                path,
                field,
                TargetKind::Sound,
                "sound",
                "snd ",
                600 + i32::from(value),
                offset,
            ));
        }
    }
    append_animations(snapshot, row, path, output);
    if spell.queue_icon != 0 {
        output.push(media(
            snapshot,
            row,
            path,
            "queueIcon",
            TargetKind::Picture,
            "tileset",
            "PICT",
            302,
            2,
        ));
    }
    if spell.special == 58 && spell.spell_class != 0 {
        output.push(summon(snapshot, row, path));
    }
}

pub(super) fn signature(spell: &crate::model::SpellDefinition) -> Option<[u8; 6]> {
    if spell.classic_id >= 5000 {
        let mut content = spell.clone();
        content.authored = false;
        if super::spell_authoring::new_scenario_spell(spell.record_index)
            .is_ok_and(|blank| blank == content)
        {
            return None;
        }
    }
    Some([
        spell.sound_start,
        spell.sound_end,
        spell.look_start,
        spell.look_end,
        spell.queue_icon,
        if spell.special == 58 {
            spell.spell_class
        } else {
            0
        },
    ])
}

fn append_animations(
    snapshot: &ProjectSnapshot,
    row: &SourcedSpellDefinition,
    path: &str,
    output: &mut Vec<ReferenceDescriptor>,
) {
    let spell = &row.definition;
    for (field, value, offset) in [
        ("lookStart", spell.look_start, 19),
        ("lookEnd", spell.look_end, 20),
    ] {
        if field == "lookStart" && value == 0 {
            continue;
        }
        let first = if field == "lookEnd" && value == 0 {
            12032
        } else {
            11992 + i32::from(value) * 8
        };
        for frame in 0..8 {
            output.push(media(
                snapshot,
                row,
                path,
                &format!("{field}.frames[{frame}]"),
                TargetKind::Icon,
                "icon",
                "cicn",
                first + frame,
                offset,
            ));
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn media(
    snapshot: &ProjectSnapshot,
    row: &SourcedSpellDefinition,
    path: &str,
    field: &str,
    kind: TargetKind,
    role: &str,
    resource_type: &str,
    id: i32,
    offset: usize,
) -> ReferenceDescriptor {
    let mut reference = classic_media_reference(
        snapshot,
        row.definition.id.clone(),
        field.into(),
        kind,
        role,
        resource_type,
        id,
        path,
        u32::from(row.definition.record_index),
        offset,
    );
    if let Some(bytes) = &mut reference.byte_provenance {
        bytes.byte_end = bytes.byte_start + 1;
    }
    reference
}

fn summon(
    snapshot: &ProjectSnapshot,
    row: &SourcedSpellDefinition,
    path: &str,
) -> ReferenceDescriptor {
    let id = u32::from(row.definition.spell_class);
    let monster = snapshot
        .monster_sets
        .iter()
        .find(|set| set.set_id == 0)
        .and_then(|set| {
            set.monsters
                .iter()
                .find(|monster| monster.native_id.0 == id)
        });
    ReferenceDescriptor {
        source: row.definition.id.clone(),
        field: FieldPath("spellClass".into()),
        target_kind: TargetKind::Monster,
        target_id: monster
            .map(|monster| monster.identity.0.clone())
            .unwrap_or_else(|| id.to_string()),
        required: true,
        stock_fallback: None,
        resolution: if monster.is_some() {
            ResolutionState::Resolved
        } else {
            ResolutionState::Missing
        },
        repair_actions: vec![RepairAction::Retarget, RepairAction::CreateTarget],
        byte_provenance: Some(ByteProvenance {
            native_path: path.into(),
            record_index: u32::from(row.definition.record_index),
            byte_start: 27,
            byte_end: 28,
        }),
    }
}
