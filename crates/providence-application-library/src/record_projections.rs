//! Retain explicitly reviewed projections without editing native source payloads.
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::{Cursor, Read},
    path::Path,
};

use providence_core::rebuilt::{RebuiltV3FileInput, recompile_rebuilt_manifest};
use providence_rebuilt_package::{inspect_rebuilt_v3_archive, write_rebuilt_v3_archive};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Receipt {
    kind: String,
    format_version: u8,
    campaigns: Vec<Campaign>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Campaign {
    campaign_id: String,
    source_hashes: BTreeMap<String, String>,
    authority_receipts: BTreeMap<String, String>,
    fields: Vec<Field>,
    #[serde(default)]
    world_projection: Option<crate::world_projections::WorldProjection>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Field {
    document: String,
    family: String,
    id: Value,
    slot: Option<u64>,
    field: String,
    before: Value,
    after: Value,
    authority: String,
}

fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub fn run(args: &[String]) -> Result<(), String> {
    if !(4..=5).contains(&args.len()) {
        return Err("Expected input.realmz2 receipt.json new-output.realmz2 new-report.json [baseline.realmz2]".into());
    }
    if Path::new(&args[2]).exists() || Path::new(&args[3]).exists() {
        return Err("Projection output already exists".into());
    }
    let input = fs::read(&args[0]).map_err(|e| e.to_string())?;
    let inspection = inspect_rebuilt_v3_archive(Cursor::new(&input)).map_err(|e| e.to_string())?;
    if inspection.manifest.schema_version != 7 {
        return Err("Reviewed projections require schema v7".into());
    }
    let receipt_bytes = fs::read(&args[1]).map_err(|e| e.to_string())?;
    let receipt = read_projection_receipt(&receipt_bytes)?;
    let campaign = receipt
        .campaigns
        .iter()
        .find(|c| c.campaign_id == inspection.manifest.campaign_id.0)
        .ok_or("No projection receipt for this campaign")?;
    let mut files = projection_files(&input)?;
    let mut documents = BTreeMap::new();
    for name in ["content.json", "scenario.json"] {
        documents.insert(
            name.into(),
            serde_json::from_slice(&files[name]).map_err(|e| e.to_string())?,
        );
    }
    apply(campaign, &mut documents)?;
    let movement_fields_retained = retain_reviewed_world(campaign, args, &mut files)?;
    for field in &campaign.fields {
        files.insert(
            field.document.clone(),
            serde_json::to_vec(&documents[&field.document]).map_err(|e| e.to_string())?,
        );
    }
    let identity = providence_core::build_identity::asserted_compiler_identity(None, "0.1.0")?;
    let inputs = files
        .iter()
        .map(|(path, bytes)| RebuiltV3FileInput { path, bytes })
        .collect::<Vec<_>>();
    let manifest = recompile_rebuilt_manifest(&inspection.manifest, &identity, &inputs)
        .map_err(|e| e.to_string())?;
    let mut output = Cursor::new(Vec::new());
    write_rebuilt_v3_archive(&mut output, &manifest, &inputs).map_err(|e| e.to_string())?;
    let bytes = output.into_inner();
    inspect_rebuilt_v3_archive(Cursor::new(&bytes)).map_err(|e| e.to_string())?;
    let report = json!({"kind":"realmz.reviewed-record-projection-result", "formatVersion":1,
        "campaignId":campaign.campaign_id, "inputArchiveSha256":hash(&input),
        "receiptSha256":hash(&receipt_bytes), "archiveSha256":hash(&bytes),
        "packageHash":manifest.manifest.package_hash, "fieldsApplied":campaign.fields.len(),
        "movementFieldsRetained":movement_fields_retained,
        "compiler":{"version":identity.version,"commit":identity.commit,"minimumEngineVersion":identity.minimum_engine_version}, "nativeSourcePayloads":"unchanged"});
    fs::write(&args[2], bytes).map_err(|e| e.to_string())?;
    let report_bytes = serde_json::to_vec_pretty(&report).map_err(|e| e.to_string())?;
    fs::write(&args[3], report_bytes).map_err(|e| e.to_string())?;
    println!("{report}");
    Ok(())
}

fn apply(campaign: &Campaign, documents: &mut BTreeMap<String, Value>) -> Result<(), String> {
    if campaign.source_hashes.is_empty() && !campaign.fields.is_empty() {
        return Err("A projection correction requires exact native source pins".into());
    }
    let sources = documents["content.json"]["classicRecords"]["sources"]
        .as_array()
        .ok_or("Native source facts missing")?;
    for (path, digest) in &campaign.source_hashes {
        let matches = sources
            .iter()
            .filter(|s| s["nativePath"] == *path && s["sha256"] == *digest)
            .count();
        if matches != 1 {
            return Err(format!("Projection native source pin differs: {path}"));
        }
    }
    let mut seen = BTreeSet::new();
    for field in &campaign.fields {
        apply_field(campaign, field, documents, &mut seen)?;
    }
    Ok(())
}

fn read_projection_receipt(bytes: &[u8]) -> Result<Receipt, String> {
    let receipt: Receipt = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
    if receipt.kind != "realmz.reviewed-record-projections" || receipt.format_version != 1 {
        return Err("Unsupported projection receipt".into());
    }
    let mut identities = BTreeSet::new();
    for campaign in &receipt.campaigns {
        if !identities.insert(&campaign.campaign_id) {
            return Err("Duplicate campaign receipt".into());
        }
    }
    drop(identities);
    Ok(receipt)
}

fn projection_files(input: &[u8]) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(input)).map_err(|e| e.to_string())?;
    let mut files = BTreeMap::new();
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
        let name = entry.name().map_err(|e| e.to_string())?.into_owned();
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        if files.insert(name, bytes).is_some() {
            return Err("Duplicate archive entry".into());
        }
    }
    files.remove("manifest.json");
    Ok(files)
}

fn retain_reviewed_world(
    campaign: &Campaign,
    args: &[String],
    files: &mut BTreeMap<String, Vec<u8>>,
) -> Result<usize, String> {
    let mut changes = 0;
    if let Some(world) = &campaign.world_projection {
        if !campaign.source_hashes.contains_key("Data LD")
            && !campaign.source_hashes.contains_key("Data DL")
        {
            return Err("Movement retention requires native map source pins".into());
        }
        let path = args
            .get(4)
            .ok_or("Movement retention requires the exact baseline archive")?;
        let baseline = fs::read(path).map_err(|e| e.to_string())?;
        let mut baseline_zip =
            zip::ZipArchive::new(Cursor::new(&baseline)).map_err(|e| e.to_string())?;
        let mut world_bytes = Vec::new();
        baseline_zip
            .by_name("world.json")
            .map_err(|e| e.to_string())?
            .read_to_end(&mut world_bytes)
            .map_err(|e| e.to_string())?;
        let (retained, retained_count) =
            crate::world_projections::apply(world, &files["world.json"], &world_bytes, &baseline)?;
        files.insert(
            "world.json".into(),
            serde_json::to_vec(&retained).map_err(|e| e.to_string())?,
        );
        changes = retained_count;
    } else if args.len() != 4 {
        return Err("An unused movement baseline is not permitted".into());
    }
    Ok(changes)
}

fn apply_field(
    campaign: &Campaign,
    field: &Field,
    documents: &mut BTreeMap<String, Value>,
    seen: &mut BTreeSet<String>,
) -> Result<(), String> {
    if !campaign.authority_receipts.contains_key(&field.authority) {
        return Err("Unlisted correction authority".into());
    }
    validate_field_contract(field)?;
    let key = format!(
        "{}:{}:{}:{:?}:{}",
        field.document, field.family, field.id, field.slot, field.field
    );
    if !seen.insert(key) {
        return Err("Duplicate projection field".into());
    }
    let rows = documents
        .get_mut(&field.document)
        .ok_or("Projection document missing")?
        .get_mut(&field.family)
        .and_then(Value::as_array_mut)
        .ok_or("Projection family missing")?;
    let indexes = rows
        .iter()
        .enumerate()
        .filter(|(_, row)| row["id"] == field.id)
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    if indexes.len() != 1 {
        return Err("Projection identity is absent or ambiguous".into());
    }
    let row = projection_row(&mut rows[indexes[0]], field)?;
    let target = row
        .get_mut(&field.field)
        .ok_or("Projection field missing")?;
    if *target != field.before {
        return Err("Projection preimage differs".into());
    }
    *target = field.after.clone();
    Ok(())
}

fn validate_field_contract(field: &Field) -> Result<(), String> {
    let allowed = matches!(
        (
            field.document.as_str(),
            field.family.as_str(),
            field.field.as_str()
        ),
        ("content.json", "messages", "text")
            | ("content.json", "items", "description" | "name")
            | ("scenario.json", "programs", "extraCode")
    );
    if !allowed {
        return Err("Projection field is outside the reviewed presentation contract".into());
    }
    Ok(())
}

fn projection_row<'a>(mut row: &'a mut Value, field: &Field) -> Result<&'a mut Value, String> {
    if field.family == "programs" {
        let slot = field.slot.ok_or("Program slot missing")?;
        let instructions = row["instructions"]
            .as_array_mut()
            .ok_or("Program instructions missing")?;
        row = instructions
            .iter_mut()
            .find(|i| i["slot"].as_u64() == Some(slot))
            .ok_or("Program slot missing")?;
        let opcode = row["opcode"].as_i64().ok_or("Program opcode missing")?;
        // The historical Trouble receipt changes only unused annotations on
        // Show Message and Keep Codes. Executable operands have no route here.
        if ![1, 24].contains(&opcode) || !field.after.is_null() {
            return Err(
                "An executable operand cannot be changed as a presentation projection".into(),
            );
        }
    } else if field.slot.is_some() || !field.before.is_string() || !field.after.is_string() {
        return Err("Invalid text projection".into());
    }
    Ok(row)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_source_and_field_preimages_gate_display_only_changes() {
        let receipt = json!({"campaignId":"fixture", "sourceHashes":{"Data SD2":"abc"},
            "authorityReceipts":{"reviewed.json":"def"}, "fields":[{"document":"content.json", "family":"messages", "id":7,
            "field":"text", "before":"before", "after":"after", "authority":"reviewed.json"}]});
        let campaign: Campaign = serde_json::from_value(receipt.clone()).unwrap();
        let mut documents = BTreeMap::from([(
            "content.json".into(),
            json!({"classicRecords":{"sources":[{"nativePath":"Data SD2","sha256":"abc"}]},"messages":[{"id":7,"text":"before"}]}),
        )]);
        apply(&campaign, &mut documents).unwrap();
        assert_eq!(documents["content.json"]["messages"][0]["text"], "after");
        assert!(apply(&campaign, &mut documents).is_err());
        let mut wrong_source = receipt.clone();
        wrong_source["sourceHashes"]["Data SD2"] = json!("changed");
        assert!(
            apply(
                &serde_json::from_value(wrong_source).unwrap(),
                &mut documents
            )
            .is_err()
        );
        let mut gameplay = receipt;
        gameplay["fields"][0]["field"] = json!("id");
        assert!(apply(&serde_json::from_value(gameplay).unwrap(), &mut documents).is_err());
    }

    #[test]
    fn reviewed_item_names_require_exact_source_authority_and_text_preimages() {
        let receipt = json!({"campaignId":"fixture", "sourceHashes":{"Scenario.rsrc":"abc"},
            "authorityReceipts":{"reviewed.json":"def"}, "fields":[{"document":"content.json", "family":"items", "id":"classic.item.992",
            "field":"name", "before":"partial", "after":"Unnamed Classic item 992", "authority":"reviewed.json"}]});
        let campaign: Campaign = serde_json::from_value(receipt).unwrap();
        let mut documents = BTreeMap::from([(
            "content.json".into(),
            json!({"classicRecords":{"sources":[{"nativePath":"Scenario.rsrc","sha256":"abc"}]},
                "items":[{"id":"classic.item.992","name":"partial","value":7}]}),
        )]);
        apply(&campaign, &mut documents).unwrap();
        assert_eq!(
            documents["content.json"]["items"][0]["name"],
            "Unnamed Classic item 992"
        );
        assert_eq!(documents["content.json"]["items"][0]["value"], 7);
        assert!(apply(&campaign, &mut documents).is_err());
        let mut unreviewed = campaign;
        unreviewed.authority_receipts.clear();
        assert!(
            apply(&unreviewed, &mut documents)
                .unwrap_err()
                .contains("authority")
        );
    }
}
