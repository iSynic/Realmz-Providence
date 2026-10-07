use super::RebuiltV3BattleError;
use crate::model::ProjectSnapshot;
use std::collections::BTreeSet;

pub(super) struct BattleInputs {
    pub normal_monster_ids: BTreeSet<u32>,
    pub message_ids: BTreeSet<u32>,
    pub macro_ids: BTreeSet<u32>,
    pub allow_deferred: bool,
}

impl BattleInputs {
    pub(super) fn new(
        snapshot: &ProjectSnapshot,
        allow_deferred: bool,
    ) -> Result<Self, RebuiltV3BattleError> {
        let normal_monster_ids = normal_monster_ids(snapshot)?;
        let message_ids = snapshot
            .messages
            .iter()
            .map(|message| message.native_id.0)
            .collect::<BTreeSet<_>>();
        let macro_ids = snapshot
            .extra_action_points
            .iter()
            .map(|row| row.native_id.0)
            .collect::<BTreeSet<_>>();

        Ok(Self {
            normal_monster_ids,
            message_ids,
            macro_ids,
            allow_deferred,
        })
    }
}

pub(super) fn validate_selected_ids(
    snapshot: &ProjectSnapshot,
    selected_classic_ids: Option<&BTreeSet<u32>>,
) -> Result<(), RebuiltV3BattleError> {
    if let Some(selected_classic_ids) = selected_classic_ids {
        let available_classic_ids = snapshot
            .battles
            .iter()
            .map(|battle| battle.native_id.0)
            .collect::<BTreeSet<_>>();
        if let Some(missing) = selected_classic_ids
            .difference(&available_classic_ids)
            .next()
        {
            return Err(RebuiltV3BattleError::MissingSelectedClassicId(*missing));
        }
    }
    Ok(())
}

fn normal_monster_ids(snapshot: &ProjectSnapshot) -> Result<BTreeSet<u32>, RebuiltV3BattleError> {
    let normal_sets = snapshot
        .monster_sets
        .iter()
        .filter(|set| set.set_id == 0 && set.native_path == "Data MD")
        .collect::<Vec<_>>();
    if normal_sets.len() > 1 {
        return Err(RebuiltV3BattleError::AmbiguousNormalMonsterSet);
    }
    let mut normal_monster_ids = BTreeSet::new();
    if let Some(normal) = normal_sets.first() {
        for monster in &normal.monsters {
            if !normal_monster_ids.insert(monster.native_id.0) {
                return Err(RebuiltV3BattleError::DuplicateNormalMonsterId(
                    monster.native_id.0,
                ));
            }
        }
    }
    Ok(normal_monster_ids)
}
