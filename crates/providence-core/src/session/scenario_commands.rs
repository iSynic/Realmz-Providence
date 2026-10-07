use crate::codecs::encode_scenario_contact_info;
use crate::model::BlobId;
use crate::model::CampaignContactProvenance;
use crate::model::CampaignMetadata;
use crate::model::ClassicSourceBlob;
use crate::model::GlobalMacroHook;
use crate::model::LevelType;
use crate::model::ProjectOrigin;
use crate::model::ProjectSnapshot;
use crate::model::ScenarioApplicationContract;
use crate::model::StableId;
use crate::model::StartLocation;
use crate::session::EditorSession;
use crate::session::errors::SessionError;

impl EditorSession {
    pub(super) fn import_classic_scenario_bootstrap(
        &mut self,
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        startup_native_path: String,
        campaign: Box<CampaignMetadata>,
        start_location: StartLocation,
    ) -> Result<Vec<StableId>, SessionError> {
        validate_classic_scenario_bootstrap_import(
            &self.snapshot,
            &sources,
            &startup_native_path,
            &campaign,
            &start_location,
        )?;
        self.snapshot.origin = ProjectOrigin::Imported {
            compatibility_annex: annex_blob,
        };
        self.snapshot.startup_authoring = Some(crate::model::ScenarioStartupAuthoring {
            marker_filename: startup_native_path.clone(),
            original_source: sources
                .iter()
                .find(|source| source.native_path == startup_native_path)
                .cloned(),
            security: None,
        });
        self.snapshot.classic_sources = sources;
        self.snapshot.classic_rule_selection = None;
        self.snapshot.campaign = Some(*campaign);
        let start_map = start_location.map.clone();
        self.snapshot.start_location = Some(start_location);
        self.snapshot.normalize();
        Ok(vec![self.snapshot.project_id.clone(), start_map])
    }

    pub(super) fn set_campaign_metadata(
        &mut self,
        metadata: Box<CampaignMetadata>,
    ) -> Result<Vec<StableId>, SessionError> {
        let mut metadata = *metadata;
        normalize_campaign_metadata_provenance(self.snapshot.campaign.as_ref(), &mut metadata);
        self.snapshot.campaign = Some(metadata);
        Ok(vec![self.snapshot.project_id.clone()])
    }

    pub(super) fn update_scenario_contact(
        &mut self,
        draft: super::ScenarioContactDraft,
    ) -> Result<Vec<StableId>, SessionError> {
        let mut campaign = self
            .snapshot
            .campaign
            .clone()
            .unwrap_or_else(CampaignMetadata::neutral);
        campaign.contact.title = draft.title;
        campaign.version = draft.version;
        campaign.contact.date = draft.date;
        campaign.author = draft.author;
        campaign.contact.email = draft.email;
        campaign.contact.web = draft.web;
        campaign.contact.fee = draft.fee;
        campaign.description = draft.description;
        campaign.contact_provenance = CampaignContactProvenance::Authored;
        encode_scenario_contact_info(&campaign, None)
            .map_err(|error| SessionError::InvalidScenarioContact(error.to_string()))?;
        self.snapshot.campaign = Some(campaign);
        Ok(vec![self.snapshot.project_id.clone()])
    }

    pub(super) fn set_start_location(
        &mut self,
        location: StartLocation,
    ) -> Result<Vec<StableId>, SessionError> {
        self.snapshot.start_location = Some(location);
        Ok(vec![self.snapshot.project_id.clone()])
    }

    pub(super) fn set_scenario_application(
        &mut self,
        contract: ScenarioApplicationContract,
    ) -> Result<Vec<StableId>, SessionError> {
        self.snapshot.scenario_application = Some(contract);
        Ok(vec![self.snapshot.project_id.clone()])
    }

    pub(super) fn set_global_macro_hook(
        &mut self,
        hook: GlobalMacroHook,
        target: Option<StableId>,
    ) -> Result<Vec<StableId>, SessionError> {
        if let Some(target) = &target {
            validate_global_macro_target(target)?;
        }
        let application = self
            .snapshot
            .scenario_application
            .get_or_insert_with(ScenarioApplicationContract::default);
        application.hooks.set(hook, target);
        Ok(vec![self.snapshot.project_id.clone()])
    }
}

pub(super) fn normalize_campaign_metadata_provenance(
    previous: Option<&CampaignMetadata>,
    metadata: &mut CampaignMetadata,
) {
    if metadata.contact_provenance != CampaignContactProvenance::Absent {
        return;
    }
    if let Some(previous) = previous {
        if metadata.creator_user_check.is_empty() && !previous.creator_user_check.is_empty() {
            metadata
                .creator_user_check
                .clone_from(&previous.creator_user_check);
        }
        if campaign_contact_fields_equal(previous, metadata)
            && matches!(
                previous.contact_provenance,
                CampaignContactProvenance::SourceBacked
                    | CampaignContactProvenance::LegacyUnhydrated
            )
        {
            metadata.contact_provenance = previous.contact_provenance;
            return;
        }
    }
    if campaign_has_explicit_contact(metadata) {
        metadata.contact_provenance = CampaignContactProvenance::Authored;
    }
}

pub(super) fn campaign_contact_fields_equal(
    left: &CampaignMetadata,
    right: &CampaignMetadata,
) -> bool {
    left.contact.title == right.contact.title
        && left.version == right.version
        && left.contact.date == right.contact.date
        && left.author == right.author
        && left.contact.email == right.contact.email
        && left.contact.web == right.contact.web
        && left.contact.fee == right.contact.fee
        && left.description == right.description
}

pub(super) fn campaign_has_explicit_contact(campaign: &CampaignMetadata) -> bool {
    !campaign.contact.title.is_empty()
        || !campaign.version.is_empty()
        || !campaign.contact.date.is_empty()
        || (!campaign.author.is_empty() && campaign.author != campaign.creator_user_check)
        || !campaign.contact.email.is_empty()
        || !campaign.contact.web.is_empty()
        || !campaign.contact.fee.is_empty()
        || !campaign.description.is_empty()
}

pub(super) fn validate_classic_scenario_bootstrap_import(
    snapshot: &ProjectSnapshot,
    sources: &[ClassicSourceBlob],
    startup_native_path: &str,
    campaign: &CampaignMetadata,
    start_location: &StartLocation,
) -> Result<(), SessionError> {
    if startup_native_path.is_empty()
        || startup_native_path.contains('/')
        || startup_native_path.contains('\\')
    {
        return Err(SessionError::InvalidClassicImport(
            "scenario startup source must be one portable file name".into(),
        ));
    }
    if !sources
        .iter()
        .any(|source| source.native_path == startup_native_path)
    {
        return Err(SessionError::InvalidClassicImport(format!(
            "scenario bootstrap is missing source {startup_native_path}"
        )));
    }
    let has_restriction_source = sources.iter().any(|source| source.native_path == "Data RI");
    if !has_restriction_source
        && (!campaign.restrictions.description.is_empty()
            || campaign.restrictions.max_party_size != 6
            || campaign.restrictions.max_level != 0
            || !campaign.restrictions.banned_races.is_empty()
            || !campaign.restrictions.banned_castes.is_empty())
    {
        return Err(SessionError::InvalidClassicImport(
            "scenario bootstrap has authored restrictions without a Data RI source".into(),
        ));
    }
    if campaign.name.trim().is_empty() {
        return Err(SessionError::InvalidClassicImport(
            "scenario campaign name cannot be empty".into(),
        ));
    }
    if !(1..=6).contains(&campaign.restrictions.max_party_size) {
        return Err(SessionError::InvalidClassicImport(
            "scenario maximum party size must be between 1 and 6".into(),
        ));
    }
    validate_imported_start_location(snapshot, start_location)
}

fn validate_imported_start_location(
    snapshot: &ProjectSnapshot,
    start_location: &StartLocation,
) -> Result<(), SessionError> {
    if start_location.coordinate.x as usize >= crate::model::CLASSIC_MAP_SIZE
        || start_location.coordinate.y as usize >= crate::model::CLASSIC_MAP_SIZE
    {
        return Err(SessionError::InvalidClassicImport(
            "scenario start coordinate is outside the Classic map".into(),
        ));
    }
    if !snapshot
        .world
        .maps
        .iter()
        .any(|map| map.identity == start_location.map && map.level_type == LevelType::Land)
    {
        return Err(SessionError::InvalidClassicImport(format!(
            "scenario start map '{}' is not an imported land map",
            start_location.map.0
        )));
    }
    Ok(())
}

pub(super) fn validate_global_macro_target(target: &StableId) -> Result<(), SessionError> {
    target
        .0
        .strip_prefix("extra-action-point:")
        .and_then(|value| value.parse::<i16>().ok())
        .filter(|door| *door != 0)
        .map(|_| ())
        .ok_or_else(|| SessionError::InvalidGlobalMacroTarget(target.clone()))
}
