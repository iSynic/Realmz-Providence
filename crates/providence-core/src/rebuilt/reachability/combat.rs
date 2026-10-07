use super::{
    ReachabilityBuilder, RebuiltV3ReachabilityRelation, RebuiltV3ReachabilityTarget, StableId,
    xap_program,
};
impl ReachabilityBuilder<'_> {
    pub(super) fn visit_battle(&mut self, id: u32) {
        let Some(battle) = self.catalog.battles.get(&id).copied() else {
            return;
        };
        for (slot, raw_monster) in battle.grid.iter().copied().enumerate() {
            if raw_monster != 0 {
                self.reference(
                    battle.identity.clone(),
                    format!("grid[{slot}].monster"),
                    RebuiltV3ReachabilityRelation::PlacesMonster,
                    RebuiltV3ReachabilityTarget::Monster(i32::from(raw_monster).unsigned_abs()),
                );
            }
        }
        if battle.battle_macro < 0 {
            self.reference(
                battle.identity.clone(),
                "battleMacro",
                RebuiltV3ReachabilityRelation::BattleRoundMacro,
                RebuiltV3ReachabilityTarget::Program(xap_program(i64::from(
                    i32::from(battle.battle_macro).unsigned_abs(),
                ))),
            );
        }
    }

    pub(super) fn visit_monster(&mut self, id: u32) {
        let Some(monster) = self.catalog.monsters.get(&id).copied() else {
            return;
        };
        if monster.death_macro != 0 {
            self.reference(
                monster.identity.clone(),
                "deathMacro",
                RebuiltV3ReachabilityRelation::MonsterDeathMacro,
                RebuiltV3ReachabilityTarget::Program(xap_program(i64::from(
                    i32::from(monster.death_macro).unsigned_abs(),
                ))),
            );
        }
    }

    pub(super) fn add_monster(&mut self, source: &StableId, field: impl Into<String>, id: i16) {
        self.record_nonnegative_target(
            source,
            &field.into(),
            id,
            RebuiltV3ReachabilityRelation::SpawnsMonster,
            RebuiltV3ReachabilityTarget::Monster,
        );
    }
}
