use super::SessionError;
use crate::codecs::LAND_LAYOUT_CELLS;

impl SessionError {
    pub(super) fn fmt_session(
        &self,
        formatter: &mut std::fmt::Formatter<'_>,
    ) -> Option<std::fmt::Result> {
        Some(match self {
            Self::RevisionConflict { expected, actual } => write!(
                formatter,
                "revision conflict: expected {}, current revision is {}",
                expected.0, actual.0
            ),
            Self::InvalidScenarioDraft(reason) => {
                write!(formatter, "scenario draft is invalid: {reason}")
            }
            Self::InvalidScenarioContact(reason) => {
                write!(
                    formatter,
                    "scenario contact information is invalid: {reason}"
                )
            }
            Self::InvalidClassicImport(message) => {
                write!(formatter, "invalid Classic import: {message}")
            }
            Self::InvalidGlobalMacroTarget(target) => write!(
                formatter,
                "global macro target '{}' must be an extra-action-point:<nonzero-signed-short> identity",
                target.0
            ),
            Self::NothingToUndo => write!(formatter, "nothing to undo"),
            Self::NothingToRedo => write!(formatter, "nothing to redo"),
            _ => return None,
        })
    }

    pub(super) fn fmt_text(
        &self,
        formatter: &mut std::fmt::Formatter<'_>,
    ) -> Option<std::fmt::Result> {
        Some(match self {
            Self::InvalidMessageDraft(reason) => {
                write!(formatter, "string draft is invalid: {reason}")
            }
            Self::MessageNotFound(identity) => {
                write!(formatter, "message {} was not found", identity.0)
            }
            Self::DuplicateMessageId(native_id) => {
                write!(formatter, "message id {} already exists", native_id.0)
            }
            Self::OptionLabelNotFound(identity) => {
                write!(formatter, "option label {} was not found", identity.0)
            }
            Self::InvalidOptionLabel { identity, reason } => {
                write!(
                    formatter,
                    "option label {} is invalid: {reason}",
                    identity.0
                )
            }
            Self::InvalidQuestLabel { id, reason } => {
                write!(formatter, "quest label {id} is invalid: {reason}")
            }
            Self::QuestLabelNotFound(id) => {
                write!(formatter, "quest label {id} was not found")
            }
            Self::ReferenceNotFound { source, field } => {
                write!(formatter, "reference {}.{field} was not found", source.0)
            }
            _ => return None,
        })
    }

    pub(super) fn fmt_actions(
        &self,
        formatter: &mut std::fmt::Formatter<'_>,
    ) -> Option<std::fmt::Result> {
        Some(match self {
            Self::ActionReferenceNotFound { source, slot } => {
                write!(
                    formatter,
                    "action reference {} slot {slot} was not found",
                    source.0
                )
            }
            Self::InvalidActionSettings {
                source,
                slot,
                reason,
            } => {
                write!(
                    formatter,
                    "action settings for {} slot {slot} are invalid: {reason}",
                    source.0
                )
            }
            Self::ExtraActionPointNotFound(identity) => {
                write!(formatter, "Extra Action Point {} was not found", identity.0)
            }
            Self::InvalidExtraActionPoint { identity, reason } => write!(
                formatter,
                "Extra Action Point {} is invalid: {reason}",
                identity.0
            ),
            Self::ActionPointNotFound(identity) => {
                write!(formatter, "Action Point {} was not found", identity.0)
            }
            Self::InvalidActionPoint { identity, reason } => {
                write!(
                    formatter,
                    "Action Point {} is invalid: {reason}",
                    identity.0
                )
            }
            _ => return None,
        })
    }

    pub(super) fn fmt_complex_encounters(
        &self,
        formatter: &mut std::fmt::Formatter<'_>,
    ) -> Option<std::fmt::Result> {
        Some(match self {
            Self::SimpleEncounterNotFound(identity) => {
                write!(formatter, "simple encounter {} was not found", identity.0)
            }
            Self::InvalidSimpleEncounter { identity, reason } => {
                write!(
                    formatter,
                    "simple encounter {} is invalid: {reason}",
                    identity.0
                )
            }
            Self::ComplexEncounterNotFound(identity) => {
                write!(formatter, "complex encounter {} was not found", identity.0)
            }
            Self::InvalidComplexEncounter { identity, reason } => write!(
                formatter,
                "complex encounter {} is invalid: {reason}",
                identity.0
            ),
            Self::InvalidComplexEncounterReference { source, field } => write!(
                formatter,
                "complex encounter reference {}.{field} was not found",
                source.0
            ),
            _ => return None,
        })
    }

    pub(super) fn fmt_other_encounters(
        &self,
        formatter: &mut std::fmt::Formatter<'_>,
    ) -> Option<std::fmt::Result> {
        Some(match self {
            Self::RogueEncounterNotFound(identity) => {
                write!(formatter, "Rogue encounter {} was not found", identity.0)
            }
            Self::InvalidRogueEncounter { identity, reason } => write!(
                formatter,
                "Rogue encounter {} is invalid: {reason}",
                identity.0
            ),
            Self::InvalidRogueEncounterReference { source, field } => write!(
                formatter,
                "Rogue encounter reference {}.{field} was not found",
                source.0
            ),
            Self::TimedEncounterNotFound(identity) => {
                write!(formatter, "Timed Encounter {} was not found", identity.0)
            }
            Self::InvalidTimedEncounter { identity, reason } => write!(
                formatter,
                "Timed Encounter {} is invalid: {reason}",
                identity.0
            ),
            Self::InvalidTimedEncounterReference { source, field } => write!(
                formatter,
                "Timed Encounter reference {}.{field} was not found",
                source.0
            ),
            _ => return None,
        })
    }

    pub(super) fn fmt_maps(
        &self,
        formatter: &mut std::fmt::Formatter<'_>,
    ) -> Option<std::fmt::Result> {
        Some(match self {
            Self::MapNotFound(identity) => write!(formatter, "map {} was not found", identity.0),
            Self::InvalidMapKind { identity, expected } => {
                write!(formatter, "map {} is not a {:?} map", identity.0, expected)
            }
            Self::InvalidMapCatalog { level_type, reason } => {
                write!(formatter, "{level_type:?} map catalog is invalid: {reason}")
            }
            Self::InvalidMapPaint { identity, reason } => {
                write!(formatter, "map {} paint is invalid: {reason}", identity.0)
            }
            Self::InvalidDungeonPrimitive {
                identity,
                primitive,
                reason,
            } => write!(
                formatter,
                "dungeon map {} cannot edit {primitive:?}: {reason}",
                identity.0
            ),
            Self::MapRuntimeNotFound(identity) => {
                write!(formatter, "map {} has no runtime metadata", identity.0)
            }
            _ => return None,
        })
    }

    pub(super) fn fmt_world(
        &self,
        formatter: &mut std::fmt::Formatter<'_>,
    ) -> Option<std::fmt::Result> {
        Some(match self {
            Self::RandomRectangleNotFound(identity) => {
                write!(formatter, "random rectangle {} was not found", identity.0)
            }
            Self::InvalidRandomRectangle { identity, reason } => write!(
                formatter,
                "random rectangle {} is invalid: {reason}",
                identity.0
            ),
            Self::MapCoordinateOutOfRange { x, y } => {
                write!(formatter, "map coordinate ({x},{y}) is outside 90 by 90")
            }
            Self::LandLayoutCoordinateOutOfRange { row, column } => write!(
                formatter,
                "land Layout coordinate ({row},{column}) is outside 8 by 16"
            ),
            Self::InvalidLandLayoutCellCount(actual) => write!(
                formatter,
                "land Layout must contain exactly {LAND_LAYOUT_CELLS} cells; found {actual}"
            ),
            Self::InvalidLandLayoutTarget(identity) => write!(
                formatter,
                "land Layout target '{}' is not a Classic-addressable land map",
                identity.0
            ),
            Self::PlayerMapNotFound(identity) => {
                write!(formatter, "player map {} was not found", identity.0)
            }
            Self::InvalidPlayerMap { identity, reason } => {
                write!(formatter, "player map {} is invalid: {reason}", identity.0)
            }
            _ => return None,
        })
    }

    pub(super) fn fmt_assets(
        &self,
        formatter: &mut std::fmt::Formatter<'_>,
    ) -> Option<std::fmt::Result> {
        Some(match self {
            Self::DuplicateAssetResource {
                resource_type,
                resource_id,
            } => write!(
                formatter,
                "Classic resource {resource_type:?} {resource_id} is already owned by another asset"
            ),
            Self::AssetNotFound(identity) => {
                write!(formatter, "asset {} was not found", identity.0)
            }
            Self::AssetInUse(_) => {
                write!(
                    formatter,
                    "This artwork is in use. Choose replacement artwork for its uses before removing it."
                )
            }
            Self::InvalidItemArtwork(reason) => {
                write!(formatter, "cannot apply item artwork: {reason}")
            }
            Self::InvalidMediaPair(reason) => write!(formatter, "media pair is invalid: {reason}"),
            Self::InvalidMonsterAppearance(reason) => {
                write!(formatter, "monster appearance is invalid: {reason}")
            }
            _ => return None,
        })
    }

    pub(super) fn fmt_rules(
        &self,
        formatter: &mut std::fmt::Formatter<'_>,
    ) -> Option<std::fmt::Result> {
        Some(match self {
            Self::DuplicateClassicRuleId { kind, classic_id } => write!(
                formatter,
                "Classic {kind} ID {classic_id} is already owned by another rule"
            ),
            Self::ScenarioItemNotFound(record_index) => {
                write!(formatter, "Data NI record {record_index} was not found")
            }
            Self::InvalidScenarioItem {
                record_index,
                reason,
            } => write!(
                formatter,
                "Item {}: {reason}",
                800 + u32::from(*record_index)
            ),
            Self::InvalidScenarioItemIdentity {
                record_index,
                classic_id,
            } => write!(
                formatter,
                "Data NI record {record_index} cannot own Classic item ID {classic_id}"
            ),
            Self::ScenarioSpellNotFound(record_index) => {
                write!(formatter, "Data Spell record {record_index} was not found")
            }
            Self::InvalidScenarioSpell {
                record_index,
                reason,
            } => write!(formatter, "Custom spell record {record_index}: {reason}"),
            Self::InvalidScenarioSpellIdentity {
                record_index,
                classic_id,
            } => write!(
                formatter,
                "Data Spell record {record_index} cannot own Classic spell ID {classic_id}"
            ),
            _ => return None,
        })
    }

    pub(super) fn fmt_monsters(
        &self,
        formatter: &mut std::fmt::Formatter<'_>,
    ) -> Option<std::fmt::Result> {
        Some(match self {
            Self::MonsterNotFound(identity) => {
                write!(formatter, "monster {} was not found", identity.0)
            }
            Self::MonsterDescriptionNotFound(native_id) => write!(
                formatter,
                "monster description {} was not found",
                native_id.0
            ),
            Self::InvalidMonster { identity, reason } => {
                write!(formatter, "monster {} is invalid: {reason}", identity.0)
            }
            Self::InvalidMonsterReference { source, field } => write!(
                formatter,
                "monster reference {}.{field} was not found",
                source.0
            ),
            _ => return None,
        })
    }

    pub(super) fn fmt_battles(
        &self,
        formatter: &mut std::fmt::Formatter<'_>,
    ) -> Option<std::fmt::Result> {
        Some(match self {
            Self::InvalidBattleMonsterRewrite(reason) => {
                write!(
                    formatter,
                    "invalid battle monster reference repair: {reason}"
                )
            }
            Self::BattleNotFound(identity) => {
                write!(formatter, "battle {} was not found", identity.0)
            }
            Self::InvalidBattle { identity, reason } => {
                write!(formatter, "battle {} is invalid: {reason}", identity.0)
            }
            Self::InvalidBattleReference { source, field } => write!(
                formatter,
                "battle reference {}.{field} was not found",
                source.0
            ),
            _ => return None,
        })
    }

    pub(super) fn fmt_economy(
        &self,
        formatter: &mut std::fmt::Formatter<'_>,
    ) -> Option<std::fmt::Result> {
        Some(match self {
            Self::TreasureNotFound(identity) => {
                write!(formatter, "treasure {} was not found", identity.0)
            }
            Self::InvalidTreasure { identity, reason } => {
                write!(formatter, "treasure {} is invalid: {reason}", identity.0)
            }
            Self::InvalidTreasureReference { source, slot } => write!(
                formatter,
                "treasure item reference {}.itemIds[{slot}] was not found",
                source.0
            ),
            Self::ShopNotFound(identity) => write!(formatter, "shop {} was not found", identity.0),
            Self::InvalidShop { identity, reason } => {
                write!(formatter, "shop {} is invalid: {reason}", identity.0)
            }
            Self::InvalidShopReference { source, slot } => write!(
                formatter,
                "shop item reference {}.itemIds[{slot}] was not found",
                source.0
            ),
            _ => return None,
        })
    }

    pub(super) fn fmt_extra_codes(
        &self,
        formatter: &mut std::fmt::Formatter<'_>,
    ) -> Option<std::fmt::Result> {
        Some(match self {
            Self::InvalidExtraCodeReference { source, index } => write!(
                formatter,
                "extra-code reference {}.values[{index}] was not found",
                source.0
            ),
            Self::InvalidExtraCodeBranchMode {
                source,
                layout,
                mode,
            } => write!(
                formatter,
                "extra-code {} {:?} branch mode {mode} is outside the Classic switch",
                source.0, layout
            ),
            _ => return None,
        })
    }
}
