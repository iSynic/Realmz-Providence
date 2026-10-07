use crate::model::{
    CampaignContact, CampaignContactProvenance, CampaignMetadata, CampaignRestrictions,
};

pub(super) fn legacy_campaign() -> CampaignMetadata {
    CampaignMetadata {
        name: "Legacy Folder".into(),
        version: "2.1".into(),
        author: "Registered User".into(),
        creator_user_check: String::new(),
        contact: CampaignContact {
            title: String::new(),
            email: "keeper@example.test".into(),
            web: String::new(),
            date: "September 1999".into(),
            fee: String::new(),
        },
        contact_provenance: CampaignContactProvenance::Absent,
        description: "Legacy description".into(),
        splash_asset_id: String::new(),
        recommended_party_levels: 1,
        maximum_party_levels: 10,
        guidance_authored: false,
        restrictions: CampaignRestrictions {
            description: String::new(),
            max_party_size: 6,
            max_level: 10,
            banned_races: Vec::new(),
            banned_castes: Vec::new(),
        },
    }
}

pub(super) fn downgrade_contact_fields(value: &mut serde_json::Value) {
    let campaign = value
        .get_mut("campaign")
        .and_then(serde_json::Value::as_object_mut)
        .expect("campaign object");
    campaign.remove("creatorUserCheck");
    campaign.remove("contactProvenance");
    campaign
        .get_mut("contact")
        .and_then(serde_json::Value::as_object_mut)
        .expect("contact object")
        .remove("title");
}
