use super::{EditorSession, errors::SessionError};
use crate::model::{
    NativeRecordId, RogueEncounter, StableId, TimedEncounter, TimedEncounterLocationKind,
};

impl EditorSession {
    pub(super) fn create_rogue_encounter(
        &mut self,
        source: Option<StableId>,
    ) -> Result<Vec<StableId>, SessionError> {
        let id = (0..=127)
            .find(|id| {
                !self
                    .snapshot
                    .rogue_encounters
                    .iter()
                    .any(|r| r.native_id.0 == *id)
            })
            .ok_or_else(|| {
                rogue_error(
                    "rogue-encounter:new",
                    "All 128 Rebuilt-compatible Rogue Encounter IDs are in use. Imported higher IDs are preserved.",
                )
            })?;
        let mut row = if let Some(source) = source {
            self.snapshot
                .rogue_encounters
                .iter()
                .find(|r| r.identity == source)
                .cloned()
                .ok_or(SessionError::RogueEncounterNotFound(source))?
        } else {
            RogueEncounter {
                identity: StableId(String::new()),
                native_id: NativeRecordId(id),
                type_flags: [false; 10],
                modifiers: [0; 8],
                success_codes: [0; 8],
                failure_codes: [0; 8],
                success_text: [0; 8],
                failure_text: [0; 8],
                success_sounds: [0; 8],
                failure_sounds: [0; 8],
                spell: 0,
                low_damage: 0,
                high_damage: 0,
                tumblers: 0,
                prompts: [0; 3],
                prompt_sounds: [0; 3],
                authored: true,
            }
        };
        row.identity = StableId(format!("rogue-encounter:{id}"));
        row.native_id = NativeRecordId(id);
        row.authored = true;
        let identity = row.identity.clone();
        self.snapshot.rogue_encounters.push(row);
        self.snapshot.rogue_encounters.sort_by_key(|r| r.native_id);
        Ok(vec![identity])
    }

    pub(super) fn create_timed_encounter(
        &mut self,
        source: Option<StableId>,
    ) -> Result<Vec<StableId>, SessionError> {
        let id = (0..=150)
            .find(|id| {
                !self
                    .snapshot
                    .timed_encounters
                    .iter()
                    .any(|r| r.native_id.0 == *id)
            })
            .ok_or_else(|| {
                timed_error(
                    "timed-encounter:new",
                    "All 151 Timed Encounter IDs are in use.",
                )
            })?;
        let mut row = if let Some(source) = source {
            self.snapshot
                .timed_encounters
                .iter()
                .find(|r| r.identity == source)
                .cloned()
                .ok_or(SessionError::TimedEncounterNotFound(source))?
        } else {
            TimedEncounter {
                identity: StableId(String::new()),
                native_id: NativeRecordId(id),
                day: -1,
                increment: 0,
                percent: 0,
                door: 0,
                required_level: -1,
                required_random_rect: -1,
                required_x: -1,
                required_y: -1,
                required_item: -1,
                required_quest: -1,
                location_kind: TimedEncounterLocationKind::Any,
                authored: true,
            }
        };
        row.identity = StableId(format!("timed-encounter:{id}"));
        row.native_id = NativeRecordId(id);
        row.authored = true;
        self.validate_timed_activation(&row)?;
        let identity = row.identity.clone();
        self.snapshot.timed_encounters.push(row);
        self.snapshot.timed_encounters.sort_by_key(|r| r.native_id);
        Ok(vec![identity])
    }

    pub(super) fn apply_rogue_draft(
        &mut self,
        row: Box<RogueEncounter>,
    ) -> Result<Vec<StableId>, SessionError> {
        let old = self
            .snapshot
            .rogue_encounters
            .iter()
            .find(|r| r.identity == row.identity)
            .ok_or_else(|| SessionError::RogueEncounterNotFound(row.identity.clone()))?;
        for (values, baseline, field) in [
            (&row.success_codes, &old.success_codes, "successCodes"),
            (&row.failure_codes, &old.failure_codes, "failureCodes"),
        ] {
            for (index, (&value, &previous)) in values.iter().zip(baseline).enumerate() {
                if value != previous && !(0..=4).contains(&value) {
                    return Err(rogue_error(
                        &row.identity.0,
                        &format!("{field}[{index}] must be None or result 1–4."),
                    ));
                }
            }
        }
        if (row.low_damage != old.low_damage || row.high_damage != old.high_damage)
            && (row.low_damage < 0 || row.high_damage < row.low_damage)
        {
            return Err(rogue_error(
                &row.identity.0,
                "Trap damage must be nonnegative and its upper bound must not be below its lower bound.",
            ));
        }
        self.validate_changed_rogue_targets(&row, old)?;
        self.update_rogue_encounter(row)
    }

    pub(super) fn apply_timed_draft(
        &mut self,
        row: Box<TimedEncounter>,
    ) -> Result<Vec<StableId>, SessionError> {
        let old = self
            .snapshot
            .timed_encounters
            .iter()
            .find(|r| r.identity == row.identity)
            .ok_or_else(|| SessionError::TimedEncounterNotFound(row.identity.clone()))?;
        if row.percent != old.percent && !(0..=100).contains(&row.percent) {
            return Err(timed_error(
                &row.identity.0,
                "Chance must be between 0% and 100%.",
            ));
        }
        if row.door != old.door
            && !self
                .snapshot
                .extra_action_points
                .iter()
                .any(|r| i32::from(row.door) == r.native_id.0 as i32)
        {
            return Err(timed_error(
                &row.identity.0,
                "The selected Extra Action Point does not exist. Choose an existing program.",
            ));
        }
        if row.location_kind != TimedEncounterLocationKind::Any
            && (row.location_kind != old.location_kind || row.required_level != old.required_level)
            && row.required_level < 0
        {
            return Err(timed_error(
                &row.identity.0,
                "Land and Dungeon require an exact nonnegative level.",
            ));
        }
        if row.day != old.day {
            self.validate_timed_activation(&row)?;
        }
        self.validate_changed_timed_position(&row, old)?;
        self.update_timed_encounter(row)
    }

    fn validate_changed_rogue_targets(
        &self,
        row: &RogueEncounter,
        old: &RogueEncounter,
    ) -> Result<(), SessionError> {
        for (values, baseline) in [
            (&row.success_text, &old.success_text),
            (&row.failure_text, &old.failure_text),
        ] {
            for (&value, &previous) in values.iter().zip(baseline) {
                if value != previous
                    && value != 0
                    && !self
                        .snapshot
                        .messages
                        .iter()
                        .any(|r| r.native_id.0 == i32::from(value).unsigned_abs())
                {
                    return Err(rogue_error(
                        &row.identity.0,
                        "The selected feedback string does not exist. Choose or create a scenario string.",
                    ));
                }
            }
        }
        if row.prompts[0] != old.prompts[0]
            && row.prompts[0] != 0
            && !self
                .snapshot
                .messages
                .iter()
                .any(|r| r.native_id.0 == i32::from(row.prompts[0]).unsigned_abs())
        {
            return Err(rogue_error(
                &row.identity.0,
                "The selected trap prompt does not exist. Choose or create a scenario string.",
            ));
        }
        self.validate_changed_rogue_magic(row, old)
    }

    fn validate_changed_rogue_magic(
        &self,
        row: &RogueEncounter,
        old: &RogueEncounter,
    ) -> Result<(), SessionError> {
        if row.spell != old.spell
            && row.spell != 0
            && crate::action_authoring::target_preview(
                &self.snapshot,
                crate::action_authoring::ActionTargetKind::Spell,
                row.spell,
                &Default::default(),
            )
            .is_none()
        {
            return Err(rogue_error(
                &row.identity.0,
                "Choose an existing trap spell.",
            ));
        }
        for slot in [1, 2] {
            if row.prompt_sounds[slot] != old.prompt_sounds[slot] && row.prompt_sounds[slot] < 0 {
                return Err(rogue_error(
                    &row.identity.0,
                    "Magic success per level must be nonnegative.",
                ));
            }
        }
        Ok(())
    }

    fn validate_timed_activation(&self, row: &TimedEncounter) -> Result<(), SessionError> {
        if row.day <= 0 {
            return Ok(());
        }
        let mut candidate = self.snapshot.clone();
        candidate
            .timed_encounters
            .retain(|r| r.identity != row.identity);
        candidate.timed_encounters.push(row.clone());
        if !crate::rebuilt::runtime_timed_encounter_ids(&candidate).contains(&row.native_id.0) {
            let blocker = candidate
                .timed_encounters
                .iter()
                .filter(|r| r.native_id < row.native_id && r.day == 0)
                .min_by_key(|r| r.native_id)
                .map(|r| r.native_id.0);
            return Err(timed_error(
                &row.identity.0,
                &format!(
                    "Timed Encounter {} is outside the runtime schedule{}; set the earlier day-zero row to dormant day -1 before activating this encounter.",
                    row.native_id.0,
                    blocker
                        .map(|id| format!(" after day-zero Encounter {id}"))
                        .unwrap_or_default()
                ),
            ));
        }
        Ok(())
    }

    fn validate_changed_timed_position(
        &self,
        row: &TimedEncounter,
        old: &TimedEncounter,
    ) -> Result<(), SessionError> {
        if row.location_kind == TimedEncounterLocationKind::Any {
            return Ok(());
        }
        let changed =
            row.location_kind != old.location_kind || row.required_level != old.required_level;
        let level_type = if row.location_kind == TimedEncounterLocationKind::Land {
            crate::model::LevelType::Land
        } else {
            crate::model::LevelType::Dungeon
        };
        let map = self.snapshot.world.maps.iter().find(|m| {
            m.level_type == level_type && i32::from(row.required_level) == m.native_index as i32
        });
        if changed && map.is_none() {
            return Err(timed_error(
                &row.identity.0,
                "Choose an existing exact Land or Dungeon level.",
            ));
        }
        for (value, prior) in [
            (row.required_x, old.required_x),
            (row.required_y, old.required_y),
        ] {
            if value != prior && !(-1..=89).contains(&value) {
                return Err(timed_error(
                    &row.identity.0,
                    "Each map axis must be -1 (Any) or a coordinate from 0 through 89.",
                ));
            }
        }
        if (changed || row.required_random_rect != old.required_random_rect)
            && row.required_random_rect >= 0
        {
            let exists = map.and_then(|m| m.runtime.as_ref()).is_some_and(|r| {
                r.random_rectangles.iter().any(|rect| {
                    rect.identity
                        .0
                        .ends_with(&format!(":rect:{}", row.required_random_rect))
                })
            });
            if !exists {
                return Err(timed_error(
                    &row.identity.0,
                    "Choose a random rectangle belonging to the selected exact map, or clear it.",
                ));
            }
        }
        Ok(())
    }
}

fn rogue_error(identity: &str, reason: &str) -> SessionError {
    SessionError::InvalidRogueEncounter {
        identity: StableId(identity.into()),
        reason: reason.into(),
    }
}
fn timed_error(identity: &str, reason: &str) -> SessionError {
    SessionError::InvalidTimedEncounter {
        identity: StableId(identity.into()),
        reason: reason.into(),
    }
}
