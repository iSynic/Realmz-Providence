use super::{RebuiltV3RuntimeMessageReference, references::add_reference};
use crate::model::ProjectSnapshot;
use std::collections::BTreeSet;

pub(super) fn collect(
    snapshot: &ProjectSnapshot,
    references: &mut BTreeSet<RebuiltV3RuntimeMessageReference>,
) {
    for map in &snapshot.world.maps {
        if let Some(runtime) = &map.runtime {
            for rectangle in &runtime.random_rectangles {
                add_reference(
                    references,
                    &rectangle.identity,
                    None,
                    "textId".into(),
                    rectangle.text_id,
                    true,
                );
            }
        }
    }
}
