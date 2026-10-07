use crate::catalogs::OpenMonsterLibrary;
use crate::execute;
use crate::monster_population_projection;
use crate::request_params::required_string;
use providence_core::model::NativeRecordId;
use providence_core::model::StableId;
use providence_core::monster_library::MonsterLibraryCopyMode;
use providence_core::monster_library::MonsterLibraryScenarioCopy;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use serde_json::Value;
use std::collections::BTreeSet;

pub(crate) fn populate(
    project_session: &mut EditorSession,
    library: &OpenMonsterLibrary,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    crate::monster_library_selection::require_revision(library, params)?;
    let entries = crate::monster_library_selection::population_entries(library, params)?;
    let used = project_session
        .snapshot()
        .monster_sets
        .iter()
        .flat_map(|set| set.monsters.iter().map(|monster| monster.native_id.0))
        .collect::<BTreeSet<_>>();
    let plan = providence_core::monster_population::plan_monster_population(
        entries
            .iter()
            .map(|entry| (entry.identity.clone(), entry.preferred_scenario_monster_id)),
        used,
    )?;
    if method == "monster-library.population-plan" {
        return monster_population_projection::project(
            project_session.revision(),
            library.session.revision(),
            params,
            &plan,
        );
    }
    let mut copies = Vec::with_capacity(entries.len());
    for (entry, row) in entries.into_iter().zip(plan) {
        copies.push(MonsterLibraryScenarioCopy {
            target_id: row.target_id,
            template: Box::new(entry.template),
            description: entry.description,
            mode: MonsterLibraryCopyMode::Normal,
            replace: false,
        });
    }
    execute(
        project_session,
        params,
        EditorCommand::PopulateMonsterLibraryTemplates { copies },
    )
}

pub(crate) fn copy_to_scenario(
    project_session: &mut EditorSession,
    library: &OpenMonsterLibrary,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    crate::monster_library_selection::require_revision(library, params)?;
    let identity = StableId(required_string(params, "identity")?);
    let entry = library
        .session
        .catalog()
        .entry(&identity)
        .cloned()
        .ok_or_else(|| format!("Monster Library entry '{}' was not found", identity.0))?;
    let (mode, replace) = match method {
        "monster-library.copy-to-all-sets" => (MonsterLibraryCopyMode::ExactAllSets, false),
        "monster-library.copy-and-generate-variants" => {
            (MonsterLibraryCopyMode::GenerateVariants, false)
        }
        "monster-library.replace-scenario" => (MonsterLibraryCopyMode::Normal, true),
        _ => (MonsterLibraryCopyMode::Normal, false),
    };
    let target_id = NativeRecordId(
        params
            .get("targetNativeId")
            .and_then(Value::as_u64)
            .map(|value| u32::try_from(value).map_err(|_| "targetNativeId exceeds u32"))
            .transpose()?
            .unwrap_or(entry.preferred_scenario_monster_id.0),
    );
    execute(
        project_session,
        params,
        EditorCommand::ApplyMonsterLibraryTemplate {
            target_id,
            template: Box::new(entry.template),
            description: entry.description,
            mode,
            replace,
        },
    )
}
