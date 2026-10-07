pub(super) fn prompt(label: &str, storage: Option<&str>) -> (String, String) {
    let source = if storage == Some("option-labels") {
        "an option-label record"
    } else {
        "a scenario string"
    };
    (
        label.into(),
        format!(
            "Custom answer text from {source}. The Choice text mode controls both labels together."
        ),
    )
}
