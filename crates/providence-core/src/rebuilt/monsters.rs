mod contracts;
mod definition;
mod descriptions;
mod package;
mod records;
mod selection;
mod sets;

pub use contracts::{
    RebuiltV3MonsterAttack, RebuiltV3MonsterCatalog, RebuiltV3MonsterDefinition,
    RebuiltV3MonsterDescription, RebuiltV3MonsterError, RebuiltV3MonsterOmission,
    RebuiltV3MonsterSetDefinition, RebuiltV3NormalMonsterSelection,
};
pub use package::project_rebuilt_monster_catalog;
pub(crate) use package::project_rebuilt_v3_package_monster_catalog;
pub use package::{
    project_rebuilt_v3_monster_catalog, project_rebuilt_v4_imported_monster_catalog,
};
pub(crate) use selection::project_current_monsters_by_classic_ids;
pub use selection::{
    project_rebuilt_v3_monsters_by_classic_ids, project_rebuilt_v3_normal_monsters_by_classic_ids,
};

#[cfg(test)]
mod tests;
