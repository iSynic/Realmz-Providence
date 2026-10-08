use super::*;

#[test]
fn temporary_exclusions_preserve_global_counts_and_filter_before_paging() {
    let rows = (0..150)
        .map(|id| Diagnostic {
            code: if id < 140 {
                "reference.message.missing"
            } else {
                "reference.item.missing"
            }
            .into(),
            severity: if id == 149 {
                Severity::Error
            } else {
                Severity::Warning
            },
            entity: Some(StableId(format!("xap:{id}"))),
            field: Some(FieldPath("target".into())),
            message: "Missing target".into(),
        })
        .collect::<Vec<_>>();
    let params = json!({"excludedCodes":["reference.item.missing"],
        "excludedFindings":[{"code":"reference.message.missing","entity":"xap:0","field":"target"}],
        "offset":128,"limit":128});
    let page = project(&rows, Revision(1), 0, &params).unwrap();
    assert_eq!(page["total"], 139);
    assert_eq!(page["items"].as_array().unwrap().len(), 11);
    assert_eq!(page["items"][0]["entity"], "xap:129");
    assert_eq!(page["temporaryHiddenCount"], 11);
    assert_eq!(page["unfilteredTotal"], 150);
    assert_eq!(page["unfilteredCounts"]["errors"], 1);
    assert_eq!(page["availableCodes"].as_array().unwrap().len(), 2);
    let restored = project(&rows, Revision(1), 0, &json!({"limit":128})).unwrap();
    assert_eq!(restored["total"], 150);
    assert_eq!(restored["temporaryHiddenCount"], 0);
    assert_eq!(restored["unfilteredCounts"], page["unfilteredCounts"]);
}

#[test]
fn filter_requests_are_bounded_and_strict() {
    for params in [
        json!({"excludedCodes":"all"}),
        json!({"excludedFindings":[{"unknown":1}]}),
        json!({"excludedCodes":vec!["same";4097]}),
    ] {
        assert!(project(vec![], Revision(0), 0, &params).is_err());
    }
}
