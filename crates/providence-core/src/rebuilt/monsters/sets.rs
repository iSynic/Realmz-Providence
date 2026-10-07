use super::{
    RebuiltV3MonsterCatalog, RebuiltV3MonsterDefinition, RebuiltV3MonsterDescription,
    RebuiltV3MonsterError, RebuiltV3MonsterSetDefinition,
};

pub(super) fn validate_monster_set(
    set: &crate::model::MonsterSet,
) -> Result<(), RebuiltV3MonsterError> {
    let expected_path = match set.set_id {
        -1 => "Data MD-1",
        0 => "Data MD",
        1 => "Data MD1",
        _ => "",
    };
    if set.native_path != expected_path {
        return Err(RebuiltV3MonsterError::InvalidSet {
            set_id: set.set_id,
            native_path: set.native_path.clone(),
        });
    }
    Ok(())
}

fn monster_set_name(set_id: i16) -> &'static str {
    if set_id == 1 {
        "Monster Monsters"
    } else {
        "Mega Monsters"
    }
}

#[derive(Default)]
pub(super) struct ProjectedSets {
    pub monsters: Vec<RebuiltV3MonsterDefinition>,
    pub monster_sets: Vec<RebuiltV3MonsterSetDefinition>,
}

impl ProjectedSets {
    pub(super) fn insert(&mut self, set_id: i16, monsters: Vec<RebuiltV3MonsterDefinition>) {
        if set_id == 0 {
            self.monsters = monsters;
        } else {
            self.monster_sets.push(RebuiltV3MonsterSetDefinition {
                set_id,
                name: monster_set_name(set_id).into(),
                monsters,
            });
        }
    }

    pub(super) fn finish(
        self,
        monster_descriptions: Vec<RebuiltV3MonsterDescription>,
    ) -> RebuiltV3MonsterCatalog {
        RebuiltV3MonsterCatalog {
            monsters: self.monsters,
            monster_sets: self.monster_sets,
            monster_descriptions,
        }
    }
}
