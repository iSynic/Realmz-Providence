use super::*;

/// Finalizes the imported representation only after exact retained bytes are available.
/// Intermediate projections are never published as a v7 archive.
pub fn finalize_rebuilt_v7_document_set(
    artifact: &mut RebuiltV3DocumentSetArtifact,
    snapshot: &ProjectSnapshot,
    compiler_identity: &RebuiltV3CompilerIdentity,
    retained_bytes: &BTreeMap<String, Vec<u8>>,
    media_payloads: &[RebuiltV3FileInput<'_>],
) -> Result<(), RebuiltV3DocumentSetError> {
    finalize(
        artifact,
        snapshot,
        compiler_identity,
        retained_bytes,
        media_payloads,
        None,
        &BTreeMap::new(),
    )
}

/// Keeps the immutable source context separate from the resolved compilation snapshot.
pub fn finalize_rebuilt_v7_document_set_with_selected_rules(
    artifact: &mut RebuiltV3DocumentSetArtifact,
    original: &ProjectSnapshot,
    compiler_identity: &RebuiltV3CompilerIdentity,
    retained_bytes: &BTreeMap<String, Vec<u8>>,
    media_payloads: &[RebuiltV3FileInput<'_>],
    selection: &super::super::ResolvedClassicRules,
) -> Result<(), RebuiltV3DocumentSetError> {
    finalize(
        artifact,
        original,
        compiler_identity,
        retained_bytes,
        media_payloads,
        Some(selection),
        &BTreeMap::new(),
    )
}

/// The caller supplies only canonical prepared rule blobs; original imports remain immutable.
pub fn finalize_rebuilt_v7_document_set_with_rule_sources(
    artifact: &mut RebuiltV3DocumentSetArtifact,
    original: &ProjectSnapshot,
    compiler_identity: &RebuiltV3CompilerIdentity,
    retained_bytes: &BTreeMap<String, Vec<u8>>,
    media_payloads: &[RebuiltV3FileInput<'_>],
    selection: Option<&super::super::ResolvedClassicRules>,
    prepared_rules: &BTreeMap<String, Vec<u8>>,
) -> Result<(), RebuiltV3DocumentSetError> {
    finalize(
        artifact,
        original,
        compiler_identity,
        retained_bytes,
        media_payloads,
        selection,
        prepared_rules,
    )
}

fn finalize(
    artifact: &mut RebuiltV3DocumentSetArtifact,
    snapshot: &ProjectSnapshot,
    compiler_identity: &RebuiltV3CompilerIdentity,
    retained_bytes: &BTreeMap<String, Vec<u8>>,
    media_payloads: &[RebuiltV3FileInput<'_>],
    selection: Option<&super::super::ResolvedClassicRules>,
    prepared_rules: &BTreeMap<String, Vec<u8>>,
) -> Result<(), RebuiltV3DocumentSetError> {
    if !matches!(snapshot.origin, ProjectOrigin::Imported { .. }) {
        return Err(RebuiltV3DocumentSetError::Serialization(
            "v7 requires imported native records".into(),
        ));
    }
    native_presence::validate(snapshot, retained_bytes)
        .map_err(RebuiltV3DocumentSetError::Serialization)?;
    artifact.content.document.classic_records = Some(selected_records(
        snapshot,
        retained_bytes,
        selection,
        prepared_rules,
    )?);
    restore_option_labels(artifact, snapshot, retained_bytes)?;
    restore_simple_labels(artifact)?;
    restore_random_slots(artifact, snapshot)?;
    let assets = align_native_documents(artifact)?;
    validate_media_payloads(&assets.assets, media_payloads)?;
    let inputs = document_file_inputs(
        &artifact.content,
        &artifact.world,
        &artifact.scenario_json,
        &artifact.asset_index_json,
        media_payloads,
    );
    let mut capabilities = artifact.manifest.manifest.capabilities.clone();
    // Complete imported records retain authored references even when no startup path selects them.
    if !capabilities
        .iter()
        .any(|value| value == "realmz.scenario.deferred-references-v1")
    {
        capabilities.push("realmz.scenario.deferred-references-v1".into());
        capabilities.sort();
    }
    artifact.manifest =
        compile_rebuilt_v7_manifest(snapshot, compiler_identity, &capabilities, &inputs)
            .map_err(RebuiltV3DocumentSetError::Manifest)?;
    Ok(())
}

fn selected_records(
    snapshot: &ProjectSnapshot,
    retained_bytes: &BTreeMap<String, Vec<u8>>,
    selection: Option<&super::super::ResolvedClassicRules>,
    prepared_rules: &BTreeMap<String, Vec<u8>>,
) -> Result<super::super::RebuiltV7ClassicRecords, RebuiltV3DocumentSetError> {
    let mut records = crate::rebuilt::project_rebuilt_v7_effective_records_with_rule_sources(
        snapshot,
        retained_bytes,
        prepared_rules,
    )
    .map_err(RebuiltV3DocumentSetError::Serialization)?;
    let selected = if let Some(selection) = selection {
        crate::rebuilt::native_records::rules::validate_selection(&records, selection)
            .map_err(RebuiltV3DocumentSetError::Serialization)?;
        let captured = captured_view(snapshot, &selection.effective_snapshot)
            .map_err(RebuiltV3DocumentSetError::Serialization)?;
        let mut facts = crate::rebuilt::project_rebuilt_v7_rule_selection(&captured, selection)
            .map_err(RebuiltV3DocumentSetError::Serialization)?;
        // The package binds the inventory it ships; built families are never rule inputs.
        facts.captured_source_set_sha256 = crate::model::classic_source_set_sha256(snapshot)
            .map_err(RebuiltV3DocumentSetError::Serialization)?;
        Some(facts)
    } else {
        if snapshot.classic_rule_selection.is_some() {
            return Err(RebuiltV3DocumentSetError::Serialization(
                "configured Classic rules require selected-rule finalization".into(),
            ));
        }
        None
    };
    records.rule_selection = selected;
    Ok(records)
}

// A rule selection binds the files the scenario actually shipped. Publication may add only the
// families it built from authored records; the binding is checked against the captured list.
fn captured_view<'a>(
    published: &'a ProjectSnapshot,
    captured: &ProjectSnapshot,
) -> Result<std::borrow::Cow<'a, ProjectSnapshot>, String> {
    if published.classic_sources == captured.classic_sources {
        return Ok(std::borrow::Cow::Borrowed(published));
    }
    let built = crate::compiler::missing_native_family_paths(captured);
    let added = published
        .classic_sources
        .iter()
        .filter(|source| !captured.classic_sources.contains(source));
    if !captured
        .classic_sources
        .iter()
        .all(|source| published.classic_sources.contains(source))
        || added
            .into_iter()
            .any(|source| !built.contains(&source.native_path))
    {
        return Err("published Classic sources differ from the captured rule selection".into());
    }
    let mut view = published.clone();
    view.classic_sources = captured.classic_sources.clone();
    Ok(std::borrow::Cow::Owned(view))
}

fn restore_option_labels(
    artifact: &mut RebuiltV3DocumentSetArtifact,
    snapshot: &ProjectSnapshot,
    retained_bytes: &BTreeMap<String, Vec<u8>>,
) -> Result<(), RebuiltV3DocumentSetError> {
    if let Some(bytes) = retained_bytes.get("Data OD") {
        artifact.content.document.option_labels =
            crate::rebuilt::project_rebuilt_v3_native_option_labels(snapshot, bytes)
                .map_err(|error| RebuiltV3DocumentSetError::Serialization(error.to_string()))?;
    }
    Ok(())
}

fn restore_simple_labels(
    artifact: &mut RebuiltV3DocumentSetArtifact,
) -> Result<(), RebuiltV3DocumentSetError> {
    let records = artifact
        .content
        .document
        .classic_records
        .as_ref()
        .expect("v7 native facts");
    for encounter in &mut artifact.content.document.simple_encounters {
        let facts = records
            .simple
            .iter()
            .find(|facts| facts.id == encounter.id)
            .ok_or_else(|| {
                RebuiltV3DocumentSetError::Serialization(
                    "Simple Encounter source facts missing".into(),
                )
            })?;
        for (slot, response) in encounter.responses.iter_mut().enumerate() {
            response.label = crate::codecs::decode_simple_choice_display(&facts.text_slots[slot])
                .unwrap_or_default();
        }
    }
    Ok(())
}

fn restore_random_slots(
    artifact: &mut RebuiltV3DocumentSetArtifact,
    snapshot: &ProjectSnapshot,
) -> Result<(), RebuiltV3DocumentSetError> {
    // V3-v6 projections clipped geometry and could add placeholder mutation slots.
    // V7 keeps exactly the supplied slots; containment never indexes through bounds.
    for map in &mut artifact.world.document.maps {
        let source = snapshot
            .world
            .maps
            .iter()
            .find(|value| value.identity == map.id)
            .ok_or_else(|| {
                RebuiltV3DocumentSetError::Serialization("native map source is unavailable".into())
            })?;
        let runtime = source.runtime.as_ref().ok_or_else(|| {
            RebuiltV3DocumentSetError::Serialization("native map runtime is unavailable".into())
        })?;
        map.random_rectangles = runtime
            .random_rectangles
            .iter()
            .map(|rectangle| crate::rebuilt::RebuiltV3RandomRectangle {
                id: rectangle.identity.clone(),
                top: rectangle.top,
                left: rectangle.left,
                bottom: rectangle.bottom,
                right: rectangle.right,
                chance_ten_thousand: rectangle.chance_ten_thousand,
                battle_range: rectangle.battle_range,
                random_doors: rectangle.random_doors,
                random_door_percent: rectangle.random_door_percent,
                only: rectangle.only,
                option: rectangle.option,
                sound_id: rectangle.sound_id,
                text_id: rectangle.text_id,
            })
            .collect();
        map.random_rectangles.sort_by_key(|rectangle| {
            rectangle
                .id
                .0
                .rsplit(':')
                .next()
                .and_then(|value| value.parse::<usize>().ok())
        });
    }
    Ok(())
}

fn align_native_documents(
    artifact: &mut RebuiltV3DocumentSetArtifact,
) -> Result<RebuiltV3AssetIndex, RebuiltV3DocumentSetError> {
    let mut scenario: RebuiltV3ScenarioDocument =
        serde_json::from_slice(&artifact.scenario_json)
            .map_err(|error| RebuiltV3DocumentSetError::Serialization(error.to_string()))?;
    let mut assets: RebuiltV3AssetIndex = serde_json::from_slice(&artifact.asset_index_json)
        .map_err(|error| RebuiltV3DocumentSetError::Serialization(error.to_string()))?;
    align_document_schema(
        7,
        &mut artifact.content,
        &mut artifact.world,
        &mut scenario,
        &mut assets,
    )?;
    artifact.scenario_json = canonical_json_bytes(&scenario)
        .map_err(|error| RebuiltV3DocumentSetError::Serialization(error.to_string()))?;
    artifact.asset_index_json = canonical_json_bytes(&assets)
        .map_err(|error| RebuiltV3DocumentSetError::Serialization(error.to_string()))?;
    Ok(assets)
}
