use super::scenario_resolution::push_resource_if_nonzero;
use super::{RebuiltV3ItemDefinition, RebuiltV3MediaRelation, RebuiltV3RuntimeMediaReference};
use crate::model::ProjectSnapshot;

pub(super) fn append(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
    items: &[RebuiltV3ItemDefinition],
) {
    for item in items {
        push_resource_if_nonzero(
            references,
            snapshot,
            item.id.clone(),
            "iconId".into(),
            RebuiltV3MediaRelation::ItemIcon,
            "cicn",
            item.icon_id,
        );
        if let Some(unidentified) = unidentified_icon_id(item.icon_id)
            && unidentified != item.icon_id
        {
            push_resource_if_nonzero(
                references,
                snapshot,
                item.id.clone(),
                "unidentifiedIconId".into(),
                RebuiltV3MediaRelation::ItemIcon,
                "cicn",
                unidentified,
            );
        }
        if let Some(sound_id) = crate::item_sound::resource_id(item.sound_id) {
            push_resource_if_nonzero(
                references,
                snapshot,
                item.id.clone(),
                "soundId+600".into(),
                RebuiltV3MediaRelation::ItemSound,
                "snd ",
                sound_id,
            );
        }
    }
}

fn unidentified_icon_id(icon_id: i32) -> Option<i32> {
    [
        (1, 10, 2),
        (12, 19, 12),
        (20, 34, 20),
        (35, 39, 35),
        (50, 56, 50),
        (82, 85, 82),
        (89, 95, 89),
        (517, 527, 527),
        (545, 548, 546),
        (6100, 6109, 6100),
        (6110, 6121, 6110),
        (6122, 6127, 6122),
        (6137, 6139, 6137),
        (6185, 6187, 6183),
        (6190, 6195, 6190),
        (6196, 6200, 6197),
        (6202, 6206, 6202),
        (6208, 6209, 12009),
        (6162, 6163, 6162),
        (6176, 6177, 6177),
    ]
    .into_iter()
    .find_map(|(first, last, fallback)| (first..=last).contains(&icon_id).then_some(fallback))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{model::StableId, rebuilt::project_rebuilt_v3_selected_scenario_item_catalog};

    #[test]
    fn item_media_selection_skips_silent_items_and_keeps_exact_runtime_sounds() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("item-sound-media".into()));
        snapshot
            .scenario_item_rules
            .push(crate::rebuilt::items::scenario_item_rule_fixture(100));
        let mut items =
            project_rebuilt_v3_selected_scenario_item_catalog(&snapshot, &[900].into()).unwrap();
        for (stored, resource) in [(0, None), (36, Some(636)), (-1236, Some(636))] {
            items[0].sound_id = stored;
            let mut references = Vec::new();
            append(&mut references, &snapshot, &items);
            let sounds = references
                .iter()
                .filter(|row| row.relation == RebuiltV3MediaRelation::ItemSound)
                .collect::<Vec<_>>();
            assert_eq!(sounds.len(), usize::from(resource.is_some()));
            if let Some(resource) = resource {
                assert_eq!(
                    sounds[0].classic_resource.as_ref().unwrap().resource_id,
                    resource
                );
            }
            assert_eq!(items[0].sound_id, stored);
        }
    }
}
