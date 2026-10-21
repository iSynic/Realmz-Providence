//! Allocate exact native keys without reusing catalog or retained-source ownership.
use super::*;
use providence_core::model::ClassicResourceKey;
use std::collections::BTreeSet;

pub(super) fn read(
    session: &EditorSession,
    project: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    params: &Value,
) -> Result<Value, String> {
    check_project(session, params)?;
    let kind = required_string(params, "kind")?;
    let (family, candidates) = candidates(&kind)?;
    let occupied = occupied_keys(session, project, catalogs)?;
    let keys = |number| {
        let mut keys = vec![ClassicResourceKey {
            resource_type: family.into(),
            resource_id: number,
        }];
        if kind == "combat-icon" {
            keys.push(ClassicResourceKey {
                resource_type: family.into(),
                resource_id: number + 308,
            });
        }
        keys
    };
    let number = candidates
        .into_iter()
        .find(|number| keys(*number).iter().all(|key| !occupied.contains(key)))
        .ok_or("No unowned native resource slot remains for this media family.")?;
    Ok(
        json!({"revision":session.revision(),"kind":kind,"resourceId":number,"resourceKeys":keys(number),
        "reserved":false,"requiresReview":true,"allocationScope":"scenario; commit rechecks exact resource ownership"}),
    )
}

fn candidates(kind: &str) -> Result<(&'static str, Vec<i32>), String> {
    Ok(match kind {
        "picture" => ("PICT", (30000..=30128).collect()),
        "sound" => ("snd ", (200..=500).collect()),
        "music" => ("MOD ", (1..=3).collect()),
        "text-resource" => ("TEXT", (1..=32767).collect()),
        "icon" | "portrait" => ("cicn", (1..=32767).collect()),
        "combat-icon" => ("cicn", (1..=32459).collect()),
        "special-land-tile" => ("cicn", (-32768..=-1).rev().collect()),
        _ => return Err("Choose a supported scenario media family; new atlases use the Custom Landlook workflow.".into()),
    })
}

fn occupied_keys(
    session: &EditorSession,
    project: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
) -> Result<BTreeSet<ClassicResourceKey>, String> {
    let mut keys: BTreeSet<_> = session
        .snapshot()
        .assets
        .iter()
        .filter_map(|asset| asset.classic_resource.clone())
        .collect();
    if let Some(application) = catalogs.application_media {
        keys.extend(
            application
                .assets
                .iter()
                .filter_map(|asset| asset.descriptor.classic_resource.clone()),
        );
    }
    for source in &session.snapshot().classic_sources {
        for (index, filename) in providence_core::codecs::SCENARIO_MUSIC_FILES
            .iter()
            .enumerate()
        {
            if source.native_path.eq_ignore_ascii_case(filename) {
                keys.insert(ClassicResourceKey {
                    resource_type: "MOD ".into(),
                    resource_id: index as i32 + 1,
                });
            }
        }
        if !source.native_path.eq_ignore_ascii_case("Scenario.rsrc") {
            continue;
        }
        if source.byte_length > 16 * 1024 * 1024 {
            return Err("The retained resource file is too large to allocate safely.".into());
        }
        let bytes = project
            .ok_or("Open a persistent project before allocating retained media.")?
            .read_blob(&source.blob)
            .map_err(|error| error.to_string())?;
        let entries = providence_core::codecs::parse_resource_entries_preserving_duplicates(&bytes)
            .map_err(|error| error.to_string())?;
        for entry in entries {
            keys.insert(ClassicResourceKey {
                resource_type: String::from_utf8_lossy(&entry.resource_type).into_owned(),
                resource_id: entry.id.into(),
            });
        }
    }
    Ok(keys)
}

#[cfg(test)]
mod tests {
    use super::*;
    use providence_core::model::{ClassicSourceBlob, ProjectOrigin, ProjectSnapshot};

    #[test]
    fn quarantined_music_and_both_keys_of_an_appearance_pair_stay_reserved() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("media-slots".into()));
        snapshot.origin = ProjectOrigin::Imported {
            compatibility_annex: BlobId("sha256:prepared-annex".into()),
        };
        snapshot.classic_sources.push(ClassicSourceBlob {
            native_path: "Custom 1 Music".into(),
            blob: BlobId("sha256:unread-quarantine".into()),
            byte_length: 1,
        });
        let session = EditorSession::new(snapshot);
        let slot = read(
            &session,
            None,
            CatalogViews::default(),
            &json!({"expectedRevision":0,"kind":"music"}),
        )
        .unwrap();
        assert_eq!(slot["resourceId"], 2);
        let pair = read(
            &session,
            None,
            CatalogViews::default(),
            &json!({"expectedRevision":0,"kind":"combat-icon"}),
        )
        .unwrap();
        assert_eq!(pair["resourceKeys"][0]["resourceId"], 1);
        assert_eq!(pair["resourceKeys"][1]["resourceId"], 309);
        assert!(!session.can_undo());
    }
}
