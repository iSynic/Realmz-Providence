use crate::catalogs::OpenMonsterLibrary;
use crate::execute;
use crate::monster_library_routes::dispatch_monster_library;
use crate::monster_population_projection;
use providence_core::model::NativeRecordId;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::monster_library::MonsterLibraryOwnership;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use serde_json::json;
use std::collections::BTreeSet;

pub(super) fn assert_read_only_plan(project: &mut EditorSession, library: &mut OpenMonsterLibrary) {
    let before_project = project.snapshot().clone();
    let before_library = library.session.catalog().clone();
    let params = json!({"expectedRevision": 0, "expectedLibraryRevision": 2, "ownership": "all", "limit": 1});
    let first = dispatch_monster_library(
        project,
        Some(library),
        "monster-library.population-plan",
        params.clone(),
    )
    .unwrap();
    let mut second_params = params.clone();
    second_params["offset"] = json!(1);
    let second = dispatch_monster_library(
        project,
        Some(library),
        "monster-library.population-plan",
        second_params,
    )
    .unwrap();
    assert_eq!(first["total"], 2);
    assert_eq!(first["rows"].as_array().unwrap().len(), 1);
    assert_eq!(first["rows"][0]["targetId"], 1);
    assert_eq!(second["rows"][0]["targetId"], 2);
    assert!(first["rows"][0].get("template").is_none());
    assert_eq!(first["projectRevision"], 0);
    assert_eq!(first["libraryRevision"], 2);
    assert_eq!(
        first,
        dispatch_monster_library(
            project,
            Some(library),
            "monster-library.population-plan",
            params.clone()
        )
        .unwrap()
    );
    for (key, value) in [
        ("expectedRevision", json!(99)),
        ("expectedLibraryRevision", json!(99)),
        ("entryIds", json!(["missing"])),
    ] {
        let mut invalid = params.clone();
        invalid[key] = value;
        assert!(
            dispatch_monster_library(
                project,
                Some(library),
                "monster-library.population-plan",
                invalid
            )
            .is_err()
        );
    }
    assert_eq!(project.snapshot(), &before_project);
    assert_eq!(library.session.catalog(), &before_library);
    assert_eq!(project.revision(), Revision(0));
    assert_plan_matches_population(library);
}

fn assert_plan_matches_population(library: &mut OpenMonsterLibrary) {
    let saved = library.session.clone();
    let mut catalog = library.session.catalog().clone();
    catalog.custom_entries = [1, 2, 2]
        .into_iter()
        .enumerate()
        .map(|(index, preferred)| {
            let mut entry = catalog.built_ins[0].clone();
            entry.identity = StableId(format!("library:equivalence:{index}"));
            entry.ownership = MonsterLibraryOwnership::Custom;
            entry.origin = providence_core::monster_library::MonsterLibraryOrigin::Blank;
            entry.preferred_scenario_monster_id = NativeRecordId(preferred);
            entry.template.display_name = format!("Plan fixture {index}");
            entry
        })
        .collect();
    let ids = catalog
        .custom_entries
        .iter()
        .map(|entry| entry.identity.clone())
        .collect::<Vec<_>>();
    library.session =
        providence_core::monster_library::MonsterLibrarySession::new(catalog).unwrap();
    let mut project = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "population-equivalence".into(),
    )));
    execute(
        &mut project,
        &json!({"expectedRevision": 0}),
        EditorCommand::CreateMonster {
            set_id: 0,
            native_id: NativeRecordId(1),
        },
    )
    .unwrap();
    let params = json!({"expectedRevision": 1, "expectedLibraryRevision": 2, "ownership": "custom", "entryIds": ids});
    let plan = dispatch_monster_library(
        &mut project,
        Some(library),
        "monster-library.population-plan",
        params.clone(),
    )
    .unwrap();
    let targets = plan["rows"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| row["targetId"].as_u64().unwrap() as u32)
        .collect::<Vec<_>>();
    assert_eq!(targets, [2, 3, 4]);
    assert_eq!(plan["rows"][0]["reason"], "preferred-occupied");
    assert_eq!(plan["rows"][1]["reason"], "preferred-occupied");
    dispatch_monster_library(
        &mut project,
        Some(library),
        "monster-library.populate-scenario",
        params,
    )
    .unwrap();
    let created = project.snapshot().monster_sets[0]
        .monsters
        .iter()
        .filter(|monster| monster.native_id.0 != 1)
        .collect::<Vec<_>>();
    assert_eq!(
        created
            .iter()
            .map(|monster| monster.native_id.0)
            .collect::<Vec<_>>(),
        targets
    );
    assert_eq!(
        created
            .iter()
            .map(|monster| monster.display_name.as_str())
            .collect::<Vec<_>>(),
        ["Plan fixture 0", "Plan fixture 1", "Plan fixture 2"]
    );
    library.session = saved;
}

#[test]
fn population_projection_caps_rows_without_changing_global_assignments() {
    let rows = providence_core::monster_population::plan_monster_population(
        (0..300).map(|id| (StableId(format!("library:{id}")), NativeRecordId(0))),
        BTreeSet::new(),
    )
    .unwrap();
    let page = monster_population_projection::project(
        Revision(4),
        Revision(8),
        &json!({"expectedRevision": 4, "limit": 10000, "offset": 127}),
        &rows,
    )
    .unwrap();
    assert_eq!(page["rows"].as_array().unwrap().len(), 128);
    assert_eq!(page["rows"][0]["targetId"], 128);
    assert_eq!(page["total"], 300);
}
