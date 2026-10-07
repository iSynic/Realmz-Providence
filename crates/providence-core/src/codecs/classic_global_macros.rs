use crate::model::{ScenarioApplicationContract, StableId};

pub const GLOBAL_MACRO_HOOK_BYTES: usize = 60;
pub const SOURCE_BACKED_GLOBAL_MACRO_SLOTS: [usize; 5] = [0, 1, 2, 4, 5];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedGlobalMacroHooks {
    pub contract: ScenarioApplicationContract,
    pub raw_slots: [i16; 30],
    pub trailing_bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GlobalMacroCodecError {
    InvalidCompatibilityLength {
        bytes: usize,
    },
    InvalidTarget {
        field: &'static str,
        target: StableId,
    },
}

impl std::fmt::Display for GlobalMacroCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidCompatibilityLength { bytes } => write!(
                formatter,
                "Global compatibility source has {bytes} bytes; Classic requires exactly {GLOBAL_MACRO_HOOK_BYTES}"
            ),
            Self::InvalidTarget { field, target } => write!(
                formatter,
                "Global {field} hook targets '{}'; Classic hooks require an extra-action-point:<nonzero-signed-short> identity",
                target.0
            ),
        }
    }
}

impl std::error::Error for GlobalMacroCodecError {}

pub fn decode_global_macro_hooks(bytes: &[u8]) -> DecodedGlobalMacroHooks {
    let complete_bytes = bytes.len().min(GLOBAL_MACRO_HOOK_BYTES);
    let mut raw_slots = [0i16; 30];
    for (slot, value) in raw_slots.iter_mut().enumerate() {
        let offset = slot * 2;
        if offset + 2 <= complete_bytes {
            *value = i16::from_be_bytes([bytes[offset], bytes[offset + 1]]);
        }
    }
    let mut contract = ScenarioApplicationContract::default();
    contract.hooks.start_game = target_for_door(raw_slots[0]);
    contract.hooks.party_death = target_for_door(raw_slots[1]);
    contract.hooks.end_adventure = target_for_door(raw_slots[2]);
    contract.hooks.shop = target_for_door(raw_slots[4]);
    contract.hooks.temple = target_for_door(raw_slots[5]);
    DecodedGlobalMacroHooks {
        contract,
        raw_slots,
        trailing_bytes: bytes
            .get(GLOBAL_MACRO_HOOK_BYTES..)
            .unwrap_or_default()
            .to_vec(),
    }
}

pub fn encode_global_macro_hooks(
    contract: &ScenarioApplicationContract,
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, GlobalMacroCodecError> {
    let mut output = match compatibility_source {
        Some(source) if source.len() == GLOBAL_MACRO_HOOK_BYTES => source.to_vec(),
        Some(source) => {
            return Err(GlobalMacroCodecError::InvalidCompatibilityLength {
                bytes: source.len(),
            });
        }
        None => vec![0; GLOBAL_MACRO_HOOK_BYTES],
    };
    for (slot, field, target) in [
        (0, "start", &contract.hooks.start_game),
        (1, "death", &contract.hooks.party_death),
        (2, "quit", &contract.hooks.end_adventure),
        (4, "shop", &contract.hooks.shop),
        (5, "temple", &contract.hooks.temple),
    ] {
        let door = target
            .as_ref()
            .map(|target| door_for_target(field, target))
            .transpose()?
            .unwrap_or_default();
        output[slot * 2..slot * 2 + 2].copy_from_slice(&door.to_be_bytes());
    }
    Ok(output)
}

fn target_for_door(door: i16) -> Option<StableId> {
    (door != 0).then(|| StableId(format!("extra-action-point:{door}")))
}

fn door_for_target(field: &'static str, target: &StableId) -> Result<i16, GlobalMacroCodecError> {
    target
        .0
        .strip_prefix("extra-action-point:")
        .and_then(|value| value.parse::<i16>().ok())
        .filter(|door| *door != 0)
        .ok_or_else(|| GlobalMacroCodecError::InvalidTarget {
            field,
            target: target.clone(),
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn changed_offsets(before: &[u8], after: &[u8]) -> Vec<usize> {
        before
            .iter()
            .zip(after)
            .enumerate()
            .filter_map(|(offset, (before, after))| (before != after).then_some(offset))
            .collect()
    }

    #[test]
    fn no_edit_round_trip_preserves_source_backed_and_unproven_slots() {
        let mut source = vec![0u8; GLOBAL_MACRO_HOOK_BYTES];
        for (slot, value) in [(0, 19i16), (1, 60), (2, 19), (3, 58), (29, 1)] {
            source[slot * 2..slot * 2 + 2].copy_from_slice(&value.to_be_bytes());
        }
        let decoded = decode_global_macro_hooks(&source);
        assert_eq!(
            decoded.contract.hooks.start_game,
            Some(StableId("extra-action-point:19".into()))
        );
        assert_eq!(decoded.raw_slots[3], 58);
        assert_eq!(decoded.raw_slots[29], 1);
        assert_eq!(
            encode_global_macro_hooks(&decoded.contract, Some(&source)).unwrap(),
            source
        );
    }

    #[test]
    fn edited_hook_changes_only_its_owned_signed_short() {
        let mut source = vec![0x5a; GLOBAL_MACRO_HOOK_BYTES];
        for slot in SOURCE_BACKED_GLOBAL_MACRO_SLOTS {
            source[slot * 2..slot * 2 + 2].fill(0);
        }
        let mut decoded = decode_global_macro_hooks(&source);
        decoded.contract.hooks.shop = Some(StableId("extra-action-point:258".into()));
        let output = encode_global_macro_hooks(&decoded.contract, Some(&source)).unwrap();
        assert_eq!(changed_offsets(&source, &output), vec![8, 9]);
        assert_eq!(&output[8..10], &[0x01, 0x02]);
        assert_eq!(output[6], 0x5a);
        assert_eq!(output[58], 0x5a);
    }

    #[test]
    fn classic_writer_rejects_a_non_extra_action_point_program() {
        let mut contract = ScenarioApplicationContract::default();
        contract.hooks.start_game = Some(StableId("action-point:land:0:17".into()));
        assert!(matches!(
            encode_global_macro_hooks(&contract, None),
            Err(GlobalMacroCodecError::InvalidTarget { field: "start", .. })
        ));
    }

    #[test]
    fn classic_writer_rejects_zero_because_zero_means_no_hook() {
        let mut contract = ScenarioApplicationContract::default();
        contract.hooks.start_game = Some(StableId("extra-action-point:0".into()));
        assert!(matches!(
            encode_global_macro_hooks(&contract, None),
            Err(GlobalMacroCodecError::InvalidTarget { field: "start", .. })
        ));
    }
}
