use super::{ClassicSliceCompileError, NativeManifest};
use crate::{
    codecs::{
        CLASSIC_SCENARIO_BASELINE_FILES, NativeFileFamily, encode_dungeon_random_levels,
        encode_land_random_levels,
    },
    model::{ProjectOrigin, ProjectSnapshot},
};

pub(super) fn complete(
    snapshot: &ProjectSnapshot,
    manifest: &mut NativeManifest,
) -> Result<(), ClassicSliceCompileError> {
    if !matches!(snapshot.origin, ProjectOrigin::Authored)
        || snapshot.startup_authoring.is_none()
        || snapshot.campaign.is_none()
        || snapshot.start_location.is_none()
    {
        return Ok(());
    }
    for &(path, family, bytes) in CLASSIC_SCENARIO_BASELINE_FILES {
        if manifest.get(path).is_none() {
            let bytes = match family {
                NativeFileFamily::LandRandomLevels => {
                    encode_land_random_levels(&snapshot.world.maps, None)?
                }
                NativeFileFamily::DungeonRandomLevels => {
                    encode_dungeon_random_levels(&snapshot.world.maps, None)?
                }
                _ => vec![0; bytes],
            };
            manifest.insert_generated(path, family, bytes);
        }
    }
    Ok(())
}
