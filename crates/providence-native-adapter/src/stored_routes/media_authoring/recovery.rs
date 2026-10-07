use super::*;

pub(super) fn read(
    session: &mut EditorSession,
    project: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    params: &Value,
) -> Result<Value, String> {
    let method = required_string(params, "method")?;
    if !matches!(
        method.as_str(),
        "session.describe"
            | "media.open"
            | "media.library.list"
            | "personal-library.describe"
            | "personal-library.collections"
            | "personal-library.list"
            | "personal-library.open"
            | "personal-library.preview"
            | "project-asset.list"
            | "project-asset.open"
            | "application-media.list"
            | "application-media.preview"
            | "reference-catalog.preview"
            | "reference-catalog.describe"
            | "picture.preview"
            | "icon.preview"
            | "sound.preview"
            | "special-land.preview"
            | "text-resource.open"
            | "text-resource.resolve-exact"
    ) {
        return Err("Recovery browsing permits media reads only. Reconcile the original result before changing content.".into());
    }
    let arguments = params.get("params").cloned().unwrap_or_else(|| json!({}));
    // The allowlist excludes every mutation and receipt operation.
    crate::stored_routes::dispatch(session, project, catalogs, None, &method, arguments)
}
