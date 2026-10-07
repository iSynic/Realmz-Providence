use crate::model::{ClassicAction, StableId};
use crate::session::EditorSession;
use crate::session::errors::SessionError;

impl EditorSession {
    pub(super) fn retarget_action_reference(
        &mut self,
        source: StableId,
        slot: u8,
        target_native_id: i16,
    ) -> Result<Vec<StableId>, SessionError> {
        let action = self
            .snapshot
            .world
            .action_points
            .iter_mut()
            .find(|row| row.identity == source)
            .and_then(|row| row.actions.iter_mut().find(|action| action.slot == slot))
            .or_else(|| {
                self.snapshot
                    .extra_action_points
                    .iter_mut()
                    .find(|row| row.identity == source)
                    .and_then(|row| row.actions.iter_mut().find(|action| action.slot == slot))
            });
        if let Some(action) = action {
            action.target_native_id = target_native_id;
        } else if let Some(encounter) = self
            .snapshot
            .simple_encounters
            .iter_mut()
            .find(|row| row.identity == source)
        {
            action_at_slot(&mut encounter.actions, &source, slot)?.target_native_id =
                target_native_id;
            encounter.authored = true;
        } else {
            let encounter = self
                .snapshot
                .complex_encounters
                .iter_mut()
                .find(|row| row.identity == source)
                .ok_or_else(|| SessionError::ActionReferenceNotFound {
                    source: source.clone(),
                    slot,
                })?;
            action_at_slot(&mut encounter.actions, &source, slot)?.target_native_id =
                target_native_id;
            encounter.authored = true;
        }
        Ok(vec![source])
    }

    pub(super) fn set_action_opcode(
        &mut self,
        source: StableId,
        slot: u8,
        raw_opcode: i16,
    ) -> Result<Vec<StableId>, SessionError> {
        if let Some(row) = self
            .snapshot
            .world
            .action_points
            .iter_mut()
            .find(|row| row.identity == source)
        {
            set_point_opcode(&mut row.actions, &source, slot, raw_opcode)?;
        } else if let Some(row) = self
            .snapshot
            .extra_action_points
            .iter_mut()
            .find(|row| row.identity == source)
        {
            set_point_opcode(&mut row.actions, &source, slot, raw_opcode)?;
        } else {
            self.set_encounter_opcode(&source, slot, raw_opcode)?;
        }
        Ok(vec![source])
    }

    fn set_encounter_opcode(
        &mut self,
        source: &StableId,
        slot: u8,
        raw_opcode: i16,
    ) -> Result<(), SessionError> {
        if let Some(encounter) = self
            .snapshot
            .simple_encounters
            .iter_mut()
            .find(|row| &row.identity == source)
        {
            if !(i8::MIN as i16..=i8::MAX as i16).contains(&raw_opcode) {
                return Err(SessionError::InvalidSimpleEncounter {
                    identity: source.clone(),
                    reason: format!("action opcode {raw_opcode} is outside signed-byte range"),
                });
            }
            action_at_slot(&mut encounter.actions, source, slot)?.raw_opcode = raw_opcode;
            encounter.authored = true;
        } else if let Some(encounter) = self
            .snapshot
            .complex_encounters
            .iter_mut()
            .find(|row| &row.identity == source)
        {
            if !(i8::MIN as i16..=i8::MAX as i16).contains(&raw_opcode) {
                return Err(SessionError::InvalidComplexEncounter {
                    identity: source.clone(),
                    reason: format!("action opcode {raw_opcode} is outside signed-byte range"),
                });
            }
            action_at_slot(&mut encounter.actions, source, slot)?.raw_opcode = raw_opcode;
            encounter.authored = true;
        } else {
            return Err(SessionError::ActionReferenceNotFound {
                source: source.clone(),
                slot,
            });
        }
        Ok(())
    }
}

fn action_at_slot<'a>(
    actions: &'a mut [ClassicAction],
    source: &StableId,
    slot: u8,
) -> Result<&'a mut ClassicAction, SessionError> {
    actions
        .iter_mut()
        .find(|action| action.slot == slot)
        .ok_or_else(|| SessionError::ActionReferenceNotFound {
            source: source.clone(),
            slot,
        })
}

fn set_point_opcode(
    actions: &mut Vec<ClassicAction>,
    source: &StableId,
    slot: u8,
    raw_opcode: i16,
) -> Result<(), SessionError> {
    if slot >= 8 {
        return Err(SessionError::ActionReferenceNotFound {
            source: source.clone(),
            slot,
        });
    }
    // Point records can materialize an empty native slot; encounter slots must already exist.
    if let Some(action) = actions.iter_mut().find(|action| action.slot == slot) {
        action.raw_opcode = raw_opcode;
    } else {
        actions.push(ClassicAction {
            slot,
            raw_opcode,
            target_native_id: 0,
        });
        actions.sort_by_key(|action| action.slot);
    }
    Ok(())
}
