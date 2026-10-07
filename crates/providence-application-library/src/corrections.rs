use providence_core::model::SourcedSpellDefinition;
use serde::Serialize;

const PRIEST_STUN_CLASSIC_ID: i16 = 2712;
const PRIEST_STUN_RECORD_INDEX: u16 = 206;
const PRIEST_STUN_PRE_FIX: [u8; 3] = [u8::MAX, u8::MAX, 0];
const PRIEST_STUN_CORRECTED: [u8; 3] = [1, 1, 2];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CertifiedApplicationCorrection {
    pub id: &'static str,
    pub native_path: &'static str,
    pub record_index: u16,
    pub classic_id: i16,
    pub byte_offsets: [usize; 3],
    pub input_values: [u8; 3],
    pub output_values: [u8; 3],
    pub evidence_repository: &'static str,
    pub evidence_commit: &'static str,
    pub evidence_path: &'static str,
    pub evidence_sha256: &'static str,
}

pub fn apply_certified_application_corrections(
    spells: &mut [SourcedSpellDefinition],
) -> Result<Vec<CertifiedApplicationCorrection>, String> {
    let spell = spells
        .iter_mut()
        .find(|spell| spell.definition.classic_id == PRIEST_STUN_CLASSIC_ID)
        .ok_or_else(|| {
            format!(
                "certified Priest Stun correction requires Classic spell {PRIEST_STUN_CLASSIC_ID}"
            )
        })?;
    if spell.definition.record_index != PRIEST_STUN_RECORD_INDEX {
        return Err(format!(
            "Classic spell {PRIEST_STUN_CLASSIC_ID} must be Data S record {PRIEST_STUN_RECORD_INDEX}, not {}",
            spell.definition.record_index
        ));
    }
    let input_values = [
        spell.definition.duration_min,
        spell.definition.duration_max,
        spell.definition.special,
    ];
    if input_values != PRIEST_STUN_PRE_FIX && input_values != PRIEST_STUN_CORRECTED {
        return Err(format!(
            "Classic spell {PRIEST_STUN_CLASSIC_ID} has unexpected duration/special bytes {input_values:?}; expected pre-fix {PRIEST_STUN_PRE_FIX:?} or corrected {PRIEST_STUN_CORRECTED:?}"
        ));
    }
    spell.definition.duration_min = PRIEST_STUN_CORRECTED[0];
    spell.definition.duration_max = PRIEST_STUN_CORRECTED[1];
    spell.definition.special = PRIEST_STUN_CORRECTED[2];
    spell.source = format!(
        "{}; corrected by Castle ef95fcff40d81f14ac668d5e13466da4a51de6f4",
        spell.source
    );

    Ok(vec![CertifiedApplicationCorrection {
        id: "classic.spell.2712-priest-stun",
        native_path: "Data S",
        record_index: PRIEST_STUN_RECORD_INDEX,
        classic_id: PRIEST_STUN_CLASSIC_ID,
        byte_offsets: [6195, 6196, 6205],
        input_values,
        output_values: PRIEST_STUN_CORRECTED,
        evidence_repository: "https://github.com/Realmz-Castle/realmz",
        evidence_commit: "ef95fcff40d81f14ac668d5e13466da4a51de6f4",
        evidence_path: "base/Realmz/Data Files/Data S",
        evidence_sha256: "f47776aadc0f4ebf42320e0aaedd39dd7b5a2c76c125a44e99ea461d962860e7",
    }])
}

#[cfg(test)]
mod tests {
    use super::*;
    use providence_core::codecs::{STANDARD_SPELL_BYTES, decode_standard_spells};

    fn pre_fix_catalog() -> Vec<SourcedSpellDefinition> {
        let mut bytes = vec![0; STANDARD_SPELL_BYTES];
        let start = usize::from(PRIEST_STUN_RECORD_INDEX) * 30;
        bytes[start + 15] = u8::MAX;
        bytes[start + 16] = u8::MAX;
        decode_standard_spells(&bytes, None).spells
    }

    #[test]
    fn priest_stun_correction_is_exact_and_source_attributed() {
        let mut spells = pre_fix_catalog();
        let corrections = apply_certified_application_corrections(&mut spells).unwrap();
        let stun = &spells[usize::from(PRIEST_STUN_RECORD_INDEX)];
        assert_eq!(
            [
                stun.definition.duration_min,
                stun.definition.duration_max,
                stun.definition.special,
            ],
            PRIEST_STUN_CORRECTED
        );
        assert_eq!(corrections[0].byte_offsets, [6195, 6196, 6205]);
        assert_eq!(corrections[0].input_values, PRIEST_STUN_PRE_FIX);
        assert!(
            stun.source
                .contains("ef95fcff40d81f14ac668d5e13466da4a51de6f4")
        );
    }

    #[test]
    fn correction_accepts_an_already_fixed_source_but_refuses_drift() {
        let mut spells = pre_fix_catalog();
        let stun = &mut spells[usize::from(PRIEST_STUN_RECORD_INDEX)];
        stun.definition.duration_min = 1;
        stun.definition.duration_max = 1;
        stun.definition.special = 2;
        assert!(apply_certified_application_corrections(&mut spells).is_ok());

        let stun = &mut spells[usize::from(PRIEST_STUN_RECORD_INDEX)];
        stun.definition.special = 3;
        let error = apply_certified_application_corrections(&mut spells).unwrap_err();
        assert!(error.contains("unexpected duration/special bytes"));
    }
}
