use crate::{
    codecs::{DungeonPrimitive, DungeonPrimitiveWriterStatus, apply_dungeon_primitive},
    dungeon_features::DungeonFeatureChange,
};
use serde::Serialize;
use std::collections::BTreeSet;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceCellPreview {
    pub tile: i16,
    pub features: Vec<DungeonFeatureChange>,
}

pub fn preview(tile: i16, changes: &[DungeonFeatureChange]) -> Result<ResourceCellPreview, String> {
    if tile as u16 & 0x9060 != 0 {
        return Err("A saved stamp cell cannot own AP, Note or preserved bits.".into());
    }
    if changes.len() > 12 {
        return Err("A cell preview supports at most twelve feature changes.".into());
    }
    let mut seen = BTreeSet::new();
    let mut edited = tile;
    for change in changes {
        if change.primitive.writer_status() != DungeonPrimitiveWriterStatus::WriterSafePrimitive
            || !seen.insert(change.primitive.mask())
        {
            return Err("Only distinct writable Dungeon features may be edited.".into());
        }
        edited = apply_dungeon_primitive(edited, change.primitive, change.enabled)
            .map_err(|error| error.to_string())?;
    }
    Ok(ResourceCellPreview {
        tile: edited,
        features: DungeonPrimitive::ALL
            .into_iter()
            .filter(|primitive| {
                primitive.writer_status() == DungeonPrimitiveWriterStatus::WriterSafePrimitive
            })
            .map(|primitive| DungeonFeatureChange {
                enabled: edited as u16 & primitive.mask() != 0,
                primitive,
            })
            .collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn local_cell_edits_share_the_feature_writer_and_reject_managed_ownership() {
        let edited = preview(
            0x101,
            &[DungeonFeatureChange {
                primitive: DungeonPrimitive::Wall,
                enabled: false,
            }],
        )
        .unwrap();
        assert_eq!(edited.features.len(), 12);
        assert_eq!(
            edited.tile,
            apply_dungeon_primitive(0x101, DungeonPrimitive::Wall, false).unwrap()
        );
        assert!(preview(0x20, &[]).is_err());
        let duplicate = DungeonFeatureChange {
            primitive: DungeonPrimitive::Wall,
            enabled: true,
        };
        assert!(preview(0, &[duplicate.clone(), duplicate]).is_err());
    }
}
