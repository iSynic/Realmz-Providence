//! Read-only identities precede project startup and never acquire a writer.
pub(crate) fn cli(arguments: &[String]) -> Option<String> {
    let [mode] = arguments else { return None };
    Some(match mode.as_str() {
        "build-identity" => serde_json::to_string_pretty(
            &providence_core::build_identity::current("providence-native-adapter"),
        )
        .expect("build identity serializes"),
        "session-contract-identity" => providence_session_client::authority_identity().to_string(),
        _ => return None,
    })
}
