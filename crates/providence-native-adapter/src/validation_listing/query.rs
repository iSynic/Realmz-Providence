use super::*;

#[derive(Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(deny_unknown_fields)]
struct FindingSelection {
    code: String,
    entity: Option<String>,
    field: Option<String>,
}

impl FindingSelection {
    fn matches(&self, diagnostic: &Diagnostic) -> bool {
        self.code == diagnostic.code
            && self.entity.as_deref() == diagnostic.entity.as_ref().map(|id| id.0.as_str())
            && self.field.as_deref() == diagnostic.field.as_ref().map(|field| field.0.as_str())
    }
}

pub(super) struct Query {
    pub text: String,
    pub hide_uncalled_warnings: bool,
    code: String,
    category: String,
    pub severity: Option<Severity>,
    selection: Option<FindingSelection>,
    locate: bool,
    clamp: bool,
    offset: usize,
    pub limit: usize,
    pub group_offset: usize,
    pub group_limit: usize,
    excluded_codes: std::collections::BTreeSet<String>,
    excluded_findings: std::collections::BTreeSet<FindingSelection>,
}

impl Query {
    pub fn parse(params: &Value) -> Result<Self, String> {
        let text = text_parameter(params, "query")?.to_lowercase();
        let code = text_parameter(params, "code")?.to_owned();
        let category = text_parameter(params, "category")?.to_owned();
        if !category.is_empty() && !CATEGORIES.iter().any(|(id, _)| *id == category) {
            return Err("unknown diagnostic category".into());
        }
        let severity = match params.get("severity") {
            None | Some(Value::Null) => None,
            Some(value) => Some(
                serde_json::from_value::<Severity>(value.clone())
                    .map_err(|_| "severity must be error, warning or information".to_string())?,
            ),
        };
        let selection = params
            .get("selection")
            .filter(|value| !value.is_null())
            .map(|value| {
                serde_json::from_value::<FindingSelection>(value.clone()).map_err(|_| {
                    "selection must identify a diagnostic code, entity and field".to_string()
                })
            })
            .transpose()?;
        Ok(Self {
            text,
            hide_uncalled_warnings: boolean_parameter(params, "hideUncalledWarnings")?,
            code,
            category,
            severity,
            selection,
            locate: boolean_parameter(params, "locateSelection")?,
            clamp: boolean_parameter(params, "clampOffset")?,
            offset: number_parameter(params, "offset", 0),
            limit: number_parameter(params, "limit", 64).clamp(1, 128),
            group_offset: number_parameter(params, "groupOffset", 0),
            group_limit: number_parameter(params, "groupLimit", 32).clamp(1, 64),
            excluded_codes: exclusion_set(params, "excludedCodes")?,
            excluded_findings: exclusion_set(params, "excludedFindings")?,
        })
    }

    pub fn excludes(&self, diagnostic: &Diagnostic) -> bool {
        self.excluded_codes.contains(&diagnostic.code)
            || self.excluded_findings.contains(&FindingSelection {
                code: diagnostic.code.clone(),
                entity: diagnostic.entity.as_ref().map(|id| id.0.clone()),
                field: diagnostic.field.as_ref().map(|field| field.0.clone()),
            })
    }

    pub fn in_group(&self, diagnostic: &Diagnostic) -> bool {
        (self.code.is_empty() || diagnostic.code == self.code)
            && (self.category.is_empty() || category(&diagnostic.code) == self.category)
    }

    pub fn selected_index(&self, rows: &[&Diagnostic]) -> Option<usize> {
        let mut indices = rows
            .iter()
            .enumerate()
            .filter(|(_, finding)| {
                self.selection
                    .as_ref()
                    .is_some_and(|selection| selection.matches(finding))
            })
            .map(|(index, _)| index);
        let first = indices.next();
        // Ambiguous identities cannot silently select a different finding.
        first.filter(|_| indices.next().is_none())
    }

    pub fn page_offset(&self, total: usize, selection: Option<usize>) -> usize {
        let mut offset = self.offset;
        if self.locate
            && let Some(index) = selection
        {
            offset = index / self.limit * self.limit;
        }
        if self.clamp && offset >= total {
            offset = total.saturating_sub(1) / self.limit * self.limit;
        }
        offset
    }
}

fn exclusion_set<T: serde::de::DeserializeOwned + Ord>(
    params: &Value,
    key: &str,
) -> Result<std::collections::BTreeSet<T>, String> {
    let Some(value) = params.get(key) else {
        return Ok(Default::default());
    };
    if !value.as_array().is_some_and(|items| items.len() <= 4096) {
        return Err(format!(
            "{key} must be an array of at most 4096 temporary filters"
        ));
    }
    serde_json::from_value(value.clone()).map_err(|_| format!("Invalid {key} filter"))
}

fn text_parameter<'a>(params: &'a Value, key: &str) -> Result<&'a str, String> {
    match params.get(key) {
        None | Some(Value::Null) => Ok(""),
        Some(Value::String(value)) => Ok(value.trim()),
        _ => Err(format!("{key} must be a string")),
    }
}

fn boolean_parameter(params: &Value, key: &str) -> Result<bool, String> {
    match params.get(key) {
        None | Some(Value::Null) => Ok(false),
        Some(Value::Bool(value)) => Ok(*value),
        _ => Err(format!("{key} must be a boolean")),
    }
}

fn number_parameter(params: &Value, key: &str, default: u64) -> usize {
    params.get(key).and_then(Value::as_u64).unwrap_or(default) as usize
}
