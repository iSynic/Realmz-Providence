use std::{
    collections::BTreeMap,
    fs,
    io::{Cursor, Read},
    path::Path,
};

use providence_core::{
    codecs::{
        decode_dungeon_action_points, decode_dungeon_maps, decode_land_action_points,
        decode_land_maps,
    },
    model::{LevelType, ProjectSnapshot, StableId},
    rebuilt::{
        REBUILT_V6_SCHEMA_SHA256, RebuiltV3FileInput, project_rebuilt_v3_trigger_programs,
        recompile_rebuilt_manifest,
    },
};
use providence_rebuilt_package::{inspect_rebuilt_v3_archive, write_rebuilt_v3_archive};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use zip::ZipArchive;

/// Refreshes map admission data through the canonical writer while preserving prior package fixes.
pub fn run(args: &[String]) -> Result<(), String> {
    if args.len() != 3 {
        return Err("correct-classic-map-markers <package-directory> <classic-scenarios-root> <new-output-directory>".into());
    }
    let input = Path::new(&args[0]);
    let native = Path::new(&args[1]);
    let output = Path::new(&args[2]);
    if output.exists() {
        return Err(format!("refusing existing output {}", output.display()));
    }
    let mut paths = fs::read_dir(input)
        .map_err(|e| e.to_string())?
        .map(|entry| entry.map(|entry| entry.path()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    paths.retain(|path| path.extension().is_some_and(|ext| ext == "realmz2"));
    paths.sort();
    if paths.is_empty() {
        return Err("no scenario archives found".into());
    }
    fs::create_dir_all(output).map_err(|e| e.to_string())?;
    let mut receipts = Vec::new();
    for path in paths {
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        let (corrected, mut receipt) = correct(&bytes, native)?;
        let destination = output.join(path.file_name().ok_or("missing archive filename")?);
        fs::write(&destination, &corrected).map_err(|e| e.to_string())?;
        receipt["sourceFile"] = json!(path);
        receipt["outputFile"] = json!(destination);
        receipts.push(receipt);
    }
    let report = json!({"kind":"providence.classic-map-marker-correction", "schemaVersion":6,
        "schemaSha256":REBUILT_V6_SCHEMA_SHA256,
        "compiler":providence_core::build_identity::current("providence-application-library"), "scenarios":receipts});
    fs::write(
        output.join("correction-receipt.json"),
        serde_json::to_vec_pretty(&report).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    println!(
        "Corrected {} scenario archives in {}",
        receipts.len(),
        output.display()
    );
    Ok(())
}

fn correct(source: &[u8], native_root: &Path) -> Result<(Vec<u8>, Value), String> {
    let inspection = inspect_rebuilt_v3_archive(Cursor::new(source)).map_err(|e| e.to_string())?;
    if inspection.manifest.compiler.project_origin != "imported" {
        return Err("map refresh requires imported Classic provenance".into());
    }
    let name = &inspection.manifest.name;
    if Path::new(name).components().count() != 1 {
        return Err("nonportable native scenario name".into());
    }
    let (snapshot, native_receipts) = native_snapshot(&native_root.join(name))?;
    let mut files = archive_files(source)?;
    let before = files.clone();
    let mut world: Value =
        serde_json::from_slice(&files["world.json"]).map_err(|e| e.to_string())?;
    let mut scenario: Value =
        serde_json::from_slice(&files["scenario.json"]).map_err(|e| e.to_string())?;
    let previous_program_order = scenario["programs"]
        .as_array()
        .ok_or("missing programs")?
        .iter()
        .map(|program| program["id"].clone())
        .collect::<Vec<_>>();
    let previous_documents = document_receipts(&before)?;
    let mut markers = Vec::new();
    hydrate_maps(&mut world, &snapshot, &mut markers)?;
    let restored = restore_empty_records(&mut world, &mut scenario, &snapshot)?;
    files.insert("world.json".into(), canonical(&world)?);
    files.insert("scenario.json".into(), canonical(&scenario)?);
    for path in [
        "content.json",
        "world.json",
        "scenario.json",
        "assets/index.json",
    ] {
        let mut value: Value = serde_json::from_slice(&files[path]).map_err(|e| e.to_string())?;
        value["schemaVersion"] = json!(6);
        files.insert(path.into(), canonical(&value)?);
    }
    let preservation = preservation_receipt(&before, &files, &restored)?;
    let (output, manifest) = corrected_archive(&inspection.manifest, &files)?;
    let receipt = json!({"name":name,"sourceSha256":hash(source),"outputSha256":hash(&output),
        "sourcePackageHash":inspection.manifest.package_hash,"outputPackageHash":manifest.package_hash,
        "sourceContentId":inspection.manifest.content_id,"outputContentId":manifest.content_id,
        "nativeInputs":native_receipts,"markerChanges":markers,"restoredEmptyRecords":restored,
        "previousDocuments":previous_documents,"previousProgramOrder":previous_program_order,
        "preservation":preservation,"preservedMediaFiles":inspection.media_file_count});
    Ok((output, receipt))
}

fn native_snapshot(root: &Path) -> Result<(ProjectSnapshot, Vec<Value>), String> {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("marker-correction".into()));
    let mut native_receipts = Vec::new();
    for (file, dungeon, points) in [
        ("Data LD", false, false),
        ("Data DL", true, false),
        ("Data DD", false, true),
        ("Data DDD", true, true),
    ] {
        let path = root.join(file);
        if !path.exists() {
            if !dungeon {
                return Err(format!("missing native {}", path.display()));
            }
            continue;
        }
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        native_receipts.push(json!({"path":path,"bytes":bytes.len(),"sha256":hash(&bytes)}));
        if points {
            let records = if dungeon {
                decode_dungeon_action_points(&bytes).records
            } else {
                decode_land_action_points(&bytes).records
            };
            snapshot.world.action_points.extend(records);
        } else {
            let records = if dungeon {
                decode_dungeon_maps(&bytes).records
            } else {
                decode_land_maps(&bytes).records
            };
            snapshot.world.maps.extend(records);
        }
    }
    Ok((snapshot, native_receipts))
}

fn document_receipts(
    before: &BTreeMap<String, Vec<u8>>,
) -> Result<BTreeMap<String, Value>, String> {
    before
        .iter()
        .filter(|(path, _)| path.ends_with(".json"))
        .map(|(path, bytes)| {
            let value: Value = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
            Ok((
                path.clone(),
                json!({"sha256":hash(bytes),"schemaVersion":value["schemaVersion"]}),
            ))
        })
        .collect::<Result<BTreeMap<_, _>, String>>()
}

fn corrected_archive(
    source: &providence_core::rebuilt::RebuiltV3Manifest,
    files: &BTreeMap<String, Vec<u8>>,
) -> Result<(Vec<u8>, providence_core::rebuilt::RebuiltV3Manifest), String> {
    let inputs = files
        .iter()
        .map(|(path, bytes)| RebuiltV3FileInput { path, bytes })
        .collect::<Vec<_>>();
    let mut contract = source.clone();
    contract.schema_version = 6;
    contract.schema_hash = REBUILT_V6_SCHEMA_SHA256.into();
    let identity = providence_core::build_identity::asserted_compiler_identity(
        None,
        &contract.engine.minimum_version,
    )?;
    let manifest =
        recompile_rebuilt_manifest(&contract, &identity, &inputs).map_err(|e| e.to_string())?;
    let output = write_rebuilt_v3_archive(Cursor::new(Vec::new()), &manifest, &inputs)
        .map_err(|e| e.to_string())?
        .into_inner();
    inspect_rebuilt_v3_archive(Cursor::new(&output)).map_err(|e| e.to_string())?;
    Ok((output, manifest.manifest))
}

fn hydrate_maps(
    world: &mut Value,
    snapshot: &ProjectSnapshot,
    changes: &mut Vec<Value>,
) -> Result<(), String> {
    for map in world["maps"].as_array_mut().ok_or("world maps missing")? {
        let kind = if map["levelType"] == "land" {
            LevelType::Land
        } else {
            LevelType::Dungeon
        };
        let level = map["levelIndex"].as_u64().ok_or("missing level index")? as u32;
        let native = snapshot
            .world
            .maps
            .iter()
            .find(|m| m.level_type == kind && m.native_index == level)
            .ok_or("native map absent")?;
        let width = map["width"].as_u64().ok_or("missing width")? as usize;
        let height = map["height"].as_u64().ok_or("missing height")? as usize;
        if width != 90 || height != 90 || native.tiles.len() != width * height {
            return Err("map dimensions differ from native".into());
        }
        let map_id = map["id"].as_str().ok_or("missing map id")?.to_owned();
        map["classicTileValues"] = json!(native.tiles);
        let cells = map["cells"].as_array_mut().ok_or("missing compact cells")?;
        if cells.len() != native.tiles.len() {
            return Err("compact cell count differs from native".into());
        }
        for (index, cell) in cells.iter_mut().enumerate() {
            let expected_id = format!("{map_id}:cell:{},{}", index % width, index / width);
            if kind == LevelType::Land {
                let raw = native.tiles[index];
                let marked = native_land_marker(raw);
                let features = cell[7].as_array_mut().ok_or("missing compact features")?;
                let before = features.iter().any(|feature| feature[1] == "action-point");
                if before == marked {
                    continue;
                }
                let previous_features = features.clone();
                features.retain(|feature| feature[1] != "action-point");
                if marked {
                    features.insert(
                        0,
                        json!([
                            format!("{expected_id}:action-point"),
                            "action-point",
                            "active",
                            null
                        ]),
                    );
                }
                if previous_features != *features {
                    changes.push(json!({"mapId":map_id,"cellIndex":index,"x":index % width,"y":index / width,"rawTile":raw,"wasMarked":before,"isMarked":marked,"previousFeatures":previous_features,"correctedFeatures":features}));
                }
            }
        }
    }
    Ok(())
}

fn native_land_marker(raw: i16) -> bool {
    let magnitude = if raw < 0 {
        -i32::from(raw)
    } else {
        i32::from((raw as u16) & !0x6000)
    };
    magnitude > 999
}

fn restore_empty_records(
    world: &mut Value,
    scenario: &mut Value,
    snapshot: &ProjectSnapshot,
) -> Result<Vec<Value>, String> {
    let mut missing = snapshot.clone();
    missing.world.action_points.retain(|point| {
        point.coordinate.is_some()
            && point.classic_door_id != 0
            && point.actions.is_empty()
            && !world["triggers"].as_array().is_some_and(|triggers| {
                triggers.iter().any(|trigger| {
                    trigger["mapId"]
                        == format!(
                            "{}:{}",
                            if point.level_type == LevelType::Land {
                                "land"
                            } else {
                                "dungeon"
                            },
                            point.level_index
                        )
                        && trigger["classicRecordIndex"] == point.record_index
                })
            })
    });
    let projection = project_rebuilt_v3_trigger_programs(&missing).map_err(|e| e.to_string())?;
    let mut restored = Vec::new();
    for trigger in projection.triggers {
        restored.push(restore_record(world, trigger)?);
    }
    if !restored.is_empty() {
        scenario["programs"]
            .as_array_mut()
            .ok_or("missing programs")?
            .extend(
                projection
                    .programs
                    .into_iter()
                    .map(|program| json!(program)),
            );
        scenario["programs"]
            .as_array_mut()
            .ok_or("missing programs")?
            .sort_by_key(|program| program["id"].as_str().unwrap_or("").to_owned());
    }
    Ok(restored)
}

fn restore_record(
    world: &mut Value,
    trigger: providence_core::rebuilt::RebuiltV3Trigger,
) -> Result<Value, String> {
    let map_id = trigger.map_id.as_ref().ok_or("missing map id")?;
    let coordinate = trigger.coordinate.ok_or("missing coordinate")?;
    let map = world["maps"]
        .as_array_mut()
        .ok_or("missing maps")?
        .iter_mut()
        .find(|m| m["id"] == map_id.0)
        .ok_or("empty record map absent")?;
    let index = usize::from(coordinate.y) * 90 + usize::from(coordinate.x);
    let refs = map["cells"][index][4]
        .as_array_mut()
        .ok_or("missing trigger refs")?;
    let previous_refs = refs.clone();
    refs.push(json!(trigger.id));
    refs.sort_by_key(|id| {
        id.as_str()
            .unwrap_or("")
            .rsplit(':')
            .next()
            .unwrap_or("")
            .parse::<u32>()
            .unwrap_or(u32::MAX)
    });
    let receipt = json!({"id":trigger.id,"programId":trigger.program_id,"mapId":map_id,"cellIndex":index,"coordinate":coordinate,"chancePercent":trigger.chance_percent,"previousCellRefs":previous_refs});
    world["triggers"]
        .as_array_mut()
        .ok_or("missing triggers")?
        .push(json!(trigger));
    Ok(receipt)
}

fn preservation_receipt(
    before: &BTreeMap<String, Vec<u8>>,
    after: &BTreeMap<String, Vec<u8>>,
    restored: &[Value],
) -> Result<Value, String> {
    let restored_ids = restored
        .iter()
        .map(|row| row["id"].as_str().unwrap_or(""))
        .collect::<Vec<_>>();
    let mut receipts = serde_json::Map::new();
    for path in providence_core::rebuilt::REBUILT_V3_REQUIRED_DOCUMENTS {
        let mut values = Vec::new();
        for files in [before, after] {
            let mut value: Value =
                serde_json::from_slice(&files[path]).map_err(|e| e.to_string())?;
            value
                .as_object_mut()
                .ok_or("document object missing")?
                .remove("schemaVersion");
            if path == "scenario.json" {
                let programs = value["programs"].as_array_mut().ok_or("programs missing")?;
                programs.retain(|p| {
                    !restored_ids
                        .iter()
                        .any(|id| p["id"] == format!("trigger:{id}"))
                });
                programs.sort_by_key(|p| p["id"].as_str().unwrap_or("").to_owned());
            }
            if path == "world.json" {
                strip_map_admission(&mut value, &restored_ids)?;
            }
            values.push(value);
        }
        if values[0] != values[1] {
            return Err(format!("correction unexpectedly changed preserved {path}"));
        }
        receipts.insert(path.into(),json!({"sourceSha256":hash(&canonical(&values[0])?),"outputSha256":hash(&canonical(&values[1])?),"identical":true}));
    }
    let media_before = before
        .iter()
        .filter(|(path, _)| path.starts_with("assets/media/"))
        .collect::<BTreeMap<_, _>>();
    let media_after = after
        .iter()
        .filter(|(path, _)| path.starts_with("assets/media/"))
        .collect::<BTreeMap<_, _>>();
    if media_before != media_after {
        return Err("correction changed media payloads".into());
    }
    let inventory = media_before
        .iter()
        .map(|(path, bytes)| (path.as_str(), hash(bytes)))
        .collect::<BTreeMap<_, _>>();
    receipts.insert("mediaInventory".into(),json!({"sha256":hash(&serde_json::to_vec(&inventory).map_err(|e| e.to_string())?),"identical":true,"files":inventory.len()}));
    Ok(Value::Object(receipts))
}

fn strip_map_admission(world: &mut Value, restored: &[&str]) -> Result<(), String> {
    world["triggers"]
        .as_array_mut()
        .ok_or("triggers missing")?
        .retain(|t| !restored.iter().any(|id| t["id"] == *id));
    for map in world["maps"].as_array_mut().ok_or("maps missing")? {
        map.as_object_mut()
            .ok_or("map object missing")?
            .remove("classicTileValues");
        for cell in map["cells"].as_array_mut().ok_or("cells missing")? {
            cell[4]
                .as_array_mut()
                .ok_or("refs missing")?
                .retain(|t| !restored.iter().any(|id| t == *id));
            cell[7]
                .as_array_mut()
                .ok_or("features missing")?
                .retain(|f| f[1] != "action-point");
        }
    }
    Ok(())
}

fn archive_files(bytes: &[u8]) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let mut files = BTreeMap::new();
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|e| e.to_string())?;
        let name = file.name().map_err(|e| e.to_string())?.into_owned();
        if name == "manifest.json" {
            continue;
        }
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        files.insert(name, bytes);
    }
    Ok(files)
}

fn canonical(value: &Value) -> Result<Vec<u8>, String> {
    serde_json::to_vec(value).map_err(|e| e.to_string())
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn marker_admission_ignores_positive_note_path_bits_and_preserves_negative_overlays() {
        for raw in [158, 111, 40, 0x6000 | 158] {
            assert!(!native_land_marker(raw));
        }
        for raw in [1076, 1111, 2158, 3158, -1158, -3158] {
            assert!(native_land_marker(raw));
        }
    }
}
