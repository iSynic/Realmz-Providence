use providence_storage::{MonsterOperationStore, PersonalLibraryStore, ProjectStore};
use serde_json::{Value, json};

use crate::{Request, Response, catalogs::OpenMonsterLibrary};

pub(crate) struct PendingReceipt {
    store: MonsterOperationStore,
    operation_id: String,
}

pub(crate) enum Start {
    Continue(Option<PendingReceipt>),
    Reply(Response),
}

pub(crate) fn start(
    project: Option<&ProjectStore>,
    library: Option<&OpenMonsterLibrary>,
    personal: Option<&PersonalLibraryStore>,
    request: &Request,
) -> Start {
    if matches!(
        request.method.as_str(),
        "monster.operation.status"
            | "battle.operation.status"
            | "item.operation.status"
            | "media.operation.status"
            | "personal-library.operation.status"
            | "world.operation.status"
    ) {
        let result = read_original(project, library, personal, &request.params);
        return Start::Reply(reply(request.id, result));
    }
    let Some(operation_id) = request.params.get("operationId").and_then(Value::as_str) else {
        return Start::Continue(None);
    };
    if !mutation(&request.method) {
        return Start::Continue(None);
    }
    let domain = if personal_mutation(&request.method)
        || request.method == "media.transfer.commit"
        || request.method == "media.import.commit" && request.params["destination"] == "personal"
    {
        "personal"
    } else if library_mutation(&request.method) {
        "library"
    } else {
        "project"
    };
    let result = receipt_store(project, library, personal, domain).and_then(|store| {
        store
            .reserve(
                operation_id,
                &json!({"method": request.method, "params": request.params}),
            )
            .map_err(|error| format!("The authoring operation was not submitted: {error}"))?;
        Ok(PendingReceipt {
            store,
            operation_id: operation_id.into(),
        })
    });
    match result {
        Ok(receipt) => Start::Continue(Some(receipt)),
        Err(error) => Start::Reply(reply(request.id, Err(error))),
    }
}

pub(crate) fn finish(pending: Option<PendingReceipt>, response: &mut Response) {
    let Some(pending) = pending else { return };
    if response.outcome_unknown == Some(true) {
        return;
    }
    let result = serde_json::to_value(&*response)
        .map_err(|error| error.to_string())
        .and_then(|value| {
            pending
                .store
                .complete(&pending.operation_id, &value)
                .map_err(|error| error.to_string())
        });
    if let Err(error) = result {
        response.ok = false;
        response.result = None;
        response.outcome_unknown = Some(true);
        response.error = Some(format!(
            "The authoring operation receipt could not be acknowledged. Check the original result before continuing: {error}"
        ));
    }
}

fn read_original(
    project: Option<&ProjectStore>,
    library: Option<&OpenMonsterLibrary>,
    personal: Option<&PersonalLibraryStore>,
    params: &Value,
) -> Result<Value, String> {
    let id = crate::request_params::required_string(params, "operationId")?;
    let domain = crate::request_params::required_string(params, "domain")?;
    let expected = params
        .get("expectedIntent")
        .ok_or("Supply the exact original authoring operation intent")?;
    let receipt = receipt_store(project, library, personal, &domain)?
        .lookup(&id)
        .map_err(|error| error.to_string())?;
    if receipt["outcome"] != "unknown" && receipt["intent"] != *expected {
        return Ok(
            json!({"operationId": id, "outcome": "unknown", "reason": "The receipt does not identify the original submitted operation."}),
        );
    }
    Ok(receipt)
}

fn receipt_store(
    project: Option<&ProjectStore>,
    library: Option<&OpenMonsterLibrary>,
    personal: Option<&PersonalLibraryStore>,
    domain: &str,
) -> Result<MonsterOperationStore, String> {
    match domain {
        "project" => project
            .map(MonsterOperationStore::for_project)
            .ok_or("Open a portable project to track this authoring operation.".into()),
        "library" => library
            .map(|library| MonsterOperationStore::for_library(&library.store))
            .ok_or("Open the original Monster Library to check this operation.".into()),
        "personal" => personal
            .map(MonsterOperationStore::for_personal_library)
            .ok_or("Open the original My Library to check this operation.".into()),
        _ => Err("Authoring operation domain must be project, library or personal".into()),
    }
}

fn mutation(method: &str) -> bool {
    library_mutation(method)
        || personal_mutation(method)
        || matches!(
            method,
            "media.import.commit"
                | "media.copy.commit"
                | "media.transfer.commit"
                | "media.metadata.apply"
                | "media.remove.commit"
                | "monster.draft.apply"
                | "battle.draft.apply"
                | "item.draft.apply"
                | "spell.draft.apply"
                | "rule.draft.apply"
                | "scenario-startup.update"
                | "scenario-restrictions.update"
                | "scenario-contact.update"
                | "scenario-security.update"
                | "classic-rule-selection.set"
                | "classic-rule-selection.clear"
                | "player-map.apply-draft"
                | "player-map.create"
                | "dungeon-cell.apply-features"
                | "land-layout.apply-cell"
                | "land-layout.remove"
                | "level-settings.apply"
                | "random-region.apply"
                | "map.apply-intent"
                | "smart-terrain.apply"
                | "magic-brush.apply"
                | "terrain-mapping.accept"
                | "map.create"
                | "map.duplicate"
                | "action-point.create"
                | "map-stamp.apply"
                | "tile-behavior.apply"
                | "land-cell.apply"
                | "custom-landlook.apply"
                | "custom-landlook.metadata.import"
                | "random-region.clear"
                | "monster.operation.commit"
                | "monster-library.transfer.commit"
                | "monster.create"
                | "monster.duplicate"
                | "monster.clear"
                | "monster.switch-records"
                | "monster.copy-to-all-sets"
                | "monster.generate-variants"
        )
}

fn personal_mutation(method: &str) -> bool {
    matches!(
        method,
        "personal-library.update"
            | "personal-library.rename"
            | "personal-library.move"
            | "personal-library.remove"
            | "personal-library.create-collection"
            | "personal-library.import-image"
            | "personal-library.import-original"
            | "personal-library.undo"
            | "personal-library.redo"
    )
}

fn library_mutation(method: &str) -> bool {
    matches!(
        method,
        "monster-library.draft.apply"
            | "monster-library.operation.commit"
            | "monster.copy-to-library"
            | "monster-library.create-custom"
            | "monster-library.update-custom"
            | "monster-library.duplicate"
            | "monster-library.delete-custom"
            | "monster-library.customize"
            | "monster-library.copy-variant"
            | "monster-library.restore-built-in"
            | "monster-library.undo"
            | "monster-library.redo"
    )
}

fn reply(id: u64, result: Result<Value, String>) -> Response {
    match result {
        Ok(result) => Response {
            id,
            ok: true,
            result: Some(result),
            error: None,
            outcome_unknown: None,
        },
        Err(error) => Response {
            id,
            ok: false,
            result: None,
            error: Some(error),
            outcome_unknown: None,
        },
    }
}
