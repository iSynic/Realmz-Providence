use super::*;
use crate::model::{BlobId, ProjectOrigin, SourcedItemRule};
use crate::references::{FieldPath, ReferenceDescriptor, ResolutionState, TargetKind};

fn fixture() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("stock-defaults".into()));
    let mut item = crate::codecs::new_scenario_item_definition(0).unwrap();
    item.id = StableId("classic.item.662".into());
    item.classic_id = 662;
    item.item_type = 23;
    item.special[4] = 69;
    snapshot.item_rules.push(SourcedItemRule {
        source: "controlled Stock item".into(),
        source_blob: BlobId("items".into()),
        text_source_blob: BlobId("names".into()),
        definition: item,
    });
    snapshot.standard_spells =
        crate::codecs::decode_standard_spells(&vec![0; crate::codecs::STANDARD_SPELL_BYTES], None)
            .spells;
    snapshot.standard_spells[0].definition.special = 58;
    snapshot.standard_spells[0].definition.spell_class = 9;
    snapshot
}

#[test]
fn unused_exact_stock_defaults_are_details_without_changing_truth_or_diagnostics() {
    let snapshot = fixture();
    let items = vec![snapshot.item_rules[0].definition.clone()];
    let spells = vec![snapshot.standard_spells[0].definition.clone()];
    let session = EditorSession::new(snapshot.clone());
    let raw = session.diagnostics();
    assert_eq!(raw.len(), 2);
    let findings = Findings::derive_with_standard_catalog(
        &snapshot,
        raw.clone(),
        &session.references(),
        None,
        StandardCatalog {
            items: &items,
            spells: &spells,
        },
    );
    assert!(findings.view(false, None).unwrap().rows().is_empty());
    let all = findings.view(true, None).unwrap();
    assert_eq!(all.rows().len(), 2);
    for row in all.rows() {
        assert_eq!(
            all.row(row).target_impact,
            FindingImpact::PreservationDetail
        );
        assert!(all.row(row).preservation_reason.unwrap().contains("Stock"));
    }
    assert_eq!(session.snapshot(), &snapshot);
    assert_eq!(session.diagnostics(), raw);
    assert_eq!(derive(&session).view(false, None).unwrap().rows().len(), 2);
}

#[test]
fn changed_imported_or_called_definitions_remain_actionable() {
    let original = fixture();
    let items = vec![original.item_rules[0].definition.clone()];
    let spells = vec![original.standard_spells[0].definition.clone()];
    for case in [
        "changed",
        "authored",
        "imported",
        "source",
        "called",
        "native-called",
    ] {
        let snapshot = changed_snapshot(&original, case);
        let session = EditorSession::new(snapshot);
        let mut refs = session.references();
        append_callers(&mut refs, case, &items[0], &spells[0]);
        let findings = Findings::derive_with_standard_catalog(
            session.snapshot(),
            session.diagnostics(),
            &refs,
            None,
            StandardCatalog {
                items: &items,
                spells: &spells,
            },
        );
        assert_eq!(
            findings.view(false, None).unwrap().rows().len(),
            if case == "authored" { 1 } else { 2 },
            "{case}"
        );
    }
}

fn changed_snapshot(original: &ProjectSnapshot, case: &str) -> ProjectSnapshot {
    let mut snapshot = original.clone();
    match case {
        "changed" => {
            snapshot.item_rules[0].definition.cost += 1;
            snapshot.standard_spells[0].definition.cost += 1;
        }
        "authored" => {
            snapshot.item_rules.clear();
            snapshot.standard_spells[0].definition.authored = true;
        }
        "imported" => {
            snapshot.origin = ProjectOrigin::Imported {
                compatibility_annex: BlobId("annex".into()),
            }
        }
        "source" => {
            for path in ["Data ID", "Data S"] {
                snapshot
                    .classic_sources
                    .push(crate::model::ClassicSourceBlob {
                        native_path: path.into(),
                        blob: BlobId("source".into()),
                        byte_length: 1,
                    });
            }
        }
        _ => {}
    }
    snapshot
}

fn append_callers(
    refs: &mut Vec<ReferenceDescriptor>,
    case: &str,
    item: &crate::model::ItemRuleDefinition,
    spell: &crate::model::SpellDefinition,
) {
    if case.ends_with("called") {
        for (kind, stable, native) in [
            (TargetKind::Item, item.id.clone(), item.classic_id),
            (TargetKind::Spell, spell.id.clone(), spell.classic_id),
        ] {
            refs.push(ReferenceDescriptor {
                source: StableId("caller".into()),
                field: FieldPath("target".into()),
                target_kind: kind,
                target_id: if case == "native-called" {
                    native.to_string()
                } else {
                    stable.0
                },
                required: true,
                stock_fallback: None,
                resolution: ResolutionState::Resolved,
                repair_actions: vec![],
                byte_provenance: None,
            });
        }
    }
}
