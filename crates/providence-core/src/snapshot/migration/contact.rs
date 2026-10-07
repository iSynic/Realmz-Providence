use super::versions::PRE_CLASSIC_RESOURCE_REMOVALS_SNAPSHOT_FORMAT_VERSION;
use crate::model::{CampaignContactProvenance, ProjectOrigin, ProjectSnapshot};

pub(super) fn migrate_contact_provenance(snapshot: &mut ProjectSnapshot, source_version: u32) {
    if source_version < PRE_CLASSIC_RESOURCE_REMOVALS_SNAPSHOT_FORMAT_VERSION
        && let Some(campaign) = snapshot.campaign.as_mut()
    {
        campaign.creator_user_check.clone_from(&campaign.author);
        if snapshot
            .classic_sources
            .iter()
            .any(|source| source.native_path == "Data CI")
        {
            campaign.contact_provenance = CampaignContactProvenance::LegacyUnhydrated;
        } else if matches!(snapshot.origin, ProjectOrigin::Authored)
            && (!campaign.version.is_empty()
                || !campaign.contact.email.is_empty()
                || !campaign.contact.web.is_empty()
                || !campaign.contact.date.is_empty()
                || !campaign.contact.fee.is_empty()
                || !campaign.description.is_empty())
        {
            campaign.contact.title.clone_from(&campaign.name);
            campaign.contact_provenance = CampaignContactProvenance::Authored;
        } else {
            campaign.contact_provenance = CampaignContactProvenance::Absent;
        }
    }
}
