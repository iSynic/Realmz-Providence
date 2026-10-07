use super::RebuiltV3ScenarioDocument;
use super::scenario_resolution::push_resource;
use super::{RebuiltV3MediaRelation, RebuiltV3MediaRequirement, RebuiltV3RuntimeMediaReference};
use crate::model::ProjectSnapshot;
use crate::{codecs::player_map_record_has_semantics, model::PlayerMapRecord};
use std::collections::BTreeSet;

pub(super) fn append(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
    scenario: &RebuiltV3ScenarioDocument,
) {
    let reachable_player_map_ids = scenario
        .programs
        .iter()
        .flat_map(|program| &program.instructions)
        .filter(|instruction| instruction.opcode == 29)
        .map(|instruction| u32::from(instruction.id.unsigned_abs()))
        .collect::<BTreeSet<_>>();
    for record in snapshot.world.player_maps.iter().filter(|record| {
        reachable_player_map_ids.contains(&record.native_id.0)
            && player_map_record_has_semantics(record)
    }) {
        if record.show < 0 {
            append_scrolling_text(references, snapshot, record);
        } else {
            append_graphical_map(references, snapshot, record);
        }
    }
}

fn append_scrolling_text(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
    record: &PlayerMapRecord,
) {
    push_resource(
        references,
        snapshot,
        record.identity.clone(),
        "scrollingText".into(),
        RebuiltV3MediaRelation::PlayerMap,
        RebuiltV3MediaRequirement::PackageRequired,
        "TEXT",
        i32::from(record.show),
    );
    push_resource(
        references,
        snapshot,
        record.identity.clone(),
        "scrollingTextStyle".into(),
        RebuiltV3MediaRelation::PlayerMap,
        RebuiltV3MediaRequirement::OptionalCompanion,
        "styl",
        i32::from(record.show),
    );
}

fn append_graphical_map(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
    record: &PlayerMapRecord,
) {
    push_resource(
        references,
        snapshot,
        record.identity.clone(),
        "partyMarker".into(),
        RebuiltV3MediaRelation::PlayerMap,
        RebuiltV3MediaRequirement::OptionalCompanion,
        "cicn",
        138,
    );
    if record.picture_id != 0 {
        push_resource(
            references,
            snapshot,
            record.identity.clone(),
            "picture".into(),
            RebuiltV3MediaRelation::PlayerMap,
            RebuiltV3MediaRequirement::PackageRequired,
            "PICT",
            i32::from(record.picture_id),
        );
    } else {
        for (slot, marker) in record.markers.iter().enumerate() {
            if marker.icon_id != 0 {
                push_resource(
                    references,
                    snapshot,
                    record.identity.clone(),
                    format!("markers[{slot}].icon"),
                    RebuiltV3MediaRelation::PlayerMap,
                    RebuiltV3MediaRequirement::OptionalCompanion,
                    "cicn",
                    i32::from(marker.icon_id),
                );
            }
        }
    }
}
