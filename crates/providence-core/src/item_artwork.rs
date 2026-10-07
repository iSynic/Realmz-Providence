use crate::{
    model::{AssetDescriptor, ProjectSnapshot, StableId},
    session::SessionError,
};

pub(crate) fn references(
    snapshot: &ProjectSnapshot,
) -> Vec<crate::references::ReferenceDescriptor> {
    use crate::references::{
        ByteProvenance, FieldPath, ReferenceDescriptor, RepairAction, ResolutionState, TargetKind,
    };
    snapshot
        .scenario_item_rules
        .iter()
        .filter(|item| item.definition.icon_id != 0)
        .map(|item| {
            let number = item.definition.icon_id;
            let matches: Vec<_> = snapshot
                .assets
                .iter()
                .filter(|asset| {
                    asset
                        .classic_resource
                        .as_ref()
                        .is_some_and(|key| key.resource_type == "cicn" && key.resource_id == number)
                })
                .take(2)
                .collect();
            let fallback = matches.is_empty() && i16::try_from(number).is_ok();
            let start = u32::from(item.record_index) * crate::codecs::ITEM_RECORD_BYTES as u32 + 4;
            ReferenceDescriptor {
                source: item.definition.id.clone(),
                field: FieldPath("iconId".into()),
                target_kind: TargetKind::Icon,
                target_id: if matches.len() == 1 {
                    matches[0].identity.0.clone()
                } else {
                    number.to_string()
                },
                required: true,
                stock_fallback: fallback.then(|| "Realmz item artwork catalog".into()),
                resolution: match matches.len() {
                    1 => ResolutionState::Resolved,
                    2 => ResolutionState::Ambiguous,
                    _ if fallback => ResolutionState::StockFallback,
                    _ => ResolutionState::Missing,
                },
                repair_actions: vec![RepairAction::Retarget, RepairAction::ImportTarget],
                byte_provenance: Some(ByteProvenance {
                    native_path: "Data NI".into(),
                    record_index: u32::from(item.record_index),
                    byte_start: start,
                    byte_end: start + 2,
                }),
            }
        })
        .collect()
}

// Adapters verify and durably retain both blobs before committing this operation.
pub(crate) fn apply(
    snapshot: &mut ProjectSnapshot,
    record_index: u16,
    asset: AssetDescriptor,
) -> Result<Vec<StableId>, SessionError> {
    let item_index = snapshot
        .scenario_item_rules
        .iter()
        .position(|item| item.record_index == record_index)
        .ok_or(SessionError::ScenarioItemNotFound(record_index))?;
    let resource = asset.classic_resource.as_ref().ok_or_else(|| {
        SessionError::InvalidItemArtwork("artwork has no Classic picture resource".into())
    })?;
    if resource.resource_type != "cicn"
        || resource.resource_id == 0
        || i16::try_from(resource.resource_id).is_err()
        || asset.mime_type.as_deref() != Some("image/png")
        || asset.classic_payload_blob.is_none()
        || !asset
            .classic_payload_byte_length
            .is_some_and(|size| size > 0)
        || asset.byte_length == 0
    {
        return Err(SessionError::InvalidItemArtwork(
            "artwork requires a nonzero signed picture number, a PNG preview and retained Classic color-icon payload".into(),
        ));
    }
    for existing in &snapshot.assets {
        if existing == &asset {
            continue;
        }
        if existing.identity == asset.identity
            || existing.classic_resource.as_ref() == Some(resource)
        {
            return Err(SessionError::InvalidItemArtwork(
                "different artwork already uses this identity or picture number; choose an unused number".into()));
        }
    }
    let icon_id = resource.resource_id;
    let asset_id = asset.identity.clone();
    snapshot
        .classic_resource_removals
        .retain(|removed| removed != resource);
    if !snapshot.assets.contains(&asset) {
        snapshot.assets.push(asset);
    }
    let item = &mut snapshot.scenario_item_rules[item_index];
    item.definition.icon_id = icon_id;
    let item_id = item.definition.id.clone();
    snapshot.normalize();
    Ok(vec![item_id, asset_id])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        codecs::{decode_scenario_item_rules, encode_scenario_item_rules},
        model::{BlobId, ClassicResourceKey},
        session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision},
    };

    fn artwork() -> AssetDescriptor {
        AssetDescriptor {
            identity: StableId("item-artwork:9000".into()),
            label: "Artwork".into(),
            kind: "icon".into(),
            mime_type: Some("image/png".into()),
            classic_resource: Some(ClassicResourceKey {
                resource_type: "cicn".into(),
                resource_id: 9000,
            }),
            scenario_music_slot: None,
            blob: BlobId(format!("sha256:{}", "a".repeat(64))),
            byte_length: 4,
            classic_payload_blob: Some(BlobId(format!("sha256:{}", "b".repeat(64)))),
            classic_payload_byte_length: Some(4),
            extension: Some("png".into()),
            width: Some(32),
            height: Some(32),
            duration_ms: None,
            sample_rate: None,
            channels: None,
            tile_width: None,
            tile_height: None,
            columns: None,
            rows: None,
            landlook: None,
            base_tile: None,
            source: "synthetic test artwork".into(),
        }
    }

    fn snapshot() -> ProjectSnapshot {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("artwork-test".into()));
        snapshot.scenario_item_rules = decode_scenario_item_rules(
            &vec![0; 20_000],
            None,
            BlobId("synthetic-items".into()),
            None,
        )
        .unwrap()
        .rules;
        snapshot.scenario_item_rules[0].definition.name = "Keep my name".into();
        snapshot.scenario_item_rules[0].definition.cost = 37;
        snapshot
    }

    fn command(asset: AssetDescriptor) -> EditorCommand {
        EditorCommand::ApplyScenarioItemArtwork {
            record_index: 0,
            asset: Box::new(asset),
        }
    }

    #[test]
    fn artwork_links_have_exact_identity_signed_keys_and_native_field_provenance() {
        use crate::references::ResolutionState;
        let mut data = snapshot();
        assert!(references(&data).is_empty());
        data.scenario_item_rules[1].definition.icon_id = -189;
        let fallback = references(&data);
        assert_eq!(fallback.len(), 1);
        assert_eq!(fallback[0].target_id, "-189");
        assert_eq!(fallback[0].resolution, ResolutionState::StockFallback);
        let bytes = fallback[0].byte_provenance.as_ref().unwrap();
        assert_eq!(
            (
                bytes.native_path.as_str(),
                bytes.record_index,
                bytes.byte_start,
                bytes.byte_end
            ),
            ("Data NI", 1, 104, 106)
        );
        let mut picture = artwork();
        picture.classic_resource.as_mut().unwrap().resource_id = -189;
        data.assets.push(picture.clone());
        let resolved = references(&data);
        assert_eq!(resolved[0].target_id, picture.identity.0);
        assert_eq!(
            resolved[0].source,
            data.scenario_item_rules[1].definition.id
        );
        assert_eq!(resolved[0].field.0, "iconId");
        assert_eq!(resolved[0].resolution, ResolutionState::Resolved);
        assert!(resolved[0].stock_fallback.is_none());
        picture.identity = StableId("duplicate-picture".into());
        data.assets.push(picture);
        assert_eq!(references(&data)[0].resolution, ResolutionState::Ambiguous);
        assert_eq!(references(&data)[0].target_id, "-189");
        data.assets.clear();
        data.scenario_item_rules[1].definition.icon_id = 32768;
        assert_eq!(references(&data)[0].resolution, ResolutionState::Missing);
    }

    #[test]
    fn used_artwork_removal_is_refused_without_changing_history_or_snapshot() {
        let mut before = snapshot();
        before.assets.push(artwork());
        before.scenario_item_rules[0].definition.icon_id = 9000;
        let mut session = EditorSession::new(before);
        let original = session.snapshot().clone();
        assert!(matches!(
            session.check_asset_removal(&artwork().identity),
            Err(crate::session::SessionError::AssetInUse(_))
        ));
        assert!(matches!(
            session.execute(ExpectedRevisionCommand {
                expected_revision: Revision(0),
                command: EditorCommand::RemoveAsset {
                    identity: artwork().identity
                },
            }),
            Err(crate::session::SessionError::AssetInUse(_))
        ));
        assert_eq!(session.revision(), Revision(0));
        assert_eq!(session.snapshot(), &original);
        assert!(session.undo_history().is_empty());
        let mut replacement = artwork();
        replacement.identity = StableId("replacement-artwork".into());
        replacement.classic_resource.as_mut().unwrap().resource_id = -189;
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(0),
                command: command(replacement),
            })
            .unwrap();
        assert!(session.check_asset_removal(&artwork().identity).is_ok());
        let repaired = session.snapshot().clone();
        assert!(
            session
                .execute(ExpectedRevisionCommand {
                    expected_revision: Revision(0),
                    command: EditorCommand::RemoveAsset {
                        identity: artwork().identity
                    },
                })
                .is_err()
        );
        assert_eq!(session.snapshot(), &repaired);
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(1),
                command: EditorCommand::RemoveAsset {
                    identity: artwork().identity,
                },
            })
            .unwrap();
        assert_eq!(
            session.snapshot().scenario_item_rules[0].definition.icon_id,
            -189
        );
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(2),
                command: EditorCommand::Undo,
            })
            .unwrap();
        assert_eq!(session.snapshot(), &repaired);
    }

    #[test]
    fn item_artwork_is_one_revision_and_one_undo_with_no_unrelated_edits() {
        let before = snapshot();
        let mut session = EditorSession::new(before.clone());
        let delta = session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(0),
                command: command(artwork()),
            })
            .unwrap();
        assert!(
            delta
                .changed_entities
                .contains(&StableId("classic.item.800".into()))
        );
        assert!(
            delta
                .reference_changes
                .iter()
                .any(|reference| reference.source.0 == "classic.item.800"
                    && reference.field.0 == "iconId"
                    && reference.target_id == artwork().identity.0)
        );
        let mut expected = before.clone();
        expected.assets.push(artwork());
        expected.scenario_item_rules[0].definition.icon_id = 9000;
        expected.normalize();
        assert_eq!(session.snapshot(), &expected);
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(1),
                command: EditorCommand::Undo,
            })
            .unwrap();
        assert_eq!(session.snapshot(), &before);
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(2),
                command: EditorCommand::Redo,
            })
            .unwrap();
        assert_eq!(session.snapshot(), &expected);
        assert!(matches!(
            session.execute(ExpectedRevisionCommand {
                expected_revision: Revision(0),
                command: command(artwork()),
            }),
            Err(SessionError::RevisionConflict { .. })
        ));
        assert_eq!(session.snapshot(), &expected);
    }

    #[test]
    fn item_artwork_rejects_collisions_missing_items_and_incomplete_payloads_without_changes() {
        for case in 0..6 {
            let mut before = snapshot();
            let mut candidate = artwork();
            match case {
                0 => {
                    let mut conflict = artwork();
                    conflict.blob = BlobId("different".into());
                    before.assets.push(conflict);
                }
                1 => {
                    let mut conflict = artwork();
                    conflict.identity = StableId("another".into());
                    before.assets.push(conflict);
                }
                2 => before.scenario_item_rules.clear(),
                3 => candidate.classic_payload_blob = None,
                4 => candidate.classic_resource.as_mut().unwrap().resource_id = 0,
                _ => candidate.classic_resource.as_mut().unwrap().resource_id = -32769,
            }
            let mut session = EditorSession::new(before.clone());
            assert!(
                session
                    .execute(ExpectedRevisionCommand {
                        expected_revision: Revision(0),
                        command: command(candidate)
                    })
                    .is_err()
            );
            assert_eq!(session.snapshot(), &before);
            assert!(
                session
                    .execute(ExpectedRevisionCommand {
                        expected_revision: Revision(0),
                        command: EditorCommand::Undo
                    })
                    .is_err()
            );
        }
    }

    #[test]
    fn item_artwork_reuses_identical_asset_without_duplication() {
        let mut before = snapshot();
        before.assets.push(artwork());
        apply(&mut before, 0, artwork()).unwrap();
        assert_eq!(before.assets.len(), 1);
        assert_eq!(before.scenario_item_rules[0].definition.icon_id, 9000);
    }

    #[test]
    fn item_artwork_changes_only_the_selected_native_icon_word() {
        let mut project = snapshot();
        let source = vec![0; 20_000];
        let before = encode_scenario_item_rules(&project.scenario_item_rules, &source).unwrap();
        apply(&mut project, 0, artwork()).unwrap();
        let after = encode_scenario_item_rules(&project.scenario_item_rules, &source).unwrap();
        let changed: Vec<_> = before
            .iter()
            .zip(&after)
            .enumerate()
            .filter_map(|(index, (a, b))| (a != b).then_some(index))
            .collect();
        assert_eq!(changed, vec![4, 5]);
        let reopened =
            decode_scenario_item_rules(&after, None, BlobId("synthetic".into()), None).unwrap();
        assert_eq!(reopened.rules[0].definition.icon_id, 9000);
        assert_eq!(reopened.rules[0].definition.cost, 37);
    }
}
