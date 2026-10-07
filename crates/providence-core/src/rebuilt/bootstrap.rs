use crate::model::{
    CampaignMetadata, CampaignRestrictions, ProjectSnapshot, StableId, StartLocation,
};
use serde::{Deserialize, Serialize};
#[cfg(test)]
mod tests;
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3Campaign {
    pub id: StableId,
    pub name: String,
    pub version: String,
    pub author: String,
    pub contact: RebuiltV3CampaignContact,
    pub description: String,
    pub splash_asset_id: String,
    pub recommended_party_levels: u32,
    pub maximum_party_levels: u32,
    pub guidance_authored: bool,
    pub restrictions: CampaignRestrictions,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3CampaignContact {
    pub email: String,
    pub web: String,
    pub date: String,
    pub fee: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3Start {
    pub map_id: StableId,
    pub x: u8,
    pub y: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3Bootstrap {
    pub campaign: RebuiltV3Campaign,
    pub start: RebuiltV3Start,
}

pub fn project_rebuilt_v3_bootstrap(snapshot: &ProjectSnapshot) -> Option<RebuiltV3Bootstrap> {
    let campaign = project_rebuilt_v3_campaign(snapshot)?;
    let start = snapshot.start_location.as_ref()?;
    Some(RebuiltV3Bootstrap {
        campaign,
        start: start_projection(start),
    })
}

pub fn project_rebuilt_v3_campaign(snapshot: &ProjectSnapshot) -> Option<RebuiltV3Campaign> {
    let campaign = snapshot.campaign.as_ref()?;
    Some(campaign_projection(snapshot.project_id.clone(), campaign))
}

fn campaign_projection(id: StableId, metadata: &CampaignMetadata) -> RebuiltV3Campaign {
    RebuiltV3Campaign {
        id,
        name: metadata.name.clone(),
        version: metadata.version.clone(),
        author: metadata.author.clone(),
        contact: RebuiltV3CampaignContact {
            email: metadata.contact.email.clone(),
            web: metadata.contact.web.clone(),
            date: metadata.contact.date.clone(),
            fee: metadata.contact.fee.clone(),
        },
        description: metadata.description.clone(),
        splash_asset_id: metadata.splash_asset_id.clone(),
        recommended_party_levels: metadata.recommended_party_levels,
        maximum_party_levels: metadata.maximum_party_levels,
        guidance_authored: metadata.guidance_authored,
        restrictions: metadata.restrictions.clone(),
    }
}

fn start_projection(location: &StartLocation) -> RebuiltV3Start {
    RebuiltV3Start {
        map_id: location.map.clone(),
        x: location.coordinate.x,
        y: location.coordinate.y,
    }
}
