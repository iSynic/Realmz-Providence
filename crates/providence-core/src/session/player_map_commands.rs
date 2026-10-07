use crate::codecs::PLAYER_MAP_RECORD_BYTES;
use crate::codecs::validate_player_map_name_catalog;
use crate::codecs::validate_player_map_record_shape;
use crate::model::BlobId;
use crate::model::ClassicSourceBlob;
use crate::model::PlayerMapNameCatalog;
use crate::model::PlayerMapRecord;
use crate::model::ProjectOrigin;
use crate::model::StableId;
use crate::session::EditorSession;
use crate::session::errors::SessionError;
use std::collections::BTreeSet;

impl EditorSession {
    pub(super) fn import_classic_player_map_slice(
        &mut self,
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        player_maps: Vec<PlayerMapRecord>,
    ) -> Result<Vec<StableId>, SessionError> {
        validate_classic_player_map_import(&sources, &player_maps)?;
        let identities = std::iter::once(self.snapshot.project_id.clone())
            .chain(
                self.snapshot
                    .world
                    .player_maps
                    .iter()
                    .chain(player_maps.iter())
                    .map(|record| record.identity.clone()),
            )
            .collect::<BTreeSet<_>>();
        self.snapshot.origin = ProjectOrigin::Imported {
            compatibility_annex: annex_blob,
        };
        self.snapshot.classic_sources = sources;
        self.snapshot.world.player_maps = player_maps;
        self.snapshot.normalize();
        Ok(identities.into_iter().collect())
    }

    pub(super) fn update_player_map(
        &mut self,
        mut player_map: Box<PlayerMapRecord>,
    ) -> Result<Vec<StableId>, SessionError> {
        player_map.authored = true;
        validate_player_map_record_shape(&player_map).map_err(|error| {
            SessionError::InvalidPlayerMap {
                identity: player_map.identity.clone(),
                reason: error.to_string(),
            }
        })?;
        let existing = self
            .snapshot
            .world
            .player_maps
            .iter_mut()
            .find(|candidate| candidate.identity == player_map.identity)
            .ok_or_else(|| SessionError::PlayerMapNotFound(player_map.identity.clone()))?;
        if existing.native_id != player_map.native_id {
            return Err(SessionError::InvalidPlayerMap {
                identity: player_map.identity.clone(),
                reason: "native record identity cannot be changed".into(),
            });
        }
        let identity = player_map.identity.clone();
        *existing = *player_map;
        Ok(vec![identity])
    }

    pub(super) fn import_classic_player_map_names(
        &mut self,
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        catalog: PlayerMapNameCatalog,
    ) -> Result<Vec<StableId>, SessionError> {
        validate_classic_player_map_name_import(&sources, &catalog)?;
        self.snapshot.origin = ProjectOrigin::Imported {
            compatibility_annex: annex_blob,
        };
        self.snapshot.classic_sources = sources;
        self.snapshot.player_map_names = Some(catalog);
        Ok((0..20)
            .map(|native_id| StableId(format!("player-map:{native_id}")))
            .chain(std::iter::once(self.snapshot.project_id.clone()))
            .collect())
    }

    pub(super) fn update_player_map_names(
        &mut self,
        native_id: u8,
        available_name: String,
        unavailable_name: String,
    ) -> Result<Vec<StableId>, SessionError> {
        if native_id >= 20 {
            return Err(SessionError::InvalidPlayerMap {
                identity: StableId(format!("player-map:{native_id}")),
                reason: "Classic menu name ID is outside 0 through 19".into(),
            });
        }
        let mut catalog =
            self.snapshot
                .player_map_names
                .clone()
                .unwrap_or_else(|| PlayerMapNameCatalog {
                    source_blob: None,
                    available_names: vec![String::new(); 20],
                    unavailable_names: vec![String::new(); 20],
                });
        let index = usize::from(native_id);
        if catalog.available_names.len() <= index {
            catalog.available_names.resize(index + 1, String::new());
        }
        if catalog.unavailable_names.len() <= index {
            catalog.unavailable_names.resize(index + 1, String::new());
        }
        catalog.available_names[index] = available_name;
        catalog.unavailable_names[index] = unavailable_name;
        validate_player_map_name_catalog(&catalog).map_err(|error| {
            SessionError::InvalidPlayerMap {
                identity: StableId(format!("player-map:{native_id}")),
                reason: error.to_string(),
            }
        })?;
        self.snapshot.player_map_names = Some(catalog);
        Ok(vec![StableId(format!("player-map:{native_id}"))])
    }
}

pub(super) fn validate_classic_player_map_import(
    sources: &[ClassicSourceBlob],
    player_maps: &[PlayerMapRecord],
) -> Result<(), SessionError> {
    let Some(source) = sources
        .iter()
        .find(|source| source.native_path == "Data MD2")
    else {
        return Err(SessionError::InvalidClassicImport(
            "decoded player maps require Data MD2 provenance".into(),
        ));
    };
    let complete_rows = source.byte_length as usize / PLAYER_MAP_RECORD_BYTES;
    if complete_rows != player_maps.len() {
        return Err(SessionError::InvalidClassicImport(
            "Data MD2 complete-row count does not match the decoded player-map count".into(),
        ));
    }
    for (index, player_map) in player_maps.iter().enumerate() {
        validate_player_map_record_shape(player_map)
            .map_err(|error| SessionError::InvalidClassicImport(error.to_string()))?;
        if player_map.native_id.0 != index as u32
            || player_map.identity.0 != format!("player-map:{index}")
            || player_map.authored
        {
            return Err(SessionError::InvalidClassicImport(format!(
                "Data MD2 record {index} does not have canonical imported identity/state"
            )));
        }
    }
    Ok(())
}

pub(super) fn validate_classic_player_map_name_import(
    sources: &[ClassicSourceBlob],
    catalog: &PlayerMapNameCatalog,
) -> Result<(), SessionError> {
    let source = sources
        .iter()
        .find(|source| source.native_path == "Scenario.rsrc")
        .ok_or_else(|| {
            SessionError::InvalidClassicImport(
                "Player Map names require Scenario.rsrc provenance".into(),
            )
        })?;
    if catalog.source_blob.as_ref() != Some(&source.blob) {
        return Err(SessionError::InvalidClassicImport(
            "Player Map name catalog source blob does not match Scenario.rsrc provenance".into(),
        ));
    }
    validate_player_map_name_catalog(catalog)
        .map_err(|error| SessionError::InvalidClassicImport(error.to_string()))
}
