//! Reviewed allocations stage a draft; only Apply writes canonical rule state.
use crate::{
    catalogs::CatalogViews,
    request_params::{coerce_integral_numbers, required_u8, required_u64, required_value},
    rule_catalog::{self, RuleSources},
    stock_rules::{StockRules, hash},
};
use providence_core::session::{EditorCommand, EditorSession, rule_authoring::*};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

pub(crate) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("The project changed after this rule was opened. Your draft was retained; review the saved version.".into());
    }
    let store = store.ok_or("Open a portable project to author rules.")?;
    let stock = catalogs
        .stock_rules
        .ok_or("Configure the application rule library before authoring.")?;
    let sources = rule_catalog::sources(session.snapshot(), store, stock)?;
    match method {
        "rule.allocation.review" => allocation(session, stock, &sources, params),
        "rule.clear.review" => clear(session, stock, &sources, catalogs.stock_items, params),
        "rule.draft.prepare" | "rule.draft.apply" => {
            apply(session, store, catalogs, stock, &sources, method, params)
        }
        _ => Err(format!("Unknown rule draft request {method}")),
    }
}

fn allocation(
    session: &EditorSession,
    stock: &StockRules,
    sources: &RuleSources,
    params: &Value,
) -> Result<Value, String> {
    let kind = rule_catalog::kind(params)?;
    let vacant = session.vacant_rule_ids(kind, &sources.borrowed(), &stock.baseline())?;
    let destination = params
        .get("destinationClassicId")
        .filter(|v| !v.is_null())
        .map(|_| required_u8(params, "destinationClassicId"))
        .transpose()?
        .or_else(|| vacant.first().copied())
        .ok_or("All custom rule identities are occupied. Nothing was replaced.")?;
    if !vacant.contains(&destination) {
        return Err("The destination is occupied or has incoming uses. Choose a reviewed vacant custom identity.".into());
    }
    let (mut edit, copy) = if let Some(value) = params.get("copySource").filter(|v| !v.is_null()) {
        let source: RuleCopyGuard = serde_json::from_value(coerce_integral_numbers(value.clone()))
            .map_err(|e| e.to_string())?;
        if source.kind != kind {
            return Err("The copy source is a different rule family.".into());
        }
        (copy_edit(session, stock, sources, &source)?, Some(source))
    } else {
        (empty_rule_edit(kind, destination)?, None)
    };
    retarget_rule_edit(&mut edit, destination)?;
    let draft = RuleRecordDraft {
        edit,
        expected_family_hash: rule_family_hash(session.snapshot()),
        allocation: true,
        copy_source: copy,
    };
    // Revalidate the exact source and destination with the same preparation used by Apply.
    session.prepare_rule_draft(&draft, &sources.borrowed(), &stock.baseline())?;
    Ok(
        json!({"revision":session.revision(),"draft":draft,"destination":kind.identity(destination),
        "authorId":providence_core::rule_presentation::author_number(destination),
        "copySourceAuthorId":draft.copy_source.as_ref().and_then(|source| providence_core::rule_presentation::author_number(source.classic_id)),
        "vacantDestinations":vacant.iter().map(|id| json!({"classicId":id,"authorId":providence_core::rule_presentation::author_number(*id)})).collect::<Vec<_>>(),
        "vacantIds":vacant,"incomingUses":0,"occupiedDestinationsReplaced":0,"localUntilApply":true}),
    )
}

fn copy_edit(
    session: &EditorSession,
    stock: &StockRules,
    sources: &RuleSources,
    source: &RuleCopyGuard,
) -> Result<RuleEdit, String> {
    if source.scope == "scenario" {
        return rule_catalog::edit(
            session.snapshot(),
            stock,
            sources,
            source.kind,
            source.classic_id,
        );
    }
    if source.scope != "stock" {
        return Err("Choose stock or scenario as the copy source.".into());
    }
    let empty = providence_core::model::ProjectSnapshot::new_authored(
        providence_core::model::StableId("stock-copy".into()),
    );
    rule_catalog::edit(
        &empty,
        stock,
        &RuleSources {
            race: stock.race.clone(),
            caste: stock.caste.clone(),
        },
        source.kind,
        source.classic_id,
    )
}

fn clear(
    session: &EditorSession,
    stock: &StockRules,
    sources: &RuleSources,
    items: Option<&crate::stock_items::StockItems>,
    params: &Value,
) -> Result<Value, String> {
    let kind = rule_catalog::kind(params)?;
    let id = required_u8(params, "classicId")?;
    if rule_ownership(
        session.snapshot(),
        kind,
        id,
        &sources.borrowed(),
        &stock.baseline(),
    )? != RuleOwnership::Scenario
    {
        return Err("Only a scenario-owned rule can be cleared. Stock rules are protected.".into());
    }
    let uses = session
        .references()
        .into_iter()
        .filter(|r| r.target_id == kind.identity(id).0)
        .collect::<Vec<_>>();
    let draft = RuleRecordDraft {
        edit: empty_rule_edit(kind, id)?,
        expected_family_hash: rule_family_hash(session.snapshot()),
        allocation: false,
        copy_source: None,
    };
    let original = rule_catalog::edit(session.snapshot(), stock, sources, kind, id)?;
    Ok(
        json!({"revision":session.revision(),"draft":draft,"original":original,"incomingUses":uses.len(),
        "authorId":providence_core::rule_presentation::author_number(id),
        "uses":uses.iter().take(64).map(|r| crate::rule_reference_labels::decorate(session.snapshot(),stock,items,&sources.caste,r)).collect::<Vec<_>>(),"usesTruncated":uses.len()>64,
        "identityRetained":true,"localUntilApply":true}),
    )
}

fn apply(
    session: &mut EditorSession,
    store: &ProjectStore,
    catalogs: CatalogViews<'_>,
    stock: &StockRules,
    sources: &RuleSources,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let draft: RuleRecordDraft = serde_json::from_value(coerce_integral_numbers(
        required_value(params, "draft")?.clone(),
    ))
    .map_err(|e| format!("Invalid rule draft: {e}"))?;
    let prepared = session
        .prepare_rule_draft(&draft, &sources.borrowed(), &stock.baseline())
        .and_then(|prepared| {
            check_items(session, catalogs, stock, sources, &draft)?;
            check_portrait(session, catalogs, stock, sources, &draft)?;
            Ok(prepared)
        });
    if method == "rule.draft.prepare" {
        return Ok(
            json!({"revision":session.revision(),"valid":prepared.is_ok(),
            "issues":prepared.err().into_iter().collect::<Vec<_>>(),"identity":draft.edit.identity()}),
        );
    }
    let prepared = prepared?;
    persist_prepared_sources(store, stock, &prepared)?;
    let kind = draft.edit.kind();
    let id = draft.edit.classic_id();
    let change = crate::execute(
        session,
        params,
        EditorCommand::ApplyRuleRecordDraft(Box::new(prepared.commit)),
    )?;
    let saved = rule_catalog::sources(session.snapshot(), store, stock)?;
    let document = rule_catalog::open(session, stock, &saved, kind, id, catalogs.stock_items)?;
    Ok(json!({"change":change,"document":document}))
}

fn persist_prepared_sources(
    store: &ProjectStore,
    stock: &StockRules,
    prepared: &PreparedRuleWrite,
) -> Result<(), String> {
    if prepared.commit.names.source_blob == stock.names.source_blob {
        store
            .put_blob(&stock.name_bytes)
            .map_err(|e| e.to_string())?;
    }
    let race_blob = store
        .put_blob(&prepared.race_bytes)
        .map_err(|e| e.to_string())?;
    let caste_blob = store
        .put_blob(&prepared.caste_bytes)
        .map_err(|e| e.to_string())?;
    if race_blob.0 != hash(&prepared.race_bytes) || caste_blob.0 != hash(&prepared.caste_bytes) {
        return Err(
            "Rule source storage did not acknowledge the prepared bytes. No draft was applied."
                .into(),
        );
    }
    Ok(())
}

fn check_items(
    session: &EditorSession,
    catalogs: CatalogViews<'_>,
    stock: &StockRules,
    sources: &RuleSources,
    draft: &RuleRecordDraft,
) -> Result<(), String> {
    let RuleEdit::Caste { native_fields, .. } = &draft.edit else {
        return Ok(());
    };
    let previous = rule_catalog::edit(
        session.snapshot(),
        stock,
        sources,
        RuleKind::Caste,
        draft.edit.classic_id(),
    )?;
    let RuleEdit::Caste {
        native_fields: before,
        ..
    } = previous
    else {
        unreachable!()
    };
    for (index, item) in native_fields.starting_items.iter().enumerate() {
        if !draft.allocation && *item == before.starting_items[index] {
            continue;
        }
        let Some(item) = item else {
            continue;
        };
        if !session
            .snapshot()
            .item_rules
            .iter()
            .any(|r| r.definition.id == *item)
            && !session
                .snapshot()
                .scenario_item_rules
                .iter()
                .any(|r| r.definition.id == *item)
            && !catalogs
                .stock_items
                .is_some_and(|s| s.definitions.iter().any(|r| r.id == *item))
        {
            return Err(format!(
                "Starting item slot {} refers to unavailable {}. Choose an available item or Empty.",
                index + 1,
                item.0
            ));
        }
    }
    Ok(())
}

fn check_portrait(
    session: &EditorSession,
    catalogs: CatalogViews<'_>,
    stock: &StockRules,
    sources: &RuleSources,
    draft: &RuleRecordDraft,
) -> Result<(), String> {
    let previous = rule_catalog::edit(
        session.snapshot(),
        stock,
        sources,
        draft.edit.kind(),
        draft.edit.classic_id(),
    )?;
    let value = |edit: &RuleEdit| match edit {
        RuleEdit::Race { definition } => definition.default_icon_set,
        RuleEdit::Caste { definition, .. } => definition.default_icon,
    };
    // Clear/new blank Caste retains its explicit zero; unchanged imported artwork is not repaired implicitly.
    if value(&draft.edit) == 0 || value(&draft.edit) == value(&previous) {
        return Ok(());
    }
    let field = if draft.edit.kind() == RuleKind::Race {
        "defaultIconSet"
    } else {
        "defaultIcon"
    };
    let choice = providence_core::rule_reference_catalog::portrait_choice(
        session.snapshot(),
        catalogs.application_media,
        field,
        value(&draft.edit),
    )?;
    if !choice.available {
        return Err(format!("Portrait: {}", choice.reason));
    }
    Ok(())
}
