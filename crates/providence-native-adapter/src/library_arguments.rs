use crate::catalogs::{
    OpenApplicationMedia, OpenLibraries, OpenMonsterLibrary, OpenReferenceCatalog,
};
use providence_storage::{
    MonsterLibraryStore, PersonalLibraryStore, ReferenceCatalogStore, ReferenceLibraryStore,
};
use std::path::Path;

pub(crate) fn open_library_arguments(
    arguments: &mut impl Iterator<Item = String>,
) -> Result<OpenLibraries, String> {
    let mut libraries = OpenLibraries::default();
    while let Some(option) = arguments.next() {
        if !matches!(
            option.as_str(),
            "--application-library-root"
                | "--monster-library-root"
                | "--personal-monster-library-root"
                | "--monster-scrapbook-manifest"
                | "--reference-catalog-root"
                | "--personal-library-root"
                | "--application-rules-root"
        ) {
            return Err(format!("unknown serve-project option '{option}'"));
        }
        let root = arguments
            .next()
            .ok_or_else(|| format!("{option} requires a directory"))?;
        open_requested_library(&mut libraries, &option, &root)?;
    }
    Ok(libraries)
}

fn open_requested_library(
    libraries: &mut OpenLibraries,
    option: &str,
    root: &str,
) -> Result<(), String> {
    match option {
        "--application-rules-root" => {
            require_unconfigured(libraries.stock_items.is_some(), option)?;
            open_application_rules(libraries, root)?;
        }
        "--monster-scrapbook-manifest" => {
            let library = libraries
                .monster_library
                .as_mut()
                .ok_or("Configure the personal Monster Library before its bundled source")?;
            crate::monster_library_defaults::initialize(library, root)?;
        }
        "--personal-library-root" => {
            require_unconfigured(libraries.personal_library.is_some(), option)?;
            libraries.personal_library = Some(open_personal_library(root)?);
        }
        "--application-library-root" => {
            require_unconfigured(libraries.application_media.is_some(), option)?;
            let (store, catalog) = ReferenceLibraryStore::open(root).map_err(|error| {
                format!("could not open application media library {root}: {error}")
            })?;
            libraries.application_media = Some(OpenApplicationMedia { store, catalog });
        }
        "--monster-library-root" => {
            require_unconfigured(libraries.monster_library.is_some(), option)?;
            let (store, session) = MonsterLibraryStore::open_session(root)
                .map_err(|error| format!("could not open Monster Library {root}: {error}"))?;
            libraries.monster_library = Some(OpenMonsterLibrary { store, session });
        }
        "--personal-monster-library-root" => {
            require_unconfigured(libraries.monster_library.is_some(), option)?;
            let (store, session) = open_personal_monster_library(root)?;
            libraries.monster_library = Some(OpenMonsterLibrary { store, session });
        }
        "--reference-catalog-root" => {
            require_unconfigured(libraries.reference_catalog.is_some(), option)?;
            let (store, catalog) = ReferenceCatalogStore::open(root)
                .map_err(|error| format!("could not open reference catalog {root}: {error}"))?;
            libraries.reference_catalog = Some(OpenReferenceCatalog { store, catalog });
        }
        _ => unreachable!("validated library option"),
    }
    Ok(())
}

fn require_unconfigured(configured: bool, option: &str) -> Result<(), String> {
    if configured {
        return Err(format!("{option} was provided more than once"));
    }
    Ok(())
}

fn open_personal_library(root: &str) -> Result<PersonalLibraryStore, String> {
    if Path::new(root)
        .join("personal-library.providence.json")
        .is_file()
    {
        PersonalLibraryStore::open(root).map(|(store, _)| store)
    } else {
        PersonalLibraryStore::create(root)
    }
    .map_err(|error| format!("could not open personal library {root}: {error}"))
}

fn open_personal_monster_library(
    root: &str,
) -> Result<
    (
        MonsterLibraryStore,
        providence_core::monster_library::MonsterLibrarySession,
    ),
    String,
> {
    if Path::new(root)
        .join("monster-library.providence.json")
        .is_file()
    {
        MonsterLibraryStore::open_session(root)
    } else {
        MonsterLibraryStore::create(
            root,
            providence_core::model::StableId("personal-monster-library".into()),
        )
    }
    .map_err(|error| format!("could not open personal Monster Library {root}: {error}"))
}

fn open_application_rules(libraries: &mut OpenLibraries, root: &str) -> Result<(), String> {
    libraries.stock_items = Some(crate::stock_items::StockItems::open(Path::new(root))?);
    if Path::new(root).join("Data Race").exists() || Path::new(root).join("Data Caste").exists() {
        libraries.stock_rules = Some(crate::stock_rules::StockRules::open(Path::new(root))?);
    }
    if Path::new(root).join("Data S").exists() {
        libraries.stock_spells = Some(crate::stock_spells::StockSpells::open(Path::new(root))?);
    }
    libraries.application_terrain = Some(crate::application_terrain::ApplicationTerrain::open(
        Path::new(root),
    ));
    Ok(())
}
