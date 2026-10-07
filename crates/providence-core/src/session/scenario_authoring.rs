use super::{EditorSession, SessionError};
use crate::codecs::{encode_scenario_startup_as, validate_security_segments};
use crate::model::{
    CampaignMetadata, CampaignRestrictions, LevelType, ScenarioSecurityAuthoring,
    ScenarioStartupAuthoring, StableId, StartLocation,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioStartupDraft {
    pub name: String,
    pub marker_filename: String,
    pub recommended_party_levels: u32,
    pub maximum_party_levels: u32,
    pub creator_user_check: String,
    pub start_location: StartLocation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioContactDraft {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub date: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub web: String,
    #[serde(default)]
    pub fee: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "section", rename_all = "camelCase")]
pub enum ScenarioAuthoringEdit {
    Startup {
        draft: ScenarioStartupDraft,
    },
    Restrictions {
        restrictions: CampaignRestrictions,
    },
    Contact {
        draft: ScenarioContactDraft,
    },
    Security {
        security: ScenarioSecurityAuthoring,
        startup_source: Option<crate::model::ClassicSourceBlob>,
    },
}

impl From<ScenarioAuthoringEdit> for super::EditorCommand {
    fn from(edit: ScenarioAuthoringEdit) -> Self {
        Self::ApplyScenario { edit }
    }
}

impl EditorSession {
    pub(super) fn apply_scenario_edit(
        &mut self,
        edit: ScenarioAuthoringEdit,
    ) -> Result<Vec<StableId>, SessionError> {
        match edit {
            ScenarioAuthoringEdit::Startup { draft } => self.apply_scenario_startup(draft),
            ScenarioAuthoringEdit::Restrictions { restrictions } => {
                self.apply_scenario_restrictions(restrictions)
            }
            ScenarioAuthoringEdit::Contact { draft } => self.update_scenario_contact(draft),
            ScenarioAuthoringEdit::Security {
                security,
                startup_source,
            } => self.apply_scenario_security(security, startup_source),
        }
    }

    pub(super) fn apply_scenario_startup(
        &mut self,
        draft: ScenarioStartupDraft,
    ) -> Result<Vec<StableId>, SessionError> {
        crate::codecs::encode_registration_title(&draft.name).map_err(|error| invalid(&error))?;
        if draft.name.trim().is_empty() {
            return Err(invalid("Scenario name cannot be empty."));
        }
        if !self.snapshot.world.maps.iter().any(|map| {
            map.identity == draft.start_location.map && map.level_type == LevelType::Land
        }) {
            return Err(invalid(
                "Choose an existing land map for the startup location.",
            ));
        }
        crate::codecs::validate_marker_filename(&draft.marker_filename)
            .map_err(|error| invalid(&error))?;
        let original = self.startup_authoring().original_source;
        if self.snapshot.classic_sources.iter().any(|source| {
            source
                .native_path
                .eq_ignore_ascii_case(&draft.marker_filename)
                && Some(source) != original.as_ref()
        }) {
            return Err(invalid(
                "Marker filename would overwrite another retained Classic file.",
            ));
        }
        let mut campaign = self
            .snapshot
            .campaign
            .clone()
            .unwrap_or_else(CampaignMetadata::neutral);
        campaign.name = draft.name;
        campaign.creator_user_check = draft.creator_user_check;
        campaign.recommended_party_levels = draft.recommended_party_levels;
        campaign.maximum_party_levels = draft.maximum_party_levels;
        campaign.guidance_authored = true;
        encode_scenario_startup_as(
            &draft.marker_filename,
            &campaign,
            &draft.start_location,
            None,
            None,
        )
        .map_err(|error| invalid(&error.to_string()))?;
        let mut authoring = self.startup_authoring();
        authoring.marker_filename = draft.marker_filename;
        self.snapshot.campaign = Some(campaign);
        self.snapshot.start_location = Some(draft.start_location);
        self.snapshot.startup_authoring = Some(authoring);
        Ok(vec![self.snapshot.project_id.clone()])
    }

    pub(super) fn apply_scenario_restrictions(
        &mut self,
        restrictions: CampaignRestrictions,
    ) -> Result<Vec<StableId>, SessionError> {
        let mut campaign = self
            .snapshot
            .campaign
            .clone()
            .unwrap_or_else(CampaignMetadata::neutral);
        campaign.restrictions = restrictions;
        let fallback = StartLocation {
            map: StableId("land:0".into()),
            coordinate: crate::model::MapCoordinate { x: 0, y: 0 },
        };
        let location = self.snapshot.start_location.as_ref().unwrap_or(&fallback);
        encode_scenario_startup_as(
            &self.startup_authoring().marker_filename,
            &campaign,
            location,
            None,
            None,
        )
        .map_err(|error| invalid(&error.to_string()))?;
        self.snapshot.campaign = Some(campaign);
        Ok(vec![self.snapshot.project_id.clone()])
    }

    pub(super) fn apply_scenario_security(
        &mut self,
        security: ScenarioSecurityAuthoring,
        startup_source: Option<crate::model::ClassicSourceBlob>,
    ) -> Result<Vec<StableId>, SessionError> {
        if matches!(
            self.snapshot.origin,
            crate::model::ProjectOrigin::Imported { .. }
        ) && self
            .snapshot
            .startup_authoring
            .as_ref()
            .and_then(|value| value.original_source.as_ref())
            .is_none()
            && startup_source.is_none()
        {
            return Err(invalid(
                "Choose the original startup source before applying Security.",
            ));
        }
        validate_security_segments(&security.segment1, &security.segment2)
            .map_err(|error| invalid(&error.to_string()))?;
        validate_security_backup(&self.snapshot, &security)?;
        let mut authoring = self.startup_authoring();
        self.select_original_source(&mut authoring, startup_source)?;
        authoring.security = Some(security);
        self.snapshot.startup_authoring = Some(authoring);
        if self.snapshot.campaign.is_none() {
            self.snapshot.campaign = Some(CampaignMetadata::neutral());
        }
        Ok(vec![self.snapshot.project_id.clone()])
    }

    fn select_original_source(
        &self,
        authoring: &mut ScenarioStartupAuthoring,
        startup_source: Option<crate::model::ClassicSourceBlob>,
    ) -> Result<(), SessionError> {
        if let Some(source) = startup_source {
            let matches = self
                .snapshot
                .classic_sources
                .iter()
                .filter(|row| row.native_path == source.native_path)
                .collect::<Vec<_>>();
            if matches.len() != 1
                || matches[0] != &source
                || source.byte_length < crate::codecs::SCENARIO_STARTUP_BYTES as u64
            {
                return Err(invalid(
                    "The selected original startup source changed or is incomplete.",
                ));
            }
            crate::codecs::validate_marker_filename(&source.native_path)
                .map_err(|error| invalid(&error))?;
            if authoring
                .original_source
                .as_ref()
                .is_some_and(|original| original != &source)
            {
                return Err(invalid(
                    "An established original startup source cannot be replaced.",
                ));
            }
            authoring.original_source = Some(source);
        }
        Ok(())
    }

    fn startup_authoring(&self) -> ScenarioStartupAuthoring {
        self.snapshot.startup_authoring.clone().unwrap_or_else(|| {
            let name = self
                .snapshot
                .campaign
                .as_ref()
                .map(|campaign| campaign.name.as_str())
                .unwrap_or("Untitled scenario");
            let mut sources = self
                .snapshot
                .classic_sources
                .iter()
                .filter(|source| source.native_path == name);
            let first = sources.next().cloned();
            ScenarioStartupAuthoring {
                marker_filename: name.into(),
                original_source: if matches!(
                    self.snapshot.origin,
                    crate::model::ProjectOrigin::Authored
                ) && sources.next().is_none()
                {
                    first
                } else {
                    None
                },
                security: None,
            }
        })
    }
}

fn invalid(message: &str) -> SessionError {
    SessionError::InvalidScenarioDraft(message.into())
}

fn validate_security_backup(
    snapshot: &crate::model::ProjectSnapshot,
    security: &ScenarioSecurityAuthoring,
) -> Result<(), SessionError> {
    let matching = snapshot
        .classic_sources
        .iter()
        .filter(|source| source.native_path == "Data CS")
        .collect::<Vec<_>>();
    if matching.len() > 1 || matching.first().copied() != security.backup_source.as_ref() {
        return Err(invalid(
            "The security backup changed. Reload its allocation preview.",
        ));
    }
    if let Some(source) = &security.backup_source {
        if source.byte_length < 316 && !security.repair_backup {
            return Err(invalid(
                "Review and accept repair of the incomplete Data CS backup first.",
            ));
        }
    } else if security.backup_mask != [0; 20] || security.repair_backup {
        return Err(invalid(
            "A new security backup must start with an empty mask.",
        ));
    }
    Ok(())
}
