use serde::{Deserialize, Serialize};

use super::LibraryError;
use crate::model::AssetDescriptor;

/// Exact prepared content travels with its companion independently of a scenario.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonalMedia {
    pub primary: AssetDescriptor,
    pub companion: Option<AssetDescriptor>,
}

impl PersonalMedia {
    pub fn resources(&self) -> impl Iterator<Item = &AssetDescriptor> {
        std::iter::once(&self.primary).chain(self.companion.iter())
    }

    pub(super) fn validate(&self) -> Result<(), LibraryError> {
        for resource in self.resources() {
            super::valid_identity(&resource.identity)?;
            if !valid_preview_metadata(resource) {
                return Err(LibraryError::InvalidMedia);
            }
            let key = resource
                .classic_resource
                .as_ref()
                .ok_or(LibraryError::InvalidMedia)?;
            let family = match resource.kind.as_str() {
                "icon" | "portrait" | "combat-icon" | "special-land-tile" => "cicn",
                "picture" => "PICT",
                "sound" => "snd ",
                "music" => "MOD ",
                "text-resource" => "TEXT",
                "text-style-resource" => "styl",
                _ => return Err(LibraryError::InvalidMedia),
            };
            if key.resource_type != family
                || i16::try_from(key.resource_id).is_err()
                || !super::valid_blob(&resource.blob)
                || resource.byte_length == 0 && family != "TEXT"
                || !resource
                    .classic_payload_blob
                    .as_ref()
                    .is_some_and(super::valid_blob)
                || resource
                    .classic_payload_byte_length
                    .is_none_or(|length| length == 0 && family != "TEXT")
            {
                return Err(LibraryError::InvalidMedia);
            }
        }
        if let Some(companion) = &self.companion {
            let first = self
                .primary
                .classic_resource
                .as_ref()
                .ok_or(LibraryError::InvalidMedia)?;
            let second = companion
                .classic_resource
                .as_ref()
                .ok_or(LibraryError::InvalidMedia)?;
            let text_pair = first.resource_type == "TEXT"
                && second.resource_type == "styl"
                && first.resource_id == second.resource_id;
            let appearance_pair = matches!(self.primary.kind.as_str(), "icon" | "combat-icon")
                && self.primary.kind == companion.kind
                && second.resource_type == "cicn"
                && second.resource_id == first.resource_id + 308
                && self.primary.width == companion.width
                && self.primary.height == companion.height;
            if (!text_pair && !appearance_pair) || self.primary.identity == companion.identity {
                return Err(LibraryError::InvalidMedia);
            }
        }
        Ok(())
    }
}

fn valid_preview_metadata(resource: &AssetDescriptor) -> bool {
    match resource.kind.as_str() {
        "icon" | "portrait" | "combat-icon" | "special-land-tile" | "picture" => {
            resource.mime_type.as_deref() == Some("image/png")
                && resource
                    .width
                    .is_some_and(|value| (1..=2048).contains(&value))
                && resource
                    .height
                    .is_some_and(|value| (1..=2048).contains(&value))
        }
        "sound" => {
            resource.mime_type.as_deref() == Some("audio/wav")
                && resource.sample_rate.is_some_and(|value| value > 0)
                && resource.channels == Some(1)
        }
        "text-resource" => resource.mime_type.as_deref() == Some("text/plain"),
        "music" => {
            resource.mime_type.as_deref() == Some("audio/x-mod")
                && resource.scenario_music_slot.is_some_and(|slot| {
                    (1..=3).contains(&slot)
                        && resource
                            .classic_resource
                            .as_ref()
                            .is_some_and(|key| key.resource_id == i32::from(slot))
                })
                && resource.classic_payload_blob.as_ref() == Some(&resource.blob)
                && resource.classic_payload_byte_length == Some(resource.byte_length)
        }
        "text-style-resource" => true,
        _ => false,
    }
}
