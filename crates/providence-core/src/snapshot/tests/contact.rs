use super::super::*;
use super::fixtures::{downgrade_contact_fields, legacy_campaign};
use crate::model::{BlobId, CampaignContactProvenance, ClassicSourceBlob, ProjectOrigin, StableId};

#[test]
fn version_thirty_retains_data_ci_for_lazy_hydration() {
    let mut current = ProjectSnapshot::new_authored(StableId("v30-import".into()));
    current.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    current.campaign = Some(legacy_campaign());
    current.classic_sources.push(ClassicSourceBlob {
        native_path: "Data CI".into(),
        blob: BlobId(format!("sha256:{}", "b".repeat(64))),
        byte_length: crate::codecs::SCENARIO_CONTACT_INFO_BYTES as u64,
    });
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    value["formatVersion"] = serde_json::json!(30);
    downgrade_contact_fields(&mut value);

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v30");
    let campaign = migrated.campaign.expect("campaign");
    assert_eq!(campaign.creator_user_check, "Registered User");
    assert_eq!(
        campaign.contact_provenance,
        CampaignContactProvenance::LegacyUnhydrated
    );
    assert!(campaign.contact.title.is_empty());
}

#[test]
fn version_thirty_authored_contact_becomes_explicitly_authored() {
    let mut current = ProjectSnapshot::new_authored(StableId("v30-authored".into()));
    current.campaign = Some(legacy_campaign());
    let mut value = serde_json::to_value(current).expect("serialize current snapshot");
    value["formatVersion"] = serde_json::json!(30);
    downgrade_contact_fields(&mut value);

    let migrated = from_json(&serde_json::to_string(&value).unwrap()).expect("migrate v30");
    let campaign = migrated.campaign.expect("campaign");
    assert_eq!(campaign.creator_user_check, "Registered User");
    assert_eq!(campaign.contact.title, "Legacy Folder");
    assert_eq!(
        campaign.contact_provenance,
        CampaignContactProvenance::Authored
    );
}
