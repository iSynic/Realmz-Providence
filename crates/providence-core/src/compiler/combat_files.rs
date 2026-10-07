use super::{ClassicCompatibilitySources, ClassicSliceCompileError, NativeManifest};
use crate::codecs::{
    NativeFileFamily, encode_battles, encode_monster_descriptions, encode_monster_set,
};
use crate::model::ProjectSnapshot;

pub(super) fn compile(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    manifest: &mut NativeManifest,
) -> Result<(), ClassicSliceCompileError> {
    for set in &snapshot.monster_sets {
        let (family, source) = match set.native_path.as_str() {
            "Data MD" => (NativeFileFamily::ScenarioMonsters, sources.data_md),
            "Data MD1" => (NativeFileFamily::MonsterVariantRecords, sources.data_md1),
            "Data MD-1" => (
                NativeFileFamily::MegaMonsterVariantRecords,
                sources.data_md_minus_1,
            ),
            _ => continue,
        };
        if !set.monsters.is_empty() {
            manifest.insert_generated(
                set.native_path.clone(),
                family,
                encode_monster_set(set, source)?,
            );
        }
    }
    if !snapshot.monster_descriptions.is_empty() {
        manifest.insert_generated(
            "Data DES",
            NativeFileFamily::MonsterDescriptions,
            encode_monster_descriptions(&snapshot.monster_descriptions, sources.data_des)?,
        );
    }
    if !snapshot.battles.is_empty() {
        manifest.insert_generated(
            "Data BD",
            NativeFileFamily::BattleRecords,
            encode_battles(&snapshot.battles, sources.data_bd)?,
        );
    }
    Ok(())
}
