mod bootstrap;
mod catalogs;
mod contact;
mod versions;
mod world;

use super::{SnapshotError, authoring_metadata, authoring_migration};
use crate::model::{PlayerMapNameCatalog, ProjectSnapshot, SNAPSHOT_FORMAT_VERSION};

pub(super) fn apply(
    snapshot: &mut ProjectSnapshot,
    source_version: u32,
    player_map_names: Option<PlayerMapNameCatalog>,
) -> Result<(), SnapshotError> {
    authoring_metadata::migrate(snapshot, source_version);
    versions::validate(source_version)?;
    snapshot.format_version = SNAPSHOT_FORMAT_VERSION;
    bootstrap::migrate(snapshot, source_version);
    catalogs::migrate_script_and_spell_catalogs(snapshot, source_version);
    world::migrate(snapshot, source_version, player_map_names);
    contact::migrate_contact_provenance(snapshot, source_version);
    catalogs::migrate_encounter_catalogs(snapshot, source_version);
    catalogs::clear_later_snapshot_catalogs(snapshot, source_version);
    authoring_migration::migrate_startup_authoring(snapshot, source_version);
    snapshot.normalize();
    authoring_metadata::validate(snapshot)
}
