use super::{
    EncounterContext, ReachabilityBuilder, RebuiltV3ReachabilityRelation,
    RebuiltV3ReachabilityTarget, StableId,
};
use std::collections::{BTreeSet, VecDeque};

type Write = (StableId, String, [i16; 5], EncounterContext);

#[derive(Default)]
pub(super) struct RandomRegionClosure {
    ranges: BTreeSet<[i16; 2]>,
    writes: BTreeSet<Write>,
    #[cfg(test)]
    pairs: usize,
}

fn rewritten_range(values: [i16; 5], prior: [i16; 2]) -> [i16; 2] {
    [
        if values[3] < 0 { prior[0] } else { values[3] },
        if values[4] < 0 { prior[1] } else { values[4] },
    ]
}

impl RandomRegionClosure {
    fn advance(&mut self, native: [i16; 2], write: Write, mut emit: impl FnMut(&Write, [i16; 2])) {
        let new_range = self.ranges.insert(native);
        let new_write = self.writes.insert(write.clone());
        // Each previous call left a complete closure. Only new pairs can add effects.
        let mut pending = VecDeque::new();
        if new_range {
            pending.extend(self.writes.iter().map(|write| (write.clone(), native)));
        }
        if new_write {
            pending.extend(
                self.ranges
                    .iter()
                    .filter(|range| !new_range || **range != native)
                    .map(|range| (write.clone(), *range)),
            );
        }
        while let Some((write, prior)) = pending.pop_front() {
            #[cfg(test)]
            {
                self.pairs += 1;
            }
            let range = rewritten_range(write.2, prior);
            emit(&write, range);
            if self.ranges.insert(range) {
                pending.extend(self.writes.iter().map(|write| (write.clone(), range)));
            }
        }
    }

    #[cfg(test)]
    fn advance_naive(
        &mut self,
        native: [i16; 2],
        write: Write,
        mut emit: impl FnMut(&Write, [i16; 2]),
    ) {
        self.ranges.insert(native);
        self.writes.insert(write);
        loop {
            let mut changed = false;
            for write in self.writes.clone() {
                for prior in self.ranges.clone() {
                    self.pairs += 1;
                    let range = rewritten_range(write.2, prior);
                    changed |= self.ranges.insert(range);
                    emit(&write, range);
                }
            }
            if !changed {
                break;
            }
        }
    }
}

impl ReachabilityBuilder<'_> {
    pub(super) fn visit_random_region_battles(
        &mut self,
        program: &StableId,
        field: &str,
        opcode: i16,
        values: [i16; 5],
    ) {
        let level_type = if opcode == -23 {
            crate::model::LevelType::Dungeon
        } else {
            crate::model::LevelType::Land
        };
        let map = self.snapshot.world.maps.iter().find(|map| {
            map.level_type == level_type && i32::from(values[0]) == map.native_index as i32
        });
        let Some(map) = map.filter(|map| map.runtime.is_some() && (0..20).contains(&values[1]))
        else {
            self.reference(
                program.clone(),
                field,
                RebuiltV3ReachabilityRelation::CallsProgram,
                RebuiltV3ReachabilityTarget::Invalid(format!(
                    "random region {opcode} map {} rectangle {}",
                    values[0], values[1]
                )),
            );
            return;
        };
        let key = format!("{}:rect:{}", map.identity.0, values[1]);
        // The decoder omits physically present all-zero reserved slots.
        let native = map
            .runtime
            .as_ref()
            .unwrap()
            .random_rectangles
            .iter()
            .find(|region| region.identity.0 == key)
            .map_or([0, 0], |region| region.battle_range);
        let write = (program.clone(), field.into(), values, self.current_context);
        let mut closure = self.random_regions.remove(&key).unwrap_or_default();
        let original = self.current_context;
        // Random battles occur later, after other encounters may change globals.
        self.current_context = EncounterContext::default();
        #[cfg(test)]
        if self.naive_random_regions {
            closure.advance_naive(native, write, |write, range| {
                self.emit_random_battles(write, range)
            });
        } else {
            closure.advance(native, write, |write, range| {
                self.emit_random_battles(write, range)
            });
        }
        #[cfg(not(test))]
        closure.advance(native, write, |write, range| {
            self.emit_random_battles(write, range)
        });
        self.current_context = original;
        self.random_regions.insert(key, closure);
    }

    fn emit_random_battles(&mut self, write: &Write, range: [i16; 2]) {
        if range[0] != 0 {
            for id in super::battle_ranges::classic_battle_values(range) {
                self.reference(
                    write.0.clone(),
                    format!("{}.randomBattleRange", write.1),
                    RebuiltV3ReachabilityRelation::StartsBattle,
                    RebuiltV3ReachabilityTarget::Battle(id),
                );
            }
        }
    }
}

#[cfg(test)]
#[path = "tests/random_regions.rs"]
mod tests;
