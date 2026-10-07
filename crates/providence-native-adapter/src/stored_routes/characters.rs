//! External rule and spell catalogs used by Characters & Magic requests.
use super::{rule_references, spell_references};
use crate::catalogs::CatalogViews;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use serde_json::Value;

pub(super) enum Request {
    RuleSelectionPreview,
    RuleReferences,
    RuleCatalog,
    RuleDraft,
    SpellReferences,
    SpellCatalog,
    SpellDraft,
}

pub(super) fn resolve(method: &str) -> Option<Request> {
    Some(match method {
        "classic-rule-selection.preview" => Request::RuleSelectionPreview,
        "rule-reference.list" | "rule-reference.preview" => Request::RuleReferences,
        "rule.catalog" | "rule.open-authoring" | "rule.used-by" => Request::RuleCatalog,
        "rule.allocation.review"
        | "rule.clear.review"
        | "rule.draft.prepare"
        | "rule.draft.apply" => Request::RuleDraft,
        "spell-reference.list" | "spell-reference.preview" => Request::SpellReferences,
        "spell.catalog" | "spell.open-authoring" => Request::SpellCatalog,
        "spell.allocation.review"
        | "spell.clear.review"
        | "spell.draft.prepare"
        | "spell.draft.apply" => Request::SpellDraft,
        _ => return None,
    })
}

impl Request {
    pub(super) fn dispatch(
        self,
        session: &mut EditorSession,
        store: Option<&ProjectStore>,
        catalogs: CatalogViews<'_>,
        method: &str,
        params: &Value,
    ) -> Result<Value, String> {
        match self {
            Self::RuleSelectionPreview => {
                crate::classic_rule_preview::preview(session, store, catalogs, params)
            }
            Self::RuleReferences => {
                rule_references::dispatch(session, store, catalogs, method, params)
            }
            Self::RuleCatalog => {
                crate::rule_catalog::dispatch(session, store, catalogs, method, params)
            }
            Self::RuleDraft => {
                crate::rule_drafts::dispatch(session, store, catalogs, method, params)
            }
            Self::SpellReferences => {
                spell_references::dispatch(session, store, catalogs, method, params)
            }
            Self::SpellCatalog => {
                crate::spell_catalog::dispatch(session, catalogs.stock_spells, method, params)
            }
            Self::SpellDraft => {
                crate::spell_drafts::dispatch(session, store, catalogs.stock_spells, method, params)
            }
        }
    }
}
