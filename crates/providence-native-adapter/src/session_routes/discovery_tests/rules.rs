use super::read;
use providence_core::{
    codecs::{decode_caste_rules, decode_race_rules},
    model::{BlobId, ProjectSnapshot, RuleNameCatalog, StableId},
    session::EditorSession,
};
use serde_json::json;

#[test]
fn discovery_rule_permissions_remain_exact_without_recursive_matrix_expansion() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("rule-links".into()));
    snapshot.race_rules = decode_race_rules(&vec![0; 30 * 408], None).rules;
    snapshot.caste_rules = decode_caste_rules(&vec![0; 30 * 576], None).rules;
    for race in &mut snapshot.race_rules {
        race.definition.eligible_caste_ids = (1..=10)
            .map(|id| StableId(format!("classic.caste.{id}")))
            .collect();
    }
    for caste in &mut snapshot.caste_rules {
        caste.definition.eligible_race_ids = (1..=30)
            .map(|id| StableId(format!("classic.race.{id}")))
            .collect();
    }
    let mut names = RuleNameCatalog {
        source: "controlled".into(),
        source_blob: BlobId("controlled".into()),
        race_resource_id: 0,
        caste_resource_id: 0,
        race_names: vec![String::new(); 30],
        caste_names: vec![String::new(); 30],
    };
    names.race_names[19] = "Dune Walker".into();
    snapshot.rule_names = Some(names);
    let mut session = EditorSession::new(snapshot);
    let trace = read(
        &mut session,
        "discovery.trace",
        json!({"kind":"race","id":"20","depthLimit":32}),
    );
    assert_eq!(trace["trace"]["total"], 30);
    assert_eq!(trace["trace"]["workLimited"], false);
    for row in trace["trace"]["items"].as_array().unwrap() {
        assert_eq!(row["link"]["targetLabel"], "Dune Walker");
        assert_eq!(row["link"]["meaning"], "Permits this combination");
        assert_eq!(row["depth"], 1);
    }
    let links = read(
        &mut session,
        "discovery.links",
        json!({"kind":"caste","id":"1","direction":"incoming"}),
    );
    assert_eq!(links["total"], 30);
    assert!(
        links["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|row| !row["targetLabel"].as_str().unwrap().is_empty())
    );
}
