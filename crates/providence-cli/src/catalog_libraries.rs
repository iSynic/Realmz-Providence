use crate::output::report_error;
use providence_core::model::StableId;
use providence_core::monster_library::MONSTER_SCRAPBOOK_RECORD_BYTES;
use providence_core::monster_library::MonsterLibraryCatalog;
use providence_core::monster_library::MonsterLibraryOwnership;
use providence_core::monster_library::decode_monster_scrapbook;
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::rebuilt::ApplicationMediaResolution;
use providence_core::reference_library::ReferenceCatalog;
use providence_core::reference_library::ReferenceSourceKind;
use providence_storage::ReferenceCatalogStore;
use providence_storage::ReferenceLibraryStore;
use serde_json::json;
use std::fs;
use std::process::ExitCode;

pub(crate) fn inspect_application_library(directory: &str) -> ExitCode {
    match ReferenceLibraryStore::open(directory) {
        Ok((_, catalog)) => {
            println!(
                "{}",
                serde_json::to_string_pretty(&application_library_report(&catalog))
                    .expect("application library report is serializable")
            );
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("could not inspect application media library: {error}");
            ExitCode::FAILURE
        }
    }
}

pub(crate) fn inspect_reference_catalog(directory: &str) -> ExitCode {
    match ReferenceCatalogStore::open(directory) {
        Ok((_, catalog)) => {
            println!(
                "{}",
                serde_json::to_string_pretty(&reference_catalog_report(&catalog))
                    .expect("reference catalog report is serializable")
            );
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("could not inspect reference catalog: {error}");
            ExitCode::FAILURE
        }
    }
}

pub(crate) fn application_library_report(catalog: &ApplicationMediaCatalog) -> serde_json::Value {
    let missing_appearance_resource_ids = (257..377)
        .map(|resource_id| (resource_id, "portrait"))
        .chain((9000..9120).map(|resource_id| (resource_id, "combat-icon")))
        .filter_map(|(resource_id, kind)| {
            let resource = providence_core::model::ClassicResourceKey {
                resource_type: "cicn".into(),
                resource_id,
            };
            (!matches!(
                catalog.resolve_resource(&resource, Some(kind)),
                ApplicationMediaResolution::Resolved(_)
            ))
            .then_some(resource_id)
        })
        .collect::<Vec<_>>();
    let (available_landlooks, missing_landlooks): (Vec<_>, Vec<_>) =
        [0, 1, 3, 4, 5, 6, 7, 8, 9, 10]
            .into_iter()
            .partition(|landlook| {
                matches!(
                    catalog.resolve_landlook_tileset(&StableId(format!(
                        "classic.landlook.{landlook}"
                    ))),
                    ApplicationMediaResolution::Resolved(_)
                )
            });
    let dungeon_atlas = matches!(
        catalog.resolve_map_tileset(&StableId("dungeon-top-down-302".into())),
        ApplicationMediaResolution::Resolved(_)
    );
    json!({
        "formatVersion": catalog.format_version,
        "libraryId": catalog.library_id,
        "sources": catalog.sources.len(),
        "assets": catalog.assets.len(),
        "ambiguities": catalog.ambiguous_resources.len(),
        "failures": catalog.failures.len(),
        "appearanceRoots": 240 - missing_appearance_resource_ids.len(),
        "appearanceComplete": missing_appearance_resource_ids.is_empty(),
        "missingAppearanceResourceIds": missing_appearance_resource_ids,
        "landlookAtlases": {
            "available": available_landlooks,
            "missing": missing_landlooks,
            "dungeon": dungeon_atlas,
        },
        "ready": catalog.ambiguous_resources.is_empty()
            && catalog.failures.is_empty()
            && missing_appearance_resource_ids.is_empty(),
    })
}

pub(crate) fn reference_catalog_report(catalog: &ReferenceCatalog) -> serde_json::Value {
    let bag_items = catalog
        .assets
        .iter()
        .filter(|asset| asset.descriptor.kind == ReferenceSourceKind::BagOfHolding.entry_kind())
        .count();
    let vault_icons = catalog.assets.len().saturating_sub(bag_items);
    json!({
        "formatVersion": catalog.format_version,
        "libraryId": catalog.library_id,
        "sources": catalog.sources.len(),
        "assets": catalog.assets.len(),
        "counts": {
            "bagItems": bag_items,
            "vaultIcons": vault_icons,
        },
        "projectOwnership": false,
        "readOnly": true,
        "ready": catalog.sources.len() == 2 && bag_items > 0 && vault_icons > 0,
    })
}

pub(crate) fn inspect_monster_scrapbook(path: &str) -> ExitCode {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => return report_error(format!("could not read Monster Scrap Book: {error}")),
    };
    let decoded = decode_monster_scrapbook(&bytes, "Monster Scrap Book", "", "");
    let mut catalog = MonsterLibraryCatalog::new(StableId("monster-library:probe".into()));
    catalog.sources.push(decoded.source.clone());
    catalog.built_ins = decoded.entries.clone();
    if let Err(error) = catalog.validate() {
        return report_error(format!("Monster Scrap Book validation failed: {error}"));
    }
    let visible = decoded
        .entries
        .iter()
        .filter(|entry| !entry.is_blank_builtin_placeholder())
        .count();
    let protected = decoded
        .entries
        .iter()
        .filter(|entry| entry.ownership == MonsterLibraryOwnership::BuiltIn)
        .count();
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "path": path,
            "sha256": decoded.source.sha256,
            "bytes": decoded.source.byte_length,
            "recordBytes": decoded.source.record_bytes,
            "records": decoded.source.record_count,
            "visibleRecords": visible,
            "protectedRecords": protected,
            "trailingBytes": decoded.source.trailing_bytes,
            "firstVisible": decoded.entries.iter().find(|entry| !entry.is_blank_builtin_placeholder()).map(|entry| &entry.label),
            "lastVisible": decoded.entries.iter().rev().find(|entry| !entry.is_blank_builtin_placeholder()).map(|entry| &entry.label),
            "valid": decoded.source.record_bytes == MONSTER_SCRAPBOOK_RECORD_BYTES
                && protected == decoded.entries.len()
                && decoded.source.trailing_bytes == 0,
        }))
        .expect("Monster Scrap Book report serializes")
    );
    if decoded.source.record_bytes == MONSTER_SCRAPBOOK_RECORD_BYTES
        && protected == decoded.entries.len()
        && decoded.source.trailing_bytes == 0
    {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}
