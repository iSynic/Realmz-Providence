//! Bounded rule documents combine canonical definitions with exact native fields.
use crate::{
    request_params::required_u8, rule_view_source::RuleViewSource, stock_rules::StockRules,
};
use providence_core::{
    codecs::{
        decode_caste_rules, decode_race_rules, derive_caste_eligibility, read_caste_native_fields,
    },
    model::{BlobId, ProjectSnapshot},
    session::{EditorSession, rule_authoring::*},
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};
use std::collections::BTreeSet;

pub(crate) struct RuleSources {
    pub race: Vec<u8>,
    pub caste: Vec<u8>,
}
impl RuleSources {
    pub fn borrowed(&self) -> RuleAuthoringSources<'_> {
        RuleAuthoringSources {
            race: &self.race,
            caste: &self.caste,
        }
    }
}

pub(crate) fn sources(
    snapshot: &ProjectSnapshot,
    store: &ProjectStore,
    stock: &StockRules,
) -> Result<RuleSources, String> {
    let race = snapshot
        .race_rules
        .iter()
        .map(|r| r.source_blob.as_ref())
        .collect::<BTreeSet<_>>();
    let caste = snapshot
        .caste_rules
        .iter()
        .map(|r| r.source_blob.as_ref())
        .collect::<BTreeSet<_>>();
    Ok(RuleSources {
        race: family_source(race, store, &stock.race, "Race")?,
        caste: family_source(caste, store, &stock.caste, "Caste")?,
    })
}

fn family_source(
    blobs: BTreeSet<Option<&BlobId>>,
    store: &ProjectStore,
    stock: &[u8],
    label: &str,
) -> Result<Vec<u8>, String> {
    if blobs.len() > 1 {
        return Err(format!(
            "{label} records have inconsistent native sources. Your draft was retained."
        ));
    }
    match blobs.first().copied().flatten() {
        Some(blob) => store.read_blob(blob).map_err(|e| e.to_string()),
        None if blobs.is_empty() => Ok(stock.to_vec()),
        None => Err(format!(
            "{label} records have no retained native source. Import their source before authoring."
        )),
    }
}

pub(crate) fn kind(params: &Value) -> Result<RuleKind, String> {
    serde_json::from_value(params.get("kind").cloned().ok_or("Supply the rule kind.")?)
        .map_err(|e| format!("Invalid rule kind: {e}"))
}

pub(crate) fn dispatch(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    catalogs: crate::catalogs::CatalogViews<'_>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let store = store.ok_or("Open a portable project to browse rules.")?;
    let stock = catalogs
        .stock_rules
        .ok_or("Configure the application rule library to browse rules.")?;
    let sources = sources(session.snapshot(), store, stock)?;
    let kind = kind(params)?;
    let view = RuleViewSource::resolve(session.snapshot(), kind, params)?;
    if method == "rule.used-by" {
        return used_by(session, stock, &sources, catalogs.stock_items, kind, params);
    }
    if method == "rule.open-authoring" {
        let mut document = open(
            session,
            stock,
            &sources,
            kind,
            required_u8(params, "classicId")?,
            catalogs.stock_items,
        )?;
        view.decorate_document(
            session.snapshot(),
            stock,
            &sources,
            catalogs.stock_items,
            crate::rule_view_source::RuleDocumentTarget {
                kind,
                id: required_u8(params, "classicId")?,
            },
            &mut document,
        )?;
        return Ok(document);
    }
    catalog(session, stock, &sources, kind, params, &view)
}

fn catalog(
    session: &EditorSession,
    stock: &StockRules,
    sources: &RuleSources,
    kind: RuleKind,
    params: &Value,
    view: &RuleViewSource,
) -> Result<Value, String> {
    let references = session.references();
    let mut items = Vec::new();
    let owners = rule_catalog_ownership(
        session.snapshot(),
        kind,
        &sources.borrowed(),
        &stock.baseline(),
    )?;
    let application = ProjectSnapshot::new_authored(session.snapshot().project_id.clone());
    let application_sources = RuleViewSource::application_sources(stock);
    let labels = if view.application {
        catalog_labels(&application, stock, &application_sources, kind)
    } else {
        catalog_labels(session.snapshot(), stock, sources, kind)
    };
    let stock_labels = catalog_labels(&application, stock, &application_sources, kind);
    for (id, mut name, mut portrait) in labels {
        let application_row = view.application_for(kind, id);
        if application_row
            && let Some((_, stock_name, stock_portrait)) =
                stock_labels.iter().find(|(number, _, _)| *number == id)
        {
            name = stock_name.clone();
            portrait = *stock_portrait;
        }
        let (content, ownership, creation_ready) =
            catalog_row_state(session, stock, sources, view, kind, id, &owners)?;
        let author_id = providence_core::rule_presentation::author_number(id);
        let display_name = providence_core::rule_presentation::record_label(kind, id, &name);
        let identity = kind.identity(id);
        items.push(
            json!({"identity":identity,"classicId":id,"authorId":author_id,"name":name,"displayName":display_name,"recordContent":content,"creationReady":creation_ready,"ownership":ownership,
            "custom":id >= kind.custom_start(),"usedBy":references.iter().filter(|r| r.target_id == identity.0).count(),
            "portrait":portrait}),
        );
    }
    let items = filter_catalog(items, params)?;
    Ok(
        json!({"revision":session.revision(),"familyHash":rule_family_hash(session.snapshot()),
        "libraryFingerprint":stock.fingerprint,"items":items,"total":items.len(),"capacity":30,"kind":kind,"ruleSource":view.metadata()}),
    )
}

fn filter_catalog(items: Vec<Value>, params: &Value) -> Result<Vec<Value>, String> {
    let scope = params["scope"].as_str().unwrap_or("all");
    if !["all", "stock", "scenario", "vacant"].contains(&scope) {
        return Err("Unknown rule ownership filter.".into());
    }
    let query = params["query"].as_str().unwrap_or("").to_lowercase();
    Ok(items
        .into_iter()
        .filter(|row| {
            (scope == "all" || row["ownership"].as_str() == Some(scope))
                && format!(
                    "{} {} {}",
                    row["authorId"], row["displayName"], row["identity"]
                )
                .to_lowercase()
                .contains(&query)
        })
        .collect())
}

fn catalog_row_state(
    session: &EditorSession,
    stock: &StockRules,
    sources: &RuleSources,
    view: &RuleViewSource,
    kind: RuleKind,
    id: u8,
    owners: &[RuleOwnership],
) -> Result<
    (
        providence_core::rule_presentation::RuleContent,
        RuleOwnership,
        bool,
    ),
    String,
> {
    let application_row = view.application_for(kind, id);
    let application = ProjectSnapshot::new_authored(session.snapshot().project_id.clone());
    let application_sources = RuleViewSource::application_sources(stock);
    let value = edit(
        if application_row {
            &application
        } else {
            session.snapshot()
        },
        stock,
        if application_row {
            &application_sources
        } else {
            sources
        },
        kind,
        id,
    )?;
    let template = edit(&application, stock, &application_sources, kind, id)?;
    let content =
        providence_core::rule_presentation::record_content_with_template(&value, &template)?;
    let ownership = if application_row {
        RuleOwnership::Stock
    } else {
        owners[usize::from(id - 1)]
    };
    Ok((
        content,
        ownership,
        providence_core::rule_presentation::creation_fields_present(&value),
    ))
}

fn catalog_labels(
    snapshot: &ProjectSnapshot,
    stock: &StockRules,
    sources: &RuleSources,
    kind: RuleKind,
) -> Vec<(u8, String, i32)> {
    let names = snapshot.rule_names.as_ref().unwrap_or(&stock.names);
    match kind {
        RuleKind::Race => {
            let rows = if snapshot.race_rules.is_empty() {
                decode_race_rules(&sources.race, None).rules
            } else {
                snapshot.race_rules.clone()
            };
            rows.iter()
                .map(|row| {
                    let id = row.definition.classic_id;
                    (
                        id,
                        names
                            .race_names
                            .get(usize::from(id - 1))
                            .cloned()
                            .unwrap_or_else(|| row.definition.name.clone()),
                        row.definition.default_icon_set,
                    )
                })
                .collect()
        }
        RuleKind::Caste => {
            let rows = if snapshot.caste_rules.is_empty() {
                decode_caste_rules(&sources.caste, None).rules
            } else {
                snapshot.caste_rules.clone()
            };
            rows.iter()
                .map(|row| {
                    let id = row.definition.classic_id;
                    (
                        id,
                        names
                            .caste_names
                            .get(usize::from(id - 1))
                            .cloned()
                            .unwrap_or_else(|| row.definition.name.clone()),
                        row.definition.default_icon,
                    )
                })
                .collect()
        }
    }
}

pub(crate) fn edit(
    snapshot: &ProjectSnapshot,
    stock: &StockRules,
    sources: &RuleSources,
    kind: RuleKind,
    id: u8,
) -> Result<RuleEdit, String> {
    if !(1..=30).contains(&id) {
        return Err("Choose a fixed rule ID from 1 through 30.".into());
    }
    let mut races = if snapshot.race_rules.is_empty() {
        decode_race_rules(&sources.race, None).rules
    } else {
        snapshot.race_rules.clone()
    };
    let mut castes = if snapshot.caste_rules.is_empty() {
        decode_caste_rules(&sources.caste, None).rules
    } else {
        snapshot.caste_rules.clone()
    };
    derive_caste_eligibility(&races, &mut castes).map_err(|e| e.to_string())?;
    let names = snapshot.rule_names.as_ref().unwrap_or(&stock.names);
    match kind {
        RuleKind::Race => {
            let mut row = races
                .iter_mut()
                .find(|r| r.definition.classic_id == id)
                .ok_or("Missing Race row")?
                .definition
                .clone();
            row.name = names
                .race_names
                .get(usize::from(id - 1))
                .cloned()
                .unwrap_or(row.name);
            Ok(RuleEdit::Race { definition: row })
        }
        RuleKind::Caste => {
            let mut row = castes
                .iter()
                .find(|r| r.definition.classic_id == id)
                .ok_or("Missing Caste row")?
                .definition
                .clone();
            row.name = names
                .caste_names
                .get(usize::from(id - 1))
                .cloned()
                .unwrap_or(row.name);
            Ok(RuleEdit::Caste {
                definition: Box::new(row),
                native_fields: read_caste_native_fields(&sources.caste, id)
                    .map_err(|e| e.to_string())?,
            })
        }
    }
}

pub(crate) fn open(
    session: &EditorSession,
    stock: &StockRules,
    sources: &RuleSources,
    kind: RuleKind,
    id: u8,
    stock_items: Option<&crate::stock_items::StockItems>,
) -> Result<Value, String> {
    let edit = edit(session.snapshot(), stock, sources, kind, id)?;
    let ownership = rule_ownership(
        session.snapshot(),
        kind,
        id,
        &sources.borrowed(),
        &stock.baseline(),
    )?;
    let references = session.references();
    let identity = kind.identity(id);
    let uses = references
        .iter()
        .filter(|r| r.target_id == identity.0)
        .collect::<Vec<_>>();
    let outgoing = references
        .iter()
        .filter(|r| r.source == identity)
        .collect::<Vec<_>>();
    let scope = if ownership == RuleOwnership::Stock || ownership == RuleOwnership::Vacant {
        "stock"
    } else {
        "scenario"
    };
    let copy = if ownership == RuleOwnership::Vacant {
        None
    } else {
        Some(rule_copy_guard(
            session.snapshot(),
            kind,
            id,
            scope,
            &stock.baseline(),
        )?)
    };
    let item_choices = selected_items(session.snapshot(), &edit, stock_items);
    let discovery_present = discovery_record_present(session.snapshot(), kind, id);
    let application = ProjectSnapshot::new_authored(session.snapshot().project_id.clone());
    let template_sources = RuleViewSource::application_sources(stock);
    let template = self::edit(&application, stock, &template_sources, kind, id)?;
    let content =
        providence_core::rule_presentation::record_content_with_template(&edit, &template)?;
    Ok(
        json!({"revision":session.revision(),"ownership":ownership,"kind":kind,"identity":kind.identity(id),
        "authorId":providence_core::rule_presentation::author_number(id),"displayName":providence_core::rule_presentation::edit_label(&edit),"recordContent":content,"creationReady":providence_core::rule_presentation::creation_fields_present(&edit),
        "draft":RuleRecordDraft {edit,expected_family_hash:rule_family_hash(session.snapshot()),allocation:false,copy_source:None},
        "usedBy":uses.iter().take(64).map(|r| crate::rule_reference_labels::decorate(session.snapshot(),stock,stock_items,&sources.caste,r)).collect::<Vec<_>>(),"usedByCount":uses.len(),"usedByTruncated":uses.len()>64,
        "references":outgoing.iter().take(64).map(|r| crate::rule_reference_labels::decorate(session.snapshot(),stock,stock_items,&sources.caste,r)).collect::<Vec<_>>(),"referencesTruncated":outgoing.len()>64,
        "projectLabelsOnly":true,"maximumSpellsRuntimeSupported":false,"copySource":copy,"itemChoices":item_choices,
        "ruleSource":RuleViewSource::resolve(session.snapshot(),kind,&json!({"source":"scenario"}))?.metadata(),
        "discoveryRecordPresent":discovery_present,"discoveryScope":"scenario"}),
    )
}

fn discovery_record_present(snapshot: &ProjectSnapshot, kind: RuleKind, id: u8) -> bool {
    match kind {
        RuleKind::Race => snapshot
            .race_rules
            .iter()
            .any(|row| row.definition.classic_id == id),
        RuleKind::Caste => snapshot
            .caste_rules
            .iter()
            .any(|row| row.definition.classic_id == id),
    }
}

fn used_by(
    session: &EditorSession,
    stock: &StockRules,
    sources: &RuleSources,
    items: Option<&crate::stock_items::StockItems>,
    kind: RuleKind,
    params: &Value,
) -> Result<Value, String> {
    if crate::request_params::required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("The project changed while reading callers. Your draft was retained.".into());
    }
    let identity = kind.identity(required_u8(params, "classicId")?);
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let references = session.references();
    let uses: Vec<_> = references
        .iter()
        .filter(|r| r.target_id == identity.0)
        .collect();
    Ok(
        json!({"revision":session.revision(),"offset":offset,"total":uses.len(),
        "items":uses.iter().skip(offset).take(64).map(|r| crate::rule_reference_labels::decorate(session.snapshot(),stock,items,&sources.caste,r)).collect::<Vec<_>>() }),
    )
}

pub(crate) fn selected_items(
    snapshot: &ProjectSnapshot,
    edit: &RuleEdit,
    stock: Option<&crate::stock_items::StockItems>,
) -> Vec<providence_core::rule_reference_catalog::RuleChoice> {
    let RuleEdit::Caste { native_fields, .. } = edit else {
        return Vec::new();
    };
    providence_core::rule_reference_catalog::starting_item_choices(
        snapshot,
        stock.map_or(&[], |library| library.definitions.as_slice()),
    )
    .into_iter()
    .filter(|choice| {
        native_fields
            .starting_items
            .iter()
            .flatten()
            .any(|identity| choice.target_identity.as_ref() == Some(&identity.0))
    })
    .collect()
}
