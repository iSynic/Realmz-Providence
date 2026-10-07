use providence_core::{
    rebuilt::ApplicationMediaCatalog,
    session::{EditorSession, Revision},
    validation::findings::Findings as FindingIndex,
};
use serde_json::{Value, json};

pub(crate) struct Findings(FindingIndex);

impl Findings {
    pub(crate) fn collect(
        session: &EditorSession,
        media: Option<&ApplicationMediaCatalog>,
    ) -> Self {
        Self(FindingIndex::derive(
            session.snapshot(),
            session.diagnostics(),
            &session.references(),
            media,
        ))
    }

    pub(crate) fn project(&self, revision: Revision, params: &Value) -> Result<Value, String> {
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
