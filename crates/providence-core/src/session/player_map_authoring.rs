use super::{EditorSession, SessionError};
use crate::codecs::{
    PLAYER_MAP_RECORD_BYTES, decode_player_maps, validate_player_map_name_catalog,
    validate_player_map_record_shape,
};
use crate::model::{PlayerMapNameCatalog, PlayerMapRecord, StableId};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerMapNamesDraft {
    pub available_name: String,
    pub unavailable_name: String,
}

impl EditorSession {
    pub fn validate_player_map_draft(
        &self,
        record: &PlayerMapRecord,
        names: Option<&PlayerMapNamesDraft>,
    ) -> Result<(), SessionError> {
        let existing = self
            .snapshot
            .world
            .player_maps
            .iter()
            .find(|candidate| candidate.identity == record.identity)
            .ok_or_else(|| SessionError::PlayerMapNotFound(record.identity.clone()))?;
        if existing.native_id != record.native_id {
            return Err(invalid(
                &record.identity,
                "native record identity cannot be changed",
            ));
        }
        validate_player_map_record_shape(record)
            .map_err(|error| invalid(&record.identity, &error.to_string()))?;
        if let Some(names) = names {
            draft_names(
                self.snapshot.player_map_names.as_ref(),
                record.native_id.0,
                names.clone(),
            )?;
        }
        Ok(())
    }

    pub(super) fn apply_player_map_draft(
        &mut self,
        mut record: Box<PlayerMapRecord>,
        names: Option<PlayerMapNamesDraft>,
    ) -> Result<Vec<StableId>, SessionError> {
        let index = self
            .snapshot
            .world
            .player_maps
            .iter()
            .position(|candidate| candidate.identity == record.identity)
            .ok_or_else(|| SessionError::PlayerMapNotFound(record.identity.clone()))?;
        self.validate_player_map_draft(&record, names.as_ref())?;
        record.authored = true;
        let catalog = names
            .map(|names| {
                draft_names(
                    self.snapshot.player_map_names.as_ref(),
                    record.native_id.0,
                    names,
                )
            })
            .transpose()?;
        let identity = record.identity.clone();
        // Both payloads are validated before either canonical value changes.
        self.snapshot.world.player_maps[index] = *record;
        if let Some(catalog) = catalog {
            self.snapshot.player_map_names = Some(catalog);
        }
        Ok(vec![identity])
    }

    pub(super) fn create_player_map(&mut self) -> Result<Vec<StableId>, SessionError> {
        let native_id = (0..20)
            .find(|id| {
                !self.snapshot.world.player_maps.iter().any(|row| {
                    row.native_id.0 == *id || row.identity.0 == format!("player-map:{id}")
                })
            })
            .ok_or_else(|| {
                invalid(
                    &self.snapshot.project_id,
                    "All twenty Player Map slots are occupied.",
                )
            })?;
        let mut record = decode_player_maps(&vec![0; PLAYER_MAP_RECORD_BYTES])
            .records
            .remove(0);
        record.identity = StableId(format!("player-map:{native_id}"));
        record.native_id.0 = native_id;
        record.show = 1;
        record.icon_size = 16;
        record.authored = true;
        let identity = record.identity.clone();
        self.snapshot.world.player_maps.push(record);
        self.snapshot
            .world
            .player_maps
            .sort_by_key(|record| record.native_id);
        Ok(vec![identity])
    }
}

fn draft_names(
    existing: Option<&PlayerMapNameCatalog>,
    native_id: u32,
    names: PlayerMapNamesDraft,
) -> Result<PlayerMapNameCatalog, SessionError> {
    let identity = StableId(format!("player-map:{native_id}"));
    if native_id >= 20 {
        return Err(invalid(
            &identity,
            "Menu names are unavailable outside slots 0 through 19.",
        ));
    }
    let mut catalog = existing.cloned().unwrap_or_else(|| PlayerMapNameCatalog {
        source_blob: None,
        available_names: vec![String::new(); 20],
        unavailable_names: vec![String::new(); 20],
    });
    let index = native_id as usize;
    if catalog.available_names.len() <= index {
        catalog.available_names.resize(index + 1, String::new());
    }
    if catalog.unavailable_names.len() <= index {
        catalog.unavailable_names.resize(index + 1, String::new());
    }
    catalog.available_names[index] = names.available_name;
    catalog.unavailable_names[index] = names.unavailable_name;
    validate_player_map_name_catalog(&catalog)
        .map_err(|error| invalid(&identity, &error.to_string()))?;
    Ok(catalog)
}

fn invalid(identity: &StableId, reason: &str) -> SessionError {
    SessionError::InvalidPlayerMap {
        identity: identity.clone(),
        reason: reason.into(),
    }
}
