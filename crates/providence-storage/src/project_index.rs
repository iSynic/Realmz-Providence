use crate::IndexSummary;
use crate::ProjectStore;
use crate::SearchHit;
use crate::blob_store::sha256;
use crate::database::create_schema;
use crate::errors::StoreError;
use crate::index_cache::INDEX_FORMAT_VERSION;
use providence_core::codecs::effective_caste_name;
use providence_core::codecs::effective_race_name;
use providence_core::codecs::player_map_names;
use providence_core::model::ProjectSnapshot;
use providence_core::session::Revision;
use providence_core::session::references_for;
use providence_core::snapshot::to_deterministic_json;
use rusqlite::Connection;
use rusqlite::params;
use serde_json::Value;
use std::fs;

impl ProjectStore {
    pub fn rebuild_index(&self, snapshot: &ProjectSnapshot) -> Result<(), StoreError> {
        let snapshot_sha256 = match fs::read(self.snapshot_path()) {
            Ok(bytes) => sha256(&bytes),
            Err(_) => sha256(to_deterministic_json(snapshot)?.as_bytes()),
        };
        let mut connection = self.open_database()?;
        let transaction = connection.transaction()?;
        create_schema(&transaction)?;
        transaction.execute("DELETE FROM entity", [])?;
        transaction.execute("DELETE FROM derived_reference", [])?;
        transaction.execute("DELETE FROM metadata WHERE key = 'snapshot_sha256'", [])?;
        transaction.execute("DELETE FROM metadata WHERE key = 'index_dirty'", [])?;

        index_text_labels(&transaction, snapshot)?;
        index_maps(&transaction, snapshot)?;
        index_encounter_text(&transaction, snapshot)?;
        index_other_encounters(&transaction, snapshot)?;
        index_combat(&transaction, snapshot)?;
        index_economy(&transaction, snapshot)?;
        index_rules(&transaction, snapshot)?;
        index_items_spells(&transaction, snapshot)?;
        index_media(&transaction, snapshot)?;
        index_references(&transaction, snapshot)?;
        transaction.execute(
            "INSERT INTO metadata(key, value) VALUES ('snapshot_sha256', ?1)",
            params![snapshot_sha256],
        )?;
        transaction.execute(
            "INSERT OR REPLACE INTO metadata(key, value) VALUES ('index_format_version', ?1)",
            params![INDEX_FORMAT_VERSION],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn index_summary(&self) -> Result<IndexSummary, StoreError> {
        self.ensure_current_index()?;
        let connection = self.open_database()?;
        create_schema(&connection)?;
        Ok(IndexSummary {
            entities: scalar_count(&connection, "entity")?,
            references: scalar_count(&connection, "derived_reference")?,
            journal_entries: scalar_count(&connection, "command_journal")?,
            snapshot_sha256: connection
                .query_row(
                    "SELECT value FROM metadata WHERE key = 'snapshot_sha256'",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or_default(),
        })
    }

    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>, StoreError> {
        self.ensure_current_index()?;
        let connection = self.open_database()?;
        create_schema(&connection)?;
        let pattern = format!("%{}%", query.to_lowercase());
        let mut statement = connection.prepare(
            "SELECT identity, kind, label FROM entity WHERE lower(identity) LIKE ?1 OR lower(label) LIKE ?1 ORDER BY identity LIMIT ?2",
        )?;
        let rows = statement.query_map(params![pattern, limit as i64], |row| {
            Ok(SearchHit {
                identity: row.get(0)?,
                kind: row.get(1)?,
                label: row.get(2)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn journal(&self) -> Result<Vec<(Revision, Value, String)>, StoreError> {
        let connection = self.open_database()?;
        create_schema(&connection)?;
        let mut statement = connection.prepare(
            "SELECT revision, command_json, snapshot_sha256 FROM command_journal ORDER BY revision",
        )?;
        let rows = statement.query_map([], |row| {
            let revision: i64 = row.get(0)?;
            let json: String = row.get(1)?;
            let digest: String = row.get(2)?;
            Ok((revision, json, digest))
        })?;
        rows.map(|row| {
            let (revision, json, digest) = row?;
            let revision =
                u64::try_from(revision).map_err(|_| StoreError::InvalidStoredRevision(revision))?;
            Ok((Revision(revision), serde_json::from_str(&json)?, digest))
        })
        .collect()
    }
}

pub(super) fn scalar_count(connection: &Connection, table: &str) -> Result<u64, StoreError> {
    let sql = match table {
        "entity" => "SELECT COUNT(*) FROM entity",
        "derived_reference" => "SELECT COUNT(*) FROM derived_reference",
        "command_journal" => "SELECT COUNT(*) FROM command_journal",
        _ => unreachable!("bounded internal table name"),
    };
    let count: i64 = connection.query_row(sql, [], |row| row.get(0))?;
    Ok(count as u64)
}

fn index_text_labels(
    transaction: &rusqlite::Transaction<'_>,
    snapshot: &ProjectSnapshot,
) -> Result<(), StoreError> {
    for message in &snapshot.messages {
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'message', ?2, ?3)",
            params![
                message.identity.0,
                i64::from(message.native_id.0),
                message.text
            ],
        )?;
    }
    for label in &snapshot.option_labels {
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'option-label', ?2, ?3)",
            params![label.identity.0, i64::from(label.native_id.0), label.text],
        )?;
    }
    for label in &snapshot.quest_labels {
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'quest-flag', ?2, ?3)",
            params![label.identity().0, i64::from(label.id), label.label],
        )?;
    }
    Ok(())
}

fn index_maps(
    transaction: &rusqlite::Transaction<'_>,
    snapshot: &ProjectSnapshot,
) -> Result<(), StoreError> {
    for map in &snapshot.world.maps {
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'map', ?2, ?3)",
            params![map.identity.0, i64::from(map.native_index), map.name],
        )?;
    }
    for player_map in &snapshot.world.player_maps {
        let label = player_map_names(snapshot.player_map_names.as_ref(), player_map.native_id.0)
            .0
            .filter(|name| !name.is_empty())
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| format!("Player Map {}", player_map.native_id.0));
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'player-map', ?2, ?3)",
            params![
                player_map.identity.0,
                i64::from(player_map.native_id.0),
                label,
            ],
        )?;
    }
    for action_point in &snapshot.world.action_points {
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'action-point', ?2, ?3)",
            params![
                action_point.identity.0,
                i64::from(action_point.record_index),
                format!(
                    "Land {} Action Point {}",
                    action_point.level_index, action_point.record_index
                )
            ],
        )?;
    }
    Ok(())
}

fn index_encounter_text(
    transaction: &rusqlite::Transaction<'_>,
    snapshot: &ProjectSnapshot,
) -> Result<(), StoreError> {
    for row in &snapshot.extra_action_points {
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'extra-action-point', ?2, ?3)",
            params![
                row.identity.0,
                i64::from(row.native_id.0),
                format!("Extra Action Point {}", row.native_id.0),
            ],
        )?;
    }
    for encounter in &snapshot.simple_encounters {
        let label = encounter
            .texts
            .iter()
            .find(|text| !text.is_empty())
            .cloned()
            .unwrap_or_else(|| format!("Simple Encounter {}", encounter.native_id.0));
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'simple-encounter', ?2, ?3)",
            params![encounter.identity.0, i64::from(encounter.native_id.0), label],
        )?;
    }
    for encounter in &snapshot.complex_encounters {
        let label = encounter
            .texts
            .iter()
            .find(|text| !text.is_empty())
            .cloned()
            .unwrap_or_else(|| format!("Complex Encounter {}", encounter.native_id.0));
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'complex-encounter', ?2, ?3)",
            params![encounter.identity.0, i64::from(encounter.native_id.0), label],
        )?;
    }
    Ok(())
}

fn index_other_encounters(
    transaction: &rusqlite::Transaction<'_>,
    snapshot: &ProjectSnapshot,
) -> Result<(), StoreError> {
    for encounter in &snapshot.rogue_encounters {
        let enabled = encounter.type_flags[..8]
            .iter()
            .filter(|value| **value)
            .count();
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'rogue-encounter', ?2, ?3)",
            params![
                encounter.identity.0,
                i64::from(encounter.native_id.0),
                format!("Rogue Encounter {} - {} enabled actions", encounter.native_id.0, enabled),
            ],
        )?;
    }
    for encounter in &snapshot.timed_encounters {
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'timed-encounter', ?2, ?3)",
            params![encounter.identity.0, i64::from(encounter.native_id.0), format!("Timed Encounter {} - day {}", encounter.native_id.0, encounter.day)],
        )?;
    }
    Ok(())
}

fn index_combat(
    transaction: &rusqlite::Transaction<'_>,
    snapshot: &ProjectSnapshot,
) -> Result<(), StoreError> {
    for set in &snapshot.monster_sets {
        for monster in &set.monsters {
            transaction.execute(
                "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'monster', ?2, ?3)",
                params![
                    monster.identity.0,
                    i64::from(monster.native_id.0),
                    format!("{} [{}]", monster.display_name, set.native_path),
                ],
            )?;
        }
    }
    for description in &snapshot.monster_descriptions {
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'monster-description', ?2, ?3)",
            params![
                description.identity.0,
                i64::from(description.native_id.0),
                description.text,
            ],
        )?;
    }
    for battle in &snapshot.battles {
        let placed = battle.grid.iter().filter(|value| **value != 0).count();
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'battle', ?2, ?3)",
            params![
                battle.identity.0,
                i64::from(battle.native_id.0),
                format!("Battle {} - {} monster anchors", battle.native_id.0, placed),
            ],
        )?;
    }
    Ok(())
}

fn index_economy(
    transaction: &rusqlite::Transaction<'_>,
    snapshot: &ProjectSnapshot,
) -> Result<(), StoreError> {
    for treasure in &snapshot.treasures {
        let populated = treasure
            .item_ids
            .iter()
            .filter(|item_id| **item_id > 0)
            .count();
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'treasure', ?2, ?3)",
            params![
                treasure.identity.0,
                i64::from(treasure.native_id.0),
                format!(
                    "Treasure {} - {} item slots",
                    treasure.native_id.0, populated
                ),
            ],
        )?;
    }
    for shop in &snapshot.shops {
        let active = shop.item_ids.iter().filter(|item_id| **item_id > 0).count();
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'shop', ?2, ?3)",
            params![
                shop.identity.0,
                i64::from(shop.native_id.0),
                format!("Shop {} - {} active items", shop.native_id.0, active)
            ],
        )?;
    }
    Ok(())
}

fn index_rules(
    transaction: &rusqlite::Transaction<'_>,
    snapshot: &ProjectSnapshot,
) -> Result<(), StoreError> {
    for row in &snapshot.extra_codes {
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'extra-code', ?2, ?3)",
            params![
                format!("extra-code:{}", row.native_id.0),
                i64::from(row.native_id.0),
                format!("Extra Code {}", row.native_id.0),
            ],
        )?;
    }
    for rule in &snapshot.race_rules {
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'race-rule', ?2, ?3)",
            params![
                rule.definition.id.0,
                i64::from(rule.definition.classic_id),
                effective_race_name(
                    snapshot.rule_names.as_ref(),
                    rule.definition.classic_id,
                    &rule.definition.name,
                )
                .unwrap_or("Unnamed race"),
            ],
        )?;
    }
    for rule in &snapshot.caste_rules {
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'caste-rule', ?2, ?3)",
            params![
                rule.definition.id.0,
                i64::from(rule.definition.classic_id),
                effective_caste_name(
                    snapshot.rule_names.as_ref(),
                    rule.definition.classic_id,
                    &rule.definition.name,
                )
                .unwrap_or("Unnamed caste"),
            ],
        )?;
    }
    Ok(())
}

fn index_items_spells(
    transaction: &rusqlite::Transaction<'_>,
    snapshot: &ProjectSnapshot,
) -> Result<(), StoreError> {
    for rule in &snapshot.item_rules {
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'item-rule', ?2, ?3)",
            params![
                rule.definition.id.0,
                i64::from(rule.definition.classic_id),
                rule.definition.name,
            ],
        )?;
    }
    for rule in &snapshot.scenario_item_rules {
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'scenario-item-rule', ?2, ?3)",
            params![
                rule.definition.id.0,
                i64::from(rule.definition.classic_id),
                rule.definition.name,
            ],
        )?;
    }
    for spell in snapshot
        .standard_spells
        .iter()
        .chain(snapshot.scenario_spells.iter())
    {
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'scenario-spell', ?2, ?3)",
            params![
                spell.definition.id.0,
                i64::from(spell.definition.classic_id),
                format!("Classic spell {}", spell.definition.classic_id),
            ],
        )?;
    }
    Ok(())
}

fn index_media(
    transaction: &rusqlite::Transaction<'_>,
    snapshot: &ProjectSnapshot,
) -> Result<(), StoreError> {
    for profile in &snapshot.terrain_catalog {
        let landlook = profile
            .landlook
            .map_or_else(|| "shared".into(), |value| value.to_string());
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'terrain-profile', ?2, ?3)",
            params![
                format!("terrain:{landlook}:{}", profile.tile),
                i64::from(profile.tile),
                format!("Landlook {landlook} tile {} — {}", profile.tile, profile.source),
            ],
        )?;
    }
    for catalog in &snapshot.landlook_catalogs {
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'landlook-catalog', ?2, ?3)",
            params![
                format!("landlook:{}", catalog.landlook),
                i64::from(catalog.landlook),
                format!("Landlook {} — {}", catalog.landlook, catalog.source),
            ],
        )?;
    }
    for asset in &snapshot.assets {
        transaction.execute(
            "INSERT INTO entity(identity, kind, native_id, label) VALUES (?1, 'asset', ?2, ?3)",
            params![
                asset.identity.0,
                asset
                    .classic_resource
                    .as_ref()
                    .map(|resource| i64::from(resource.resource_id)),
                asset.label,
            ],
        )?;
    }
    Ok(())
}

fn index_references(
    transaction: &rusqlite::Transaction<'_>,
    snapshot: &ProjectSnapshot,
) -> Result<(), StoreError> {
    for reference in references_for(snapshot) {
        let target_kind = serde_json::to_value(&reference.target_kind)?;
        let resolution = serde_json::to_value(&reference.resolution)?;
        let provenance = reference.byte_provenance.as_ref();
        transaction.execute(
            "INSERT INTO derived_reference(source, field, target_kind, target_id, resolution, native_path, byte_start, byte_end) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                reference.source.0,
                reference.field.0,
                target_kind.as_str().unwrap_or("unknown"),
                reference.target_id,
                resolution.as_str().unwrap_or("unknown"),
                provenance.map(|value| value.native_path.as_str()),
                provenance.map(|value| i64::from(value.byte_start)),
                provenance.map(|value| i64::from(value.byte_end)),
            ],
        )?;
    }
    Ok(())
}
