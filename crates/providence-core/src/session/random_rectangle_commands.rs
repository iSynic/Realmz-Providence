use crate::model::RandomRectangle;
use crate::model::StableId;
use crate::session::EditorSession;
use crate::session::errors::SessionError;

impl EditorSession {
    pub(super) fn upsert_map_random_rectangle(
        &mut self,
        map: StableId,
        rectangle: Box<RandomRectangle>,
    ) -> Result<Vec<StableId>, SessionError> {
        validate_random_rectangle_draft(&map, &rectangle)?;
        self.write_map_random_rectangle(map, *rectangle)
    }

    pub(super) fn write_map_random_rectangle(
        &mut self,
        map: StableId,
        rectangle: RandomRectangle,
    ) -> Result<Vec<StableId>, SessionError> {
        let rectangle_identity = rectangle.identity.clone();
        let map_record = self
            .snapshot
            .world
            .maps
            .iter_mut()
            .find(|candidate| candidate.identity == map)
            .ok_or_else(|| SessionError::MapNotFound(map.clone()))?;
        let runtime = map_record
            .runtime
            .as_mut()
            .ok_or_else(|| SessionError::MapRuntimeNotFound(map.clone()))?;
        if let Some(existing) = runtime
            .random_rectangles
            .iter_mut()
            .find(|candidate| candidate.identity == rectangle_identity)
        {
            *existing = rectangle;
        } else {
            runtime.random_rectangles.push(rectangle);
        }
        self.snapshot.normalize();
        Ok(vec![map, rectangle_identity])
    }

    pub(super) fn remove_map_random_rectangle(
        &mut self,
        map: StableId,
        slot: u8,
    ) -> Result<Vec<StableId>, SessionError> {
        if usize::from(slot) >= crate::codecs::RANDOM_RECTANGLE_SLOTS {
            return Err(SessionError::InvalidRandomRectangle {
                identity: StableId(format!("{}:rect:{slot}", map.0)),
                reason: format!(
                    "slot {slot} is outside 0 through {}",
                    crate::codecs::RANDOM_RECTANGLE_SLOTS - 1
                ),
            });
        }
        let identity = StableId(format!("{}:rect:{slot}", map.0));
        let map_record = self
            .snapshot
            .world
            .maps
            .iter_mut()
            .find(|candidate| candidate.identity == map)
            .ok_or_else(|| SessionError::MapNotFound(map.clone()))?;
        let runtime = map_record
            .runtime
            .as_mut()
            .ok_or_else(|| SessionError::MapRuntimeNotFound(map.clone()))?;
        let index = runtime
            .random_rectangles
            .iter()
            .position(|candidate| candidate.identity == identity)
            .ok_or_else(|| SessionError::RandomRectangleNotFound(identity.clone()))?;
        runtime.random_rectangles.remove(index);
        Ok(vec![map, identity])
    }

    pub(super) fn retarget_random_rectangle_door(
        &mut self,
        source: StableId,
        door_slot: u8,
        target_native_id: i16,
    ) -> Result<Vec<StableId>, SessionError> {
        if door_slot >= 3 {
            return Err(SessionError::InvalidRandomRectangle {
                identity: source,
                reason: format!("random door slot {door_slot} is outside 0 through 2"),
            });
        }
        let mut owner = None;
        for map in &mut self.snapshot.world.maps {
            let Some(runtime) = map.runtime.as_mut() else {
                continue;
            };
            let Some(rectangle) = runtime
                .random_rectangles
                .iter_mut()
                .find(|rectangle| rectangle.identity == source)
            else {
                continue;
            };
            rectangle.random_doors[usize::from(door_slot)] = target_native_id;
            owner = Some(map.identity.clone());
            break;
        }
        let owner = owner.ok_or_else(|| SessionError::RandomRectangleNotFound(source.clone()))?;
        Ok(vec![owner, source])
    }

    pub(super) fn retarget_random_rectangle_reference(
        &mut self,
        source: StableId,
        field: String,
        target_native_id: i16,
    ) -> Result<Vec<StableId>, SessionError> {
        if target_native_id < 0 {
            return Err(SessionError::InvalidRandomRectangle {
                identity: source,
                reason: "reference repair target must be a nonnegative native ID".into(),
            });
        }
        let mut owner = None;
        for map in &mut self.snapshot.world.maps {
            let Some(runtime) = map.runtime.as_mut() else {
                continue;
            };
            let Some(rectangle) = runtime
                .random_rectangles
                .iter_mut()
                .find(|rectangle| rectangle.identity == source)
            else {
                continue;
            };
            let preserve_sign = |current: i16| {
                if current < 0 && target_native_id > 0 {
                    -target_native_id
                } else {
                    target_native_id
                }
            };
            match field.as_str() {
                "battleRange[0]" => {
                    rectangle.battle_range[0] = preserve_sign(rectangle.battle_range[0])
                }
                "battleRange[1]" => {
                    rectangle.battle_range[1] = preserve_sign(rectangle.battle_range[1])
                }
                "sound" => rectangle.sound_id = preserve_sign(rectangle.sound_id),
                "text" => rectangle.text_id = preserve_sign(rectangle.text_id),
                _ => {
                    return Err(SessionError::InvalidRandomRectangle {
                        identity: source,
                        reason: format!("{field} is not a repairable random rectangle reference"),
                    });
                }
            }
            owner = Some(map.identity.clone());
            break;
        }
        let owner = owner.ok_or_else(|| SessionError::RandomRectangleNotFound(source.clone()))?;
        Ok(vec![owner, source])
    }

    pub(super) fn retarget_random_rectangle_battle_range(
        &mut self,
        source: StableId,
        low_id: i16,
        high_id: i16,
    ) -> Result<Vec<StableId>, SessionError> {
        if low_id < 0 || high_id < 0 {
            return Err(SessionError::InvalidRandomRectangle {
                identity: source,
                reason: "battle-range repair targets must be nonnegative native IDs".into(),
            });
        }
        let mut owner = None;
        for map in &mut self.snapshot.world.maps {
            let Some(runtime) = map.runtime.as_mut() else {
                continue;
            };
            let Some(rectangle) = runtime
                .random_rectangles
                .iter_mut()
                .find(|rectangle| rectangle.identity == source)
            else {
                continue;
            };
            let preserve_sign = |current: i16, target: i16| {
                if current < 0 && target > 0 {
                    -target
                } else {
                    target
                }
            };
            rectangle.battle_range = [
                preserve_sign(rectangle.battle_range[0], low_id),
                preserve_sign(rectangle.battle_range[1], high_id),
            ];
            owner = Some(map.identity.clone());
            break;
        }
        let owner = owner.ok_or_else(|| SessionError::RandomRectangleNotFound(source.clone()))?;
        Ok(vec![owner, source])
    }
}

pub(super) fn validate_random_rectangle_draft(
    map: &StableId,
    rectangle: &RandomRectangle,
) -> Result<(), SessionError> {
    let expected_prefix = format!("{}:rect:", map.0);
    let slot = rectangle
        .identity
        .0
        .strip_prefix(&expected_prefix)
        .and_then(|value| value.parse::<usize>().ok())
        .ok_or_else(|| SessionError::InvalidRandomRectangle {
            identity: rectangle.identity.clone(),
            reason: format!("identity must name a slot owned by map {}", map.0),
        })?;
    if slot >= crate::codecs::RANDOM_RECTANGLE_SLOTS {
        return Err(SessionError::InvalidRandomRectangle {
            identity: rectangle.identity.clone(),
            reason: format!(
                "slot {slot} is outside 0 through {}",
                crate::codecs::RANDOM_RECTANGLE_SLOTS - 1
            ),
        });
    }
    if rectangle.top > rectangle.bottom || rectangle.left > rectangle.right {
        return Err(SessionError::InvalidRandomRectangle {
            identity: rectangle.identity.clone(),
            reason: "top must not exceed bottom and left must not exceed right".into(),
        });
    }
    if i8::try_from(rectangle.option).is_err() {
        return Err(SessionError::InvalidRandomRectangle {
            identity: rectangle.identity.clone(),
            reason: format!(
                "option {} is outside the signed-byte range",
                rectangle.option
            ),
        });
    }
    Ok(())
}
