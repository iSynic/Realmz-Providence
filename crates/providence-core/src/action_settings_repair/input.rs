use super::{FieldError, RandomAreaInput, RandomMessageInput, random_area, random_message};
use crate::model::{ClassicAction, ProjectSnapshot};

mod sealed {
    pub trait Sealed {}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SettingsValues {
    pub primary: [i16; 5],
    pub companion: Option<[i16; 5]>,
}

pub trait RepairInput: sealed::Sealed + Clone + PartialEq {
    const OPCODE: i16;

    fn initial(snapshot: &ProjectSnapshot, action: &ClassicAction) -> Self;
    fn change(
        &mut self,
        snapshot: &ProjectSnapshot,
        field: &str,
        value: &str,
    ) -> Result<(), String>;
    fn values(&self, snapshot: &ProjectSnapshot) -> Result<SettingsValues, Vec<FieldError>>;
    fn retain_current(&mut self, current: &Self);
    fn retained_matches(&self, current: &Self) -> bool;
    fn changes_mode(&self, _field: &str, _value: &str) -> bool {
        false
    }
}

impl sealed::Sealed for RandomAreaInput {}

impl RepairInput for RandomAreaInput {
    const OPCODE: i16 = 92;

    fn initial(snapshot: &ProjectSnapshot, action: &ClassicAction) -> Self {
        random_area::initial(snapshot, action)
    }

    fn change(
        &mut self,
        snapshot: &ProjectSnapshot,
        field: &str,
        value: &str,
    ) -> Result<(), String> {
        random_area::change(snapshot, self, field, value)
    }

    fn values(&self, snapshot: &ProjectSnapshot) -> Result<SettingsValues, Vec<FieldError>> {
        random_area::validate(snapshot, self).map(|(primary, companion)| SettingsValues {
            primary,
            companion: Some(companion),
        })
    }

    fn retain_current(&mut self, current: &Self) {
        self.retained_spare = current.retained_spare;
    }

    fn retained_matches(&self, current: &Self) -> bool {
        self.retained_spare == current.retained_spare
    }

    fn changes_mode(&self, field: &str, value: &str) -> bool {
        field == "shapeMode" && self.shape_mode != value
    }
}

impl sealed::Sealed for RandomMessageInput {}

impl RepairInput for RandomMessageInput {
    const OPCODE: i16 = 19;

    fn initial(snapshot: &ProjectSnapshot, action: &ClassicAction) -> Self {
        random_message::initial(snapshot, action)
    }

    fn change(
        &mut self,
        _snapshot: &ProjectSnapshot,
        field: &str,
        value: &str,
    ) -> Result<(), String> {
        random_message::change(self, field, value)
    }

    fn values(&self, snapshot: &ProjectSnapshot) -> Result<SettingsValues, Vec<FieldError>> {
        random_message::validate(snapshot, self)
    }

    fn retain_current(&mut self, current: &Self) {
        self.retained = current.retained;
    }

    fn retained_matches(&self, current: &Self) -> bool {
        self.retained == current.retained
    }
}
