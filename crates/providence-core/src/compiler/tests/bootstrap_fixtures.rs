use super::*;

pub(super) fn contact() -> (ProjectSnapshot, Vec<u8>, Vec<u8>, Vec<u8>) {
    let mut startup = vec![0; crate::codecs::SCENARIO_STARTUP_BYTES];
    startup[0..4].copy_from_slice(&1_i32.to_be_bytes());
    startup[4..8].copy_from_slice(&10_i32.to_be_bytes());
    startup[12..16].copy_from_slice(&2_i32.to_be_bytes());
    startup[16..20].copy_from_slice(&3_i32.to_be_bytes());
    startup[60] = 5;
    startup[61..66].copy_from_slice(b"Jared");
    let mut restrictions = vec![0; crate::codecs::SCENARIO_RESTRICTIONS_BYTES];
    restrictions[258..260].copy_from_slice(&10_i16.to_be_bytes());
    let mut contact_source = vec![0xa5; crate::codecs::SCENARIO_CONTACT_INFO_BYTES];
    for slot in 0..18 {
        let start = slot * crate::codecs::SCENARIO_CONTACT_INFO_SLOT_BYTES;
        contact_source[start] = 3;
        contact_source[start + 1..start + 4].copy_from_slice(b"xyz");
    }

    let decoded =
        crate::codecs::decode_scenario_startup("Scenario Folder", &startup, &restrictions).unwrap();
    let mut campaign = decoded.campaign;
    crate::codecs::decode_scenario_contact_info(&contact_source)
        .unwrap()
        .apply_to_campaign(&mut campaign);
    let mut snapshot = ProjectSnapshot::new_authored(StableId("contact-compile".into()));
    snapshot.campaign = Some(campaign);
    snapshot.start_location = Some(decoded.start_location);
    snapshot.world.maps.push(MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: "Compiler Map".into(),
        tiles: vec![0; CLASSIC_MAP_SIZE * CLASSIC_MAP_SIZE],
        runtime: None,
    });
    snapshot.messages.push(ScenarioMessage {
        identity: StableId("message:0".into()),
        native_id: NativeRecordId(0),
        text: "Compiler anchor".into(),
        authored: true,
    });
    (snapshot, startup, restrictions, contact_source)
}
