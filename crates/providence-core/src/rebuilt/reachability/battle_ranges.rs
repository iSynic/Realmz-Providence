use super::{
    ReachabilityBuilder, RebuiltV3ReachabilityRelation, RebuiltV3ReachabilityTarget, StableId,
};
impl ReachabilityBuilder<'_> {
    pub(super) fn add_battle_range(&mut self, source: &StableId, field: &str, values: [i16; 5]) {
        let low = i32::from(values[0]).unsigned_abs();
        let high = i32::from(values[1]).unsigned_abs();
        let end = if values[1] == 0 || high < low {
            low
        } else {
            high
        };
        for id in low..=end {
            self.reference(
                source.clone(),
                format!("{field}.battleRange"),
                RebuiltV3ReachabilityRelation::StartsBattle,
                RebuiltV3ReachabilityTarget::Battle(id),
            );
        }
    }
}

pub(super) fn classic_battle_values([low, high]: [i16; 2]) -> Vec<u32> {
    let width = high.wrapping_sub(low).wrapping_add(1);
    let low = i32::from(low);
    let [start, end] = match width.cmp(&0) {
        std::cmp::Ordering::Greater => [low, low + i32::from(width) - 1],
        std::cmp::Ordering::Equal => [low, low],
        std::cmp::Ordering::Less => [low + i32::from(width) + 1, low],
    };
    (start..=end).map(i32::unsigned_abs).collect()
}
