mod application;
mod classic;
mod documents;
mod fixtures;
mod media;
mod media_fixtures;
mod world;

use super::rebuilt::actionable_reachability_blocker;
use super::reference_readiness::reference_blockers;
use super::startup::start_location_blockers;
use super::world::{map_runtime_blockers, terrain_catalog_blockers, topology_blockers};
use super::{
    CompatibilityStatus, CompileTarget, ProjectSnapshot, StableId, classify_classic_slice,
    classify_classic_slice_with_application, classify_rebuilt_v3,
    classify_rebuilt_v3_with_application, imported_start_location_requires_deferred_capability,
    reference_is_resolved_by_application,
};
use crate::codecs::CLASSIC_SCENARIO_RESOURCE_SOURCE;
use crate::model::{CLASSIC_MAP_SIZE, LevelType};
use crate::rebuilt::ApplicationMediaCatalog;
use crate::references::{ReferenceDescriptor, ResolutionState, TargetKind};

use crate::model::{
    ActionPoint, AssetDescriptor, BlobId, CampaignContact, CampaignMetadata, CampaignRestrictions,
    ClassicAction, ClassicResourceKey, ExtraActionPoint, MapCoordinate, MapLevel,
    MapRuntimeMetadata, MessageReference, MonsterSet, NativeRecordId, ProjectOrigin,
    RaceRuleDefinition, RandomRectangle, ScenarioApplicationContract, ScenarioApplicationHooks,
    ScenarioMessage, SimpleEncounter, SourcedRaceRule, StartLocation, TerrainProfile,
};

use fixtures::{application_appearance_catalog, slice_snapshot, special_land_snapshot};
use media_fixtures::{
    application_special_land_asset, decoded_special_land_tile, imported_icon, imported_picture,
    imported_sound, scenario_icon, special_land_tile,
};
