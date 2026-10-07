use providence_core::{
    model::{MapLevel, MonsterSet, PlayerMapRecord, SourcedScenarioItemRule, StableId},
    references::ReferenceDescriptor,
};
use serde_json::{Value, json};

pub(super) struct AssetUseSources<'a> {
    pub(super) items: &'a [SourcedScenarioItemRule],
    pub(super) maps: &'a [MapLevel],
    pub(super) player_maps: &'a [PlayerMapRecord],
    pub(super) monster_sets: &'a [MonsterSet],
}

impl AssetUseSources<'_> {
    pub(super) fn project_targets(
        &self,
        used_by: &[ReferenceDescriptor],
        offset: usize,
        limit: usize,
    ) -> Vec<Value> {
        used_by
            .iter()
            .skip(offset)
            .take(limit)
            .map(|reference| {
                let (kind, label) = self.source_label(&reference.source);
                json!({"source": reference.source, "field": reference.field,
            "sourceKind": kind, "label": label, "required": reference.required,
            "resolution": reference.resolution})
            })
            .collect()
    }

    fn source_label(&self, source: &StableId) -> (&'static str, String) {
        if let Some(item) = self.items.iter().find(|item| &item.definition.id == source) {
            return item_label(item);
        }
        if let Some(map) = self.maps.iter().find(|map| &map.identity == source) {
            return ("map", map.name.clone());
        }
        if let Some(map) = self.player_maps.iter().find(|map| &map.identity == source) {
            return ("player-map", format!("Player Map {}", map.native_id.0));
        }
        for set in self.monster_sets {
            if let Some(monster) = set
                .monsters
                .iter()
                .find(|monster| &monster.identity == source)
            {
                return (
                    "monster",
                    format!(
                        "{} · {} · {}",
                        if monster.display_name.trim().is_empty() {
                            "Unnamed monster"
                        } else {
                            &monster.display_name
                        },
                        monster.native_id.0,
                        match set.set_id {
                            0 => "Normal",
                            1 => "Monster",
                            -1 => "Mega",
                            _ => "Unknown set",
                        }
                    ),
                );
            }
        }
        ("record", source.0.clone())
    }
}

fn item_label(item: &SourcedScenarioItemRule) -> (&'static str, String) {
    let name = if item.definition.name.trim().is_empty() {
        &item.definition.unidentified_name
    } else {
        &item.definition.name
    };
    (
        "item",
        format!(
            "Item {} · {}",
            item.definition.classic_id,
            if name.trim().is_empty() {
                "Unnamed item"
            } else {
                name
            }
        ),
    )
}
