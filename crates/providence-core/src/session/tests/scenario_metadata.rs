use super::*;

#[test]
fn scenario_contact_edit_is_revisioned_bounded_and_undoable() {
    let snapshot = source_backed_contact_snapshot();
    let mut session = EditorSession::new(snapshot);
    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: crate::session::ScenarioAuthoringEdit::Contact {
                draft: crate::session::ScenarioContactDraft {
                    title: "Classic Display Title".into(),
                    version: "1.1".into(),
                    date: "September 1998".into(),
                    author: "Classic Author".into(),
                    email: "new@example.test".into(),
                    web: "https://example.test".into(),
                    fee: "Free".into(),
                    description: "Updated description".into(),
                },
            }
            .into(),
        })
        .expect("edit scenario contact");

    assert_eq!(projection.revision, Revision(1));
    assert_eq!(projection.changed_entities_total, 1);
    let campaign = session.snapshot().campaign.as_ref().expect("campaign");
    assert_eq!(campaign.version, "1.1");
    assert_eq!(campaign.contact.email, "new@example.test");
    assert_eq!(campaign.creator_user_check, "Registered User");
    assert_eq!(
        campaign.contact_provenance,
        CampaignContactProvenance::Authored
    );

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .expect("undo contact edit");
    let campaign = session.snapshot().campaign.as_ref().expect("campaign");
    assert_eq!(campaign.version, "1.0");
    assert_eq!(
        campaign.contact_provenance,
        CampaignContactProvenance::SourceBacked
    );
}

#[test]
fn invalid_scenario_contact_does_not_mutate_the_session() {
    let mut snapshot = sample_snapshot();
    snapshot.campaign = Some(CampaignMetadata {
        name: "Scenario".into(),
        version: String::new(),
        author: "Registered User".into(),
        creator_user_check: "Registered User".into(),
        contact: CampaignContact::default(),
        contact_provenance: CampaignContactProvenance::Absent,
        description: String::new(),
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
    });
    let mut session = EditorSession::new(snapshot);
    let before = session.snapshot().clone();
    let error = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: crate::session::ScenarioAuthoringEdit::Contact {
                draft: crate::session::ScenarioContactDraft {
                    title: "x".repeat(256),
                    version: String::new(),
                    date: String::new(),
                    author: String::new(),
                    email: String::new(),
                    web: String::new(),
                    fee: String::new(),
                    description: String::new(),
                },
            }
            .into(),
        })
        .expect_err("overlong Classic contact field must be rejected");
    assert!(matches!(error, SessionError::InvalidScenarioContact(_)));
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(0));
}

fn source_backed_contact_snapshot() -> ProjectSnapshot {
    let mut snapshot = sample_snapshot();
    snapshot.campaign = Some(CampaignMetadata {
        name: "Scenario Folder".into(),
        version: "1.0".into(),
        author: "Classic Author".into(),
        creator_user_check: "Registered User".into(),
        contact: CampaignContact {
            title: "Classic Display Title".into(),
            email: "old@example.test".into(),
            web: String::new(),
            date: "August 1998".into(),
            fee: "Free".into(),
        },
        contact_provenance: CampaignContactProvenance::SourceBacked,
        description: "Original description".into(),
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
    });
    snapshot
}
