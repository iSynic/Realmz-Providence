use super::*;
use crate::compiler::NamedCompatibilitySource;
use crate::model::*;

fn project() -> ProjectSnapshot {
    let mut project = ProjectSnapshot::new_authored(StableId("scenario-compiler".into()));
    project.campaign = Some(CampaignMetadata::neutral());
    project.start_location = Some(StartLocation {
        map: StableId("land:0".into()),
        coordinate: MapCoordinate { x: 2, y: 3 },
    });
    project
}

#[test]
fn marker_rename_keeps_original_security_and_backup_and_emits_one_marker() {
    let mut project = project();
    let original = vec![0xa7; 321];
    let backup = vec![0xb3; 325];
    let source = ClassicSourceBlob {
        native_path: "Original Marker".into(),
        blob: BlobId("sha256:original".into()),
        byte_length: original.len() as u64,
    };
    project.classic_sources.push(source.clone());
    project.startup_authoring = Some(ScenarioStartupAuthoring {
        marker_filename: "Runtime Marker".into(),
        original_source: Some(source),
        security: None,
    });
    let mut startup = original.clone();
    startup[..20].fill(0);
    startup[60..316].fill(0);
    let sources = ClassicCompatibilitySources {
        scenario_startup: Some(NamedCompatibilitySource {
            native_path: "Original Marker",
            bytes: &startup,
        }),
        data_cs: Some(&backup),
        ..Default::default()
    };
    let mut manifest = NativeManifest::default();
    compile(&project, sources, &mut manifest).unwrap();
    assert!(manifest.get("Original Marker").is_none());
    assert_eq!(
        &manifest.get("Runtime Marker").unwrap().bytes[20..60],
        &original[20..60]
    );
    assert_eq!(
        &manifest.get("Runtime Marker").unwrap().bytes[316..],
        &original[316..]
    );
    assert_eq!(manifest.get("Data CS").unwrap().bytes, backup);
}

#[test]
fn explicit_security_overlay_preserves_backup_and_startup_tail() {
    let mut project = project();
    let mut startup = vec![0; 316];
    startup.extend_from_slice(&[0xa7, 0xb3]);
    let backup = vec![0xb3; 325];
    project.startup_authoring = Some(ScenarioStartupAuthoring {
        marker_filename: "Untitled scenario".into(),
        original_source: None,
        security: Some(ScenarioSecurityAuthoring {
            segment1: "first".into(),
            segment2: "second".into(),
            backup_source: None,
            backup_mask: crate::codecs::security_backup_mask(&backup),
            repair_backup: false,
        }),
    });
    let sources = ClassicCompatibilitySources {
        scenario_startup: Some(NamedCompatibilitySource {
            native_path: "Untitled scenario",
            bytes: &startup,
        }),
        data_cs: Some(&backup),
        ..Default::default()
    };
    let mut manifest = NativeManifest::default();
    compile(&project, sources, &mut manifest).unwrap();
    let output = &manifest.get("Untitled scenario").unwrap().bytes;
    assert_eq!(&output[316..], &[0xa7, 0xb3]);
    assert_eq!(manifest.get("Data CS").unwrap().bytes, backup);
    assert_eq!(
        crate::codecs::decode_scenario_security(output, Some(&backup)).unwrap(),
        ("first".into(), "second".into())
    );
    assert!(matches!(
        manifest.get("Untitled scenario").unwrap().source,
        crate::compiler::ManifestSource::Generated {
            family: NativeFileFamily::ScenarioSecurityStartup
        }
    ));
}

#[test]
fn marker_collisions_are_rejected_by_commands_and_compilation() {
    let mut project = project();
    for filename in [
        "Data RI", "data cs", "Data LD", "Scenario", "Global", "Layout",
    ] {
        project.startup_authoring = Some(ScenarioStartupAuthoring {
            marker_filename: filename.into(),
            original_source: None,
            security: None,
        });
        assert!(
            compile(
                &project,
                ClassicCompatibilitySources::default(),
                &mut NativeManifest::default()
            )
            .is_err()
        );
        let mut session = crate::session::EditorSession::new(project.clone());
        let draft = crate::session::ScenarioStartupDraft {
            name: "Scenario".into(),
            marker_filename: filename.into(),
            recommended_party_levels: 1,
            maximum_party_levels: 10,
            creator_user_check: String::new(),
            start_location: project.start_location.clone().unwrap(),
        };
        let before = session.snapshot().clone();
        assert!(
            session
                .execute(crate::session::ExpectedRevisionCommand {
                    expected_revision: crate::session::Revision(0),
                    command: crate::session::ScenarioAuthoringEdit::Startup { draft }.into()
                })
                .is_err()
        );
        assert_eq!(session.snapshot(), &before);
    }
}
