use providence_core::model::{ProjectSnapshot, TimedEncounterLocationKind};
use serde_json::{Value, json};

pub(crate) fn warnings(snapshot: &ProjectSnapshot) -> Vec<Value> {
    snapshot.timed_encounters.iter().filter(|row| {
        row.location_kind != TimedEncounterLocationKind::Any
            && (row.required_x >= 0) != (row.required_y >= 0)
    }).take(128).map(|row| json!({
        "entity": row.identity,
        "field": "requiredX,requiredY",
        "message": format!("Timed Encounter {} uses one exact coordinate axis. Rebuilt checks X and Y independently; Classic's Y check is guarded by X. The exported values are preserved.", row.native_id.0),
    })).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use providence_core::codecs::decode_timed_encounters;
    use providence_core::model::StableId;

    #[test]
    fn classic_warning_names_only_specific_location_single_axis_rows_without_rewriting() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("timed-warning".into()));
        let mut row = decode_timed_encounters(&[0; 40]).records.remove(0);
        row.location_kind = TimedEncounterLocationKind::Land;
        row.required_x = 0;
        row.required_y = -1;
        snapshot.timed_encounters.push(row);
        let before = snapshot.clone();
        assert_eq!(warnings(&snapshot)[0]["entity"], "timed-encounter:0");
        assert_eq!(snapshot, before);
        snapshot.timed_encounters[0].location_kind = TimedEncounterLocationKind::Any;
        assert!(warnings(&snapshot).is_empty());
        snapshot.timed_encounters[0].location_kind = TimedEncounterLocationKind::Dungeon;
        snapshot.timed_encounters[0].required_y = 2;
        assert!(warnings(&snapshot).is_empty());
    }
}
