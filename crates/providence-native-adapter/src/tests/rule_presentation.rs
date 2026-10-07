use super::*;

fn assert_populated_rows(
    snapshot: &ProjectSnapshot,
    store: &ProjectStore,
    stock: &StockRules,
    kind: &str,
    ids: [u8; 2],
) {
    let response = request(
        snapshot,
        store,
        stock,
        "rule.catalog",
        json!({"kind":kind,"source":"scenario"}),
    );
    assert_eq!(response["ok"], true, "{response}");
    let rows = response["result"]["items"].as_array().unwrap();
    assert_eq!(rows.len(), 30);
    for id in ids {
        let row = rows.iter().find(|row| row["classicId"] == id).unwrap();
        assert_eq!(row["authorId"], id - 1);
        assert_eq!(row["recordContent"], "populated");
        assert_eq!(row["identity"], format!("classic.{kind}.{id}"));
        assert_eq!(
            row["displayName"],
            format!(
                "Custom {} {}",
                if kind == "race" { "Race" } else { "Caste" },
                id - 1
            )
        );
        let open = request(
            snapshot,
            store,
            stock,
            "rule.open-authoring",
            json!({"kind":kind,"classicId":id,"source":"scenario"}),
        );
        assert_eq!(open["result"]["authorId"], id - 1);
        assert_eq!(open["result"]["recordContent"], "populated");
        assert_eq!(open["result"]["draft"]["edit"]["definition"]["name"], "");
    }
    assert_eq!(rows[29]["recordContent"], "empty");
    assert_eq!(
        rows[29]["ownership"], "scenario",
        "An empty imported record is still retained, never overwritable vacancy"
    );
}

#[test]
fn unnamed_populated_custom_rows_keep_author_numbers_identity_and_source_bytes() {
    let (_temp, store, mut snapshot, stock) = fixture();
    let mut race = vec![0; 408 * 30];
    for index in [19, 20] {
        race[index * 408 + 197] = 12;
    }
    race[21 * 408 + 208] = 1;
    let mut caste = vec![0; 576 * 30];
    for index in [20, 21] {
        caste[index * 576 + 217] = 15;
        caste[index * 576 + 219] = 10;
    }
    let race_blob = store.put_blob(&race).unwrap();
    let caste_blob = store.put_blob(&caste).unwrap();
    snapshot.race_rules = decode_race_rules(&race, Some(race_blob.clone())).rules;
    snapshot.caste_rules = decode_caste_rules(&caste, Some(caste_blob.clone())).rules;
    snapshot.classic_sources[0].blob = race_blob.clone();
    snapshot.classic_sources[1].blob = caste_blob.clone();
    for (kind, ids) in [("race", [20, 21]), ("caste", [21, 22])] {
        assert_populated_rows(&snapshot, &store, &stock, kind, ids);
    }
    let catalog = request(
        &snapshot,
        &store,
        &stock,
        "rule.catalog",
        json!({"kind":"race","source":"scenario"}),
    );
    assert_eq!(
        catalog["result"]["items"][21]["recordContent"],
        "eligibility-only"
    );
    assert_eq!(store.read_blob(&race_blob).unwrap(), race);
    assert_eq!(store.read_blob(&caste_blob).unwrap(), caste);
    let search = request(
        &snapshot,
        &store,
        &stock,
        "discovery.search",
        json!({"expectedRevision":0,"projectId":snapshot.project_id,"scope":"scenario","query":"race 19","kind":"race"}),
    );
    assert_eq!(
        search["result"]["items"][0]["record"]["identity"],
        "classic.race.20"
    );
    assert_eq!(search["result"]["items"][0]["record"]["authorId"], 19);
}

#[test]
fn authoring_list_combines_standard_and_custom_without_masking_selected_overrides() {
    let (_temp, store, snapshot, stock) = fixture();
    for kind in ["race", "caste"] {
        let params = json!({"kind":kind,"classicId":1,"source":"authoring"});
        let standard = request(
            &snapshot,
            &store,
            &stock,
            "rule.open-authoring",
            params.clone(),
        );
        assert_eq!(standard["result"]["ownership"], "stock");
        assert_eq!(standard["result"]["recordContent"], "populated");
        let id = if kind == "race" { 20 } else { 21 };
        let custom = request(
            &snapshot,
            &store,
            &stock,
            "rule.open-authoring",
            json!({"kind":kind,"classicId":id,"source":"authoring"}),
        );
        assert_eq!(custom["result"]["ownership"], "scenario");
        assert_eq!(
            custom["result"]["draft"]["edit"]["definition"]["classicId"],
            id
        );
        let rows = request(
            &snapshot,
            &store,
            &stock,
            "rule.catalog",
            json!({"kind":kind,"source":"authoring"}),
        );
        assert_eq!(rows["result"]["total"], 30);
        assert_eq!(rows["result"]["items"][0]["ownership"], "stock");
        assert_eq!(rows["result"]["items"][id - 1]["ownership"], "scenario");
    }
}

#[test]
fn authoring_view_respects_castle_menu_source_policy_for_zero_tables() {
    let (_temp, store, mut snapshot, stock) = fixture();
    selection(&mut snapshot, 10);
    let stock_row = request(
        &snapshot,
        &store,
        &stock,
        "rule.open-authoring",
        json!({"kind":"caste","classicId":1,"source":"authoring"}),
    );
    assert_eq!(
        stock_row["result"]["ownership"], "stock",
        "COB's normal menu entry ignores present zeroed scenario tables"
    );
    selection(&mut snapshot, 20);
    let scenario_row = request(
        &snapshot,
        &store,
        &stock,
        "rule.open-authoring",
        json!({"kind":"caste","classicId":1,"source":"authoring"}),
    );
    assert_eq!(scenario_row["result"]["ownership"], "scenario");
    assert_eq!(
        scenario_row["result"]["recordContent"], "empty",
        "Third-party whole-file overrides must remain visible, even when zeroed"
    );
}
