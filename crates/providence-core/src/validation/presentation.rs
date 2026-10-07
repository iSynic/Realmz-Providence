use super::Severity;
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum FindingImpact {
    ExportBlocker,
    AuthoringRuntimeWarning,
    PresentationWarning,
    PreservationDetail,
}

/// Display relevance never changes compiler eligibility or native source data.
/// Validate and Publish use this policy after deriving their target context.
pub fn impact(code: &str, severity: Severity, unused: bool, presentation: bool) -> FindingImpact {
    if unused
        || matches!(
            code,
            "source.partial-record.preserved" | "item.caste.unmatchable-preserved"
        )
    {
        FindingImpact::PreservationDetail
    } else if severity == Severity::Error {
        FindingImpact::ExportBlocker
    } else if presentation
        || code.starts_with("reference.icon.")
        || code.starts_with("reference.picture.")
        || code.starts_with("reference.landlook.")
        || code.starts_with("reference.special-land-tile.")
    {
        FindingImpact::PresentationWarning
    } else {
        FindingImpact::AuthoringRuntimeWarning
    }
}
