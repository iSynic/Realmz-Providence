use providence_core::{
    rebuilt::ApplicationMediaCatalog,
    session::{EditorSession, Revision},
    validation::findings::Findings as FindingIndex,
};
use serde_json::{Value, json};

pub(crate) struct Findings(FindingIndex);

pub(crate) fn list(
    session: &EditorSession,
    catalogs: crate::catalogs::CatalogViews<'_>,
    params: &Value,
) -> Result<Value, String> {
    Findings::collect_with_standard_catalog(
        session,
        catalogs.application_media,
        providence_core::validation::findings::StandardCatalog {
            items: catalogs
                .stock_items
                .map(|stock| stock.definitions.as_slice())
                .unwrap_or_default(),
            spells: catalogs
                .stock_spells
                .map(|stock| stock.definitions.as_slice())
                .unwrap_or_default(),
        },
    )
    .project(
        session.revision(),
        params,
        &uncalled_records(session, params),
    )
}

impl Findings {
    pub(crate) fn collect(
        session: &EditorSession,
        media: Option<&ApplicationMediaCatalog>,
    ) -> Self {
        Self::collect_with_standard_catalog(session, media, Default::default())
    }

    pub(crate) fn collect_with_standard_catalog(
        session: &EditorSession,
        media: Option<&ApplicationMediaCatalog>,
        stock: providence_core::validation::findings::StandardCatalog<'_>,
    ) -> Self {
        Self(FindingIndex::derive_with_standard_catalog(
            session.snapshot(),
            session.diagnostics(),
            &session.references(),
            media,
            stock,
        ))
    }

    pub(crate) fn project(
        &self,
        revision: Revision,
        params: &Value,
        uncalled: &std::collections::BTreeSet<providence_core::model::StableId>,
    ) -> Result<Value, String> {
        let show_all = match params.get("showAll") {
            None | Some(Value::Null) => false,
            Some(Value::Bool(value)) => *value,
            _ => return Err("showAll must be a boolean".into()),
        };
        let view = self.0.view(
            show_all,
            params.get("groupIdentity").and_then(Value::as_str),
        )?;
        let mut page = crate::validation_listing::project_with_rows(
            view.rows(),
            revision,
            self.0.application_fallbacks(),
            params,
            |finding, query| view.members_match(finding, query),
            |finding| {
                finding
                    .entity
                    .as_ref()
                    .is_some_and(|id| uncalled.contains(id))
            },
            |finding| serde_json::to_value(view.row(finding)).expect("finding row"),
        )?;
        page["allFindingCount"] = json!(self.0.all_count());
        page["hiddenDetailCount"] = json!(self.0.hidden_detail_count());
        page["showAll"] = json!(show_all);
        let occurrences = view.occurrence_counts();
        page["occurrenceCounts"] = counts_value(occurrences.total);
        for group in page["groups"].as_array_mut().expect("listing groups") {
            let counts = occurrences
                .by_code
                .get(group["code"].as_str().unwrap_or(""))
                .copied()
                .unwrap_or_default();
            group["occurrenceCounts"] = counts_value(counts);
            group["occurrenceTotal"] = json!(counts.iter().sum::<usize>());
        }
        Ok(page)
    }
}

fn counts_value(counts: [usize; 3]) -> Value {
    json!({"errors":counts[0], "warnings":counts[1], "information":counts[2]})
}

#[cfg(test)]
mod tests;

// Build the shared caller index only when this optional view filter is requested.
pub(crate) fn uncalled_records(
    session: &EditorSession,
    params: &Value,
) -> std::collections::BTreeSet<providence_core::model::StableId> {
    if params.get("hideUncalledWarnings").and_then(Value::as_bool) == Some(true) {
        providence_core::validation::findings::callers::records_without_callers(session.discovery())
    } else {
        Default::default()
    }
}
