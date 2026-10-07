use super::ActionStorage;
use super::actions::ActionSeed;

pub(super) fn storage(seed: &ActionSeed) -> ActionStorage {
    if seed.form.is_some() {
        return ActionStorage::ExtraCodeRow;
    }
    match seed.opcode {
        0 => ActionStorage::Empty,
        8 => ActionStorage::SameMapActionPoint,
        39 => ActionStorage::ExtraActionPoint,
        25 | 26 | 34 | 82 | 83 | 84 | 91 | 93 | 94 | 96 | 98 | 99 | 100 | 101 | 102 => {
            ActionStorage::StepOnly
        }
        _ => ActionStorage::DirectCodeId,
    }
}
