use crate::catalogs::OpenMonsterLibrary;
use crate::monster_library_routes::monster_library_entry_summary;
use crate::request_params::required_i16;
use crate::request_params::required_u32;
use crate::request_params::required_u64;
use providence_core::model::{NativeRecordId, ProjectSnapshot, StableId};
use providence_core::monster_library::MonsterLibraryCommand;
use providence_core::monster_library::MonsterLibraryOrigin;
use providence_core::session::EditorSession;
use providence_core::session::ExpectedRevisionCommand;
use providence_core::session::Revision;
use serde_json::Value;
use serde_json::json;

pub(crate) fn copy_scenario_monster_to_library(
    project_session: &EditorSession,
    monster_library: Option<&mut OpenMonsterLibrary>,
    params: Value,
) -> Result<Value, String> {
    let library = monster_library.ok_or_else(|| {
        "monster.copy-to-library requires serve-project --monster-library-root <portable-library-directory>"
            .to_string()
    })?;
    let expected_project_revision = Revision(required_u64(&params, "expectedRevision")?);
    if expected_project_revision != project_session.revision() {
        return Err(format!(
            "project revision conflict: expected {}, actual {}",
            expected_project_revision.0,
            project_session.revision().0
        ));
    }
    let expected_library_revision = Revision(required_u64(&params, "expectedLibraryRevision")?);
    if expected_library_revision != library.session.revision() {
        return Err(format!(
            "monster library revision conflict: expected {}, actual {}",
            expected_library_revision.0,
            library.session.revision().0
        ));
    }
    let set_id = required_i16(&params, "setId")?;
    let native_id = NativeRecordId(required_u32(&params, "nativeId")?);
    let (command, source_identity) =
        prepare_library_copy(project_session.snapshot(), &params, set_id, native_id)?;
    let projection = library
        .session
        .execute(ExpectedRevisionCommand {
            expected_revision: expected_library_revision,
            command,
        })
        .map_err(|error| error.to_string())?;
    let created_identity = projection
        .changed_entries
        .first()
        .cloned()
        .ok_or_else(|| "Monster Library creation returned no changed entry".to_string())?;
    let entry = library
        .session
        .catalog()
        .entry(&created_identity)
        .ok_or_else(|| "Monster Library creation did not retain its new entry".to_string())?;
    Ok(json!({
        "projectRevision": project_session.revision(),
        "source": {
            "setId": set_id,
            "nativeId": native_id,
            "identity": source_identity,
        },
        "projection": projection,
        "entry": monster_library_entry_summary(entry),
    }))
}

pub(crate) fn prepare_library_copy(
    snapshot: &ProjectSnapshot,
    params: &Value,
    set_id: i16,
    native_id: NativeRecordId,
) -> Result<(MonsterLibraryCommand, StableId), String> {
    let monster = snapshot
        .monster_sets
        .iter()
        .find(|set| set.set_id == set_id)
        .and_then(|set| {
            set.monsters
                .iter()
                .find(|monster| monster.native_id == native_id)
        })
        .cloned()
        .ok_or_else(|| format!("monster {set_id}:{} was not found", native_id.0))?;
    let description = snapshot
        .monster_descriptions
        .iter()
        .find(|description| description.native_id == native_id)
        .map(|description| description.text.clone())
        .unwrap_or_default();
    let label = params
        .get("label")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|label| !label.is_empty())
        .map(str::to_owned)
        .or_else(|| {
            let display_name = monster.display_name.trim();
            (!display_name.is_empty()).then(|| display_name.to_owned())
        })
        .unwrap_or_else(|| format!("Monster {}", native_id.0));
    let source_identity = monster.identity.clone();
    let command = MonsterLibraryCommand::CreateCustom {
        label,
        preferred_scenario_monster_id: native_id,
        template: Box::new(monster),
        description,
        origin: MonsterLibraryOrigin::ScenarioMonster {
            project: snapshot.project_id.clone(),
            source_monster: source_identity.clone(),
        },
    };
    Ok((command, source_identity))
}
