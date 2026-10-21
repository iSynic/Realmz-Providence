use super::*;
pub(super) fn fields(method: &str) -> Vec<(&'static str, Value)> {
    if method == "project.inspect-classic-scenario-import"
        || method == "project.import-classic-scenario.begin"
    {
        return vec![
            ("directory", text(4096)),
            ("applicationDataDirectory", text(4096)),
            ("startupFile", text(255)),
        ];
    }
    if method.starts_with("project.import-classic-scenario.") {
        return vec![("jobId", integer(1, i64::MAX))];
    }
    if matches!(
        method,
        "classic-rule-selection.set" | "classic-rule-selection.clear"
    ) {
        let mut fields = vec![
            ("expectedProjectId", identity()),
            (
                "expectedPreviousIdentity",
                json!({"type":["string","null"],"maxLength":80}),
            ),
            (
                "expectedSourceSetSha256",
                json!({"type":"string","minLength":64,"maxLength":64}),
            ),
        ];
        if method.ends_with(".set") {
            fields.push(("nativeMenuSelection", integer(1, 32767)));
        }
        return fields;
    }
    vec![]
}
