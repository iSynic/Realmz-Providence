use super::super::{
    placed_trigger_is_defined,
    runtime_ids::{action_point_program_id, application_program_id},
};
use super::battle_ranges::classic_battle_values;
use super::{
    ReachabilityBuilder, RebuiltV3ReachabilityRelation, RebuiltV3ReachabilityTarget, xap_program,
};
impl ReachabilityBuilder<'_> {
    pub(super) fn add_roots(&mut self) {
        self.add_placed_roots();
        self.add_application_roots();
        self.add_timed_roots();
        self.add_random_roots();
        self.add_item_roots();
    }

    fn add_placed_roots(&mut self) {
        for trigger in self
            .snapshot
            .world
            .action_points
            .iter()
            .filter(|trigger| placed_trigger_is_defined(trigger))
        {
            self.reference(
                trigger.identity.clone(),
                "placement",
                RebuiltV3ReachabilityRelation::Root,
                RebuiltV3ReachabilityTarget::Program(action_point_program_id(trigger)),
            );
        }
    }

    fn add_application_roots(&mut self) {
        if let Some(application) = &self.snapshot.scenario_application {
            for (field, target) in [
                ("hooks.startGame", &application.hooks.start_game),
                ("hooks.partyDeath", &application.hooks.party_death),
                ("hooks.endAdventure", &application.hooks.end_adventure),
                ("hooks.shop", &application.hooks.shop),
                ("hooks.temple", &application.hooks.temple),
            ] {
                if let Some(target) = target {
                    self.reference(
                        self.snapshot.project_id.clone(),
                        field,
                        RebuiltV3ReachabilityRelation::Root,
                        RebuiltV3ReachabilityTarget::Program(application_program_id(
                            self.snapshot,
                            target,
                        )),
                    );
                }
            }
        }
    }

    fn add_timed_roots(&mut self) {
        let runtime_timed_ids =
            super::super::encounters::runtime_timed_encounter_ids(self.snapshot);
        for encounter in self
            .snapshot
            .timed_encounters
            .iter()
            .filter(|encounter| runtime_timed_ids.contains(&encounter.native_id.0))
        {
            self.reference(
                encounter.identity.clone(),
                "door",
                RebuiltV3ReachabilityRelation::Root,
                RebuiltV3ReachabilityTarget::Program(xap_program(i64::from(encounter.door))),
            );
        }
    }

    fn add_random_roots(&mut self) {
        for map in &self.snapshot.world.maps {
            let Some(runtime) = &map.runtime else {
                continue;
            };
            for rectangle in &runtime.random_rectangles {
                for (slot, (door, percent)) in rectangle
                    .random_doors
                    .iter()
                    .zip(rectangle.random_door_percent)
                    .enumerate()
                {
                    if percent != 0 {
                        self.reference(
                            rectangle.identity.clone(),
                            format!("randomDoors[{slot}]"),
                            RebuiltV3ReachabilityRelation::Root,
                            RebuiltV3ReachabilityTarget::Program(xap_program(i64::from(*door))),
                        );
                    }
                }
                if rectangle.battle_range[0] != 0 {
                    for battle_id in classic_battle_values(rectangle.battle_range) {
                        self.reference(
                            rectangle.identity.clone(),
                            "battleRange",
                            RebuiltV3ReachabilityRelation::Root,
                            RebuiltV3ReachabilityTarget::Battle(battle_id),
                        );
                    }
                }
            }
        }
    }

    fn add_item_roots(&mut self) {
        let door_items = self
            .snapshot
            .item_rules
            .iter()
            .map(|item| &item.definition)
            .chain(
                self.snapshot
                    .scenario_item_rules
                    .iter()
                    .map(|item| &item.definition),
            )
            .filter(|item| {
                (item.item_type.unsigned_abs() == 23 || item.special[0] == -23)
                    && item.special[4] >= 0
            })
            .map(|item| (item.id.clone(), item.special[4]))
            .collect::<Vec<_>>();
        for (item, target) in door_items {
            self.reference(
                item,
                "special[4]",
                RebuiltV3ReachabilityRelation::Root,
                RebuiltV3ReachabilityTarget::Program(xap_program(i64::from(target))),
            );
        }
    }
}
