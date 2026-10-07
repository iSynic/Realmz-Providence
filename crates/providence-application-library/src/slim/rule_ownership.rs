use super::native_sources::read;
use serde_json::Value;
use std::collections::BTreeMap;
use std::{collections::BTreeSet, path::Path};

pub(super) fn retain(
    content: &mut Value,
    application: &Value,
    imported: bool,
    selected_rules: bool,
    application_data: &Path,
    scenario_directory: &Path,
) -> Result<(usize, usize, usize, usize), String> {
    if imported && !selected_rules {
        // Compatibility for packages whose producer has not supplied an execution selection.
        let overrides = changed_record_ids(
            &application_data.join("Data Caste"),
            &scenario_directory.join("Data Caste"),
            576,
            "classic.caste.",
        )?;
        let races = retain_only_ids(content, "races", &BTreeSet::new())?;
        let castes = retain_only_ids(content, "castes", &overrides)?;
        return Ok((races, castes, 0, overrides.len()));
    }
    // The selected producer already resolved mechanics, names and eligibility. Exact stock
    // duplicates may be removed; native byte comparison cannot discard a name-only override.
    let races = retain_exact_application_duplicates(content, application, "races")?;
    let castes = retain_exact_application_duplicates(content, application, "castes")?;
    Ok((races, castes, races, castes))
}

fn changed_record_ids(
    application_path: &Path,
    scenario_path: &Path,
    record_bytes: usize,
    id_prefix: &str,
) -> Result<BTreeSet<String>, String> {
    if !scenario_path.is_file() {
        return Ok(BTreeSet::new());
    }
    let application = read(application_path)?;
    let scenario = read(scenario_path)?;
    if application.len() % record_bytes != 0 || scenario.len() != application.len() {
        return Err(format!(
            "{} does not match {}-byte application record geometry",
            scenario_path.display(),
            record_bytes
        ));
    }
    Ok(application
        .chunks_exact(record_bytes)
        .zip(scenario.chunks_exact(record_bytes))
        .enumerate()
        .filter(|(_, (application, scenario))| application != scenario)
        .map(|(index, _)| format!("{id_prefix}{}", index + 1))
        .collect())
}

fn retain_only_ids(
    scenario: &mut Value,
    section: &str,
    retained_ids: &BTreeSet<String>,
) -> Result<usize, String> {
    let scenario_entries = scenario
        .get_mut(section)
        .and_then(Value::as_array_mut)
        .ok_or_else(|| format!("scenario content has no {section} array"))?;
    let before = scenario_entries.len();
    scenario_entries.retain(|entry| {
        entry
            .get("id")
            .and_then(Value::as_str)
            .is_some_and(|id| retained_ids.contains(id))
    });
    Ok(before - scenario_entries.len())
}

fn retain_exact_application_duplicates(
    scenario: &mut Value,
    application: &Value,
    section: &str,
) -> Result<usize, String> {
    let application_entries = application
        .get(section)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("application content has no {section} array"))?;
    let by_id = application_entries
        .iter()
        .map(|entry| {
            entry
                .get("id")
                .and_then(Value::as_str)
                .map(|id| (id.to_string(), entry))
                .ok_or_else(|| format!("application {section} entry has no string id"))
        })
        .collect::<Result<BTreeMap<_, _>, _>>()?;
    let entries = scenario
        .get_mut(section)
        .and_then(Value::as_array_mut)
        .ok_or_else(|| format!("scenario content has no {section} array"))?;
    let before = entries.len();
    entries.retain(|entry| {
        let Some(id) = entry.get("id").and_then(Value::as_str) else {
            return true;
        };
        by_id.get(id).is_none_or(|stock| *stock != entry)
    });
    Ok(before - entries.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn selected_rules_preserve_names_mechanics_and_eligibility_and_remove_only_exact_duplicates() {
        let application = json!({
            "races":[{"id":"classic.race.1","name":"Human","baseMovement":12},{"id":"classic.race.2","name":"Elf","baseMovement":10}],
            "castes":[{"id":"classic.caste.1","name":"Warrior","eligibleRaceIds":["classic.race.1"]}]
        });
        let mut selected = application.clone();
        selected["races"][0]["name"] = json!("Swordlander");
        selected["castes"][0]["eligibleRaceIds"] = json!(["classic.race.1", "classic.race.2"]);
        let absent = Path::new("not-read-for-selected-rules");
        let counts = retain(&mut selected, &application, true, true, absent, absent).unwrap();
        assert_eq!(counts.0, 1);
        assert_eq!(counts.1, 0);
        assert_eq!(selected["races"][0]["name"], "Swordlander");
        assert_eq!(selected["races"][0]["baseMovement"], 12);
        assert_eq!(
            selected["castes"][0]["eligibleRaceIds"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        let mut local = application.clone();
        local["races"][0]["baseMovement"] = json!(37);
        retain(&mut local, &application, true, true, absent, absent).unwrap();
        assert_eq!(local["races"][0]["baseMovement"], 37);
        assert!(local["castes"].as_array().unwrap().is_empty());
    }
}
