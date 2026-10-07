//! Browsing an application table never replaces retained scenario authoring truth.
use crate::{
    rule_catalog::{self, RuleSources},
    stock_rules::StockRules,
};
use providence_core::{
    model::{ProjectOrigin, ProjectSnapshot},
    rebuilt::selected_classic_rule_sources,
    session::rule_authoring::RuleKind,
};
use serde_json::{Value, json};

pub(crate) struct RuleDocumentTarget {
    pub kind: RuleKind,
    pub id: u8,
}

pub(crate) struct RuleViewSource {
    pub application: bool,
    pub standard_application: bool,
    pub requested: String,
    pub notice: String,
    pub configured: bool,
}

impl RuleViewSource {
    pub fn resolve(
        snapshot: &ProjectSnapshot,
        kind: RuleKind,
        params: &Value,
    ) -> Result<Self, String> {
        // Existing command consumers continue to open retained authoring definitions.
        let requested = params
            .get("source")
            .and_then(Value::as_str)
            .unwrap_or("scenario");
        if !["authoring", "selected", "scenario", "application"].contains(&requested) {
            return Err(
                "Choose Castle-selected rules, scenario definitions, or application reference."
                    .into(),
            );
        }
        let imported = matches!(snapshot.origin, ProjectOrigin::Imported { .. });
        let selected = if imported && snapshot.classic_rule_selection.is_some() {
            let (race, caste) = selected_classic_rule_sources(snapshot)?;
            Some(if kind == RuleKind::Race { race } else { caste })
        } else if imported {
            None
        } else {
            Some("scenario")
        };
        let application = requested == "application"
            || requested == "selected" && selected.unwrap_or("application") == "application";
        let label = if kind == RuleKind::Race {
            "races"
        } else {
            "castes"
        };
        let notice = match (requested, selected) {
            ("authoring", Some("scenario")) => format!("Scenario {label} override the standard table. Standard identities appear first, followed by custom identities."),
            ("authoring", Some("application")) => format!("Standard {label} are shown with retained scenario custom definitions. Castle currently uses application {label}; custom definitions require scenario rule selection."),
            ("authoring", None) => "Standard rules and scenario custom definitions are shown together. Configure Castle rule sources in Scenario Startup before playtesting.".into(),
            ("selected", None) => "Castle rule sources are not configured. Showing application reference only; configure the source in Scenario Startup before relying on these rules.".into(),
            ("selected", Some("application")) => format!("Castle uses application {label}. These rules are read-only; scenario definitions are retained separately."),
            ("scenario", Some("application")) => format!("Showing retained scenario definitions. Castle currently uses application {label}; editing these rows does not change that selection."),
            ("scenario", None) => "Showing retained scenario definitions. Castle rule sources are not configured; configure the source in Scenario Startup.".into(),
            ("application", _) => "Application reference only · read-only. Browsing does not change Castle's configured rule sources.".into(),
            _ => "Showing scenario definitions selected by the current rule-source policy.".into(),
        };
        Ok(Self {
            application,
            standard_application: requested == "authoring" && selected != Some("scenario"),
            requested: requested.into(),
            notice,
            configured: selected.is_some(),
        })
    }

    pub fn application_for(&self, kind: RuleKind, id: u8) -> bool {
        self.application || self.standard_application && id < kind.custom_start()
    }

    pub fn metadata(&self) -> Value {
        json!({"requested":self.requested,"table":if self.requested == "authoring" {"authoring"} else if self.application {"application"} else {"scenario"},
            "configured":self.configured,"notice":self.notice,"readOnly":self.application})
    }

    pub fn application_sources(stock: &StockRules) -> RuleSources {
        RuleSources {
            race: stock.race.clone(),
            caste: stock.caste.clone(),
        }
    }

    fn application_view(
        &self,
        snapshot: &ProjectSnapshot,
        stock: &StockRules,
        retained: &RuleSources,
    ) -> Result<(ProjectSnapshot, RuleSources), String> {
        let mut sources = Self::application_sources(stock);
        let mut application = ProjectSnapshot::new_authored(snapshot.project_id.clone());
        application.race_rules =
            providence_core::codecs::decode_race_rules(&sources.race, None).rules;
        application.caste_rules =
            providence_core::codecs::decode_caste_rules(&sources.caste, None).rules;
        if self.requested == "selected"
            && self.configured
            && matches!(snapshot.origin, ProjectOrigin::Imported { .. })
        {
            let (race, caste) = selected_classic_rule_sources(snapshot)?;
            if race == "scenario" {
                application.race_rules = snapshot.race_rules.clone();
                sources.race = retained.race.clone();
            }
            if caste == "scenario" {
                application.caste_rules = snapshot.caste_rules.clone();
                sources.caste = retained.caste.clone();
            }
        }
        application.item_rules = snapshot.item_rules.clone();
        application.scenario_item_rules = snapshot.scenario_item_rules.clone();
        providence_core::codecs::derive_caste_eligibility(
            &application.race_rules,
            &mut application.caste_rules,
        )
        .map_err(|error| error.to_string())?;
        Ok((application, sources))
    }

    pub fn decorate_document(
        &self,
        snapshot: &ProjectSnapshot,
        stock: &StockRules,
        retained: &RuleSources,
        items: Option<&crate::stock_items::StockItems>,
        target: RuleDocumentTarget,
        document: &mut Value,
    ) -> Result<(), String> {
        let RuleDocumentTarget { kind, id } = target;
        if self.application_for(kind, id) {
            let (application, sources) = self.application_view(snapshot, stock, retained)?;
            let edit = rule_catalog::edit(&application, stock, &sources, kind, id)?;
            let outgoing: Vec<_> = providence_core::session::references_for(&application)
                .into_iter()
                .filter(|reference| reference.source == kind.identity(id))
                .collect();
            document["draft"]["edit"] = serde_json::to_value(&edit).map_err(|e| e.to_string())?;
            document["creationReady"] = json!(
                providence_core::rule_presentation::creation_fields_present(&edit)
            );
            document["recordContent"] = json!(
                providence_core::rule_presentation::record_content_with_template(&edit, &edit)?
            );
            document["displayName"] = json!(providence_core::rule_presentation::edit_label(&edit));
            document["ownership"] = json!("stock");
            document["copySource"] =
                json!(providence_core::session::rule_authoring::rule_copy_guard(
                    snapshot,
                    kind,
                    id,
                    "stock",
                    &stock.baseline()
                )?);
            document["itemChoices"] = json!(rule_catalog::selected_items(snapshot, &edit, items));
            document["references"] = json!(
                outgoing
                    .iter()
                    .take(64)
                    .map(|r| crate::rule_reference_labels::decorate(
                        &application,
                        stock,
                        items,
                        &sources.caste,
                        r
                    ))
                    .collect::<Vec<_>>()
            );
            document["referencesTruncated"] = json!(outgoing.len() > 64);
        }
        document["ruleSource"] = self.metadata();
        Ok(())
    }
}
