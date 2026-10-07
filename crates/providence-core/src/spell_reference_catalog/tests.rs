use super::*;
use crate::model::StableId;
use crate::session::spell_authoring::new_scenario_spell;

fn asset(id: i32, kind: &str, resource_type: &str) -> AssetDescriptor {
    serde_json::from_value(serde_json::json!({"identity":format!("scenario:{resource_type}:{id}"),"label":format!("Resource {id}"),
        "kind":kind,"mimeType":if kind=="sound"{"audio/wav"}else{"image/png"},"classicResource":{"resourceType":resource_type,"resourceId":id},
        "blob":"preview","byteLength":4,"classicPayloadBlob":"native","classicPayloadByteLength":5,"width":640,"height":640,"source":"controlled descriptor"})).unwrap()
}
fn snapshot() -> ProjectSnapshot {
    ProjectSnapshot::new_authored(StableId("spell-picker".into()))
}
fn query(field: &str, current: i32, search: &str) -> SpellReferenceQuery {
    SpellReferenceQuery {
        field: field.into(),
        current_value: current,
        search: search.into(),
        ownership: "all".into(),
        show_unavailable: false,
        offset: 0,
        seek_current: true,
        limit: 64,
    }
}

#[test]
fn default_and_explicit_animation_keep_distinct_stored_identities_and_exact_frames() {
    let mut snapshot = snapshot();
    snapshot
        .assets
        .extend((12032..12040).map(|id| asset(id, "icon", "cicn")));
    let page = spell_reference_choices(
        &snapshot,
        None,
        &new_scenario_spell(0).unwrap(),
        &query("lookEnd", 0, "12032"),
    )
    .unwrap();
    assert_eq!(
        page.items.iter().map(|row| row.value).collect::<Vec<_>>(),
        vec![0, 5]
    );
    assert_ne!(page.items[0].identity, page.items[1].identity);
    assert_eq!(page.items[0].resources.len(), 8);
    assert_eq!(
        page.items[0].resources[0].identity.as_deref(),
        Some("scenario:cicn:12032")
    );
    snapshot
        .assets
        .retain(|row| row.classic_resource.as_ref().unwrap().resource_id != 12035);
    let choice = spell_reference_choice(&snapshot, None, "lookEnd", 0).unwrap();
    assert!(!choice.available);
    assert!(choice.reason.contains("12035"));
    assert!(
        spell_reference_choices(
            &snapshot,
            None,
            &new_scenario_spell(0).unwrap(),
            &query("lookEnd", 0, "no matches")
        )
        .unwrap()
        .items
        .is_empty()
    );
}

#[test]
fn source_filter_does_not_treat_default_animation_zero_as_resource_free() {
    let snapshot = snapshot();
    let definition = new_scenario_spell(0).unwrap();
    let mut animation = query("lookEnd", 0, "");
    animation.ownership = "scenario".into();
    let page = spell_reference_choices(&snapshot, None, &definition, &animation).unwrap();
    assert!(page.items.is_empty());
    let mut sound = query("soundStart", 0, "");
    sound.ownership = "scenario".into();
    let page = spell_reference_choices(&snapshot, None, &definition, &sound).unwrap();
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].value, 0);
    assert!(page.items[0].available);
    assert!(page.items[0].resources.is_empty());
}

#[test]
fn queue_preview_requires_the_complete_exact_atlas_and_uses_source_tile_coordinates() {
    let mut snapshot = snapshot();
    snapshot.assets.push(asset(302, "tileset", "PICT"));
    for (value, rect) in [
        (1, [0, 320, 32, 32]),
        (10, [288, 320, 32, 32]),
        (200, [608, 608, 32, 32]),
    ] {
        let row = spell_reference_choice(&snapshot, None, "queueIcon", value).unwrap();
        assert!(row.available);
        assert_eq!(row.tile_rect, Some(rect));
        assert_eq!(row.resources[0].resource_id, 302);
    }
    assert!(
        spell_reference_choice(&snapshot, None, "queueIcon", 0)
            .unwrap()
            .resources
            .is_empty()
    );
    assert!(
        !spell_reference_choice(&snapshot, None, "queueIcon", 201)
            .unwrap()
            .available
    );
    snapshot.assets[0].width = Some(64);
    assert!(
        !spell_reference_choice(&snapshot, None, "queueIcon", 10)
            .unwrap()
            .available
    );
    snapshot.assets[0].width = Some(640);
    snapshot.assets.push(snapshot.assets[0].clone());
    assert!(
        spell_reference_choice(&snapshot, None, "queueIcon", 10)
            .unwrap()
            .reason
            .contains("ambiguous")
    );
}

#[test]
fn sounds_use_positive_byte_offset_and_summon_selection_is_contextual() {
    let mut snapshot = snapshot();
    snapshot.assets.push(asset(601, "sound", "snd "));
    let row = spell_reference_choice(&snapshot, None, "soundStart", 1).unwrap();
    assert!(row.available);
    assert_eq!(row.resources[0].resource_id, 601);
    assert!(
        spell_reference_choice(&snapshot, None, "soundStart", 0)
            .unwrap()
            .resources
            .is_empty()
    );
    assert!(
        spell_reference_choice(&snapshot, None, "lookStart", 0)
            .unwrap()
            .resources
            .is_empty()
    );
    let mut definition = new_scenario_spell(0).unwrap();
    assert!(
        spell_reference_choices(&snapshot, None, &definition, &query("spellClass", 0, "")).is_err()
    );
    definition.special = 58;
    let page =
        spell_reference_choices(&snapshot, None, &definition, &query("spellClass", 0, "")).unwrap();
    assert_eq!(page.items.len(), 1);
    assert!(page.items[0].available);
    assert!(page.items[0].label.contains("Random"));
    assert!(page.items[0].target_identity.is_none());
}
