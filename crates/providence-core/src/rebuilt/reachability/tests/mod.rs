use super::*;
use crate::model::{
    ActionPoint, BattleRecord, BlobId, ClassicAction, ComplexEncounter, ExtraActionPoint,
    ExtraCodeRow, ItemRuleDefinition, LevelType, MapCoordinate, MapLevel, MapRuntimeMetadata,
    MonsterRecord, MonsterSet, NativeRecordId, RandomRectangle, ScenarioApplicationContract,
    ScenarioMessage, SimpleEncounter, SourcedScenarioItemRule, TimedEncounter,
    TimedEncounterLocationKind,
};
mod branches;
mod catalog;
mod combat;
mod fixtures;
mod payment;
mod roots;
use fixtures::*;
