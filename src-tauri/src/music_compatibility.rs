use sha2::{Digest, Sha256};

pub const LEGACY_OUTDOOR_MUSIC_BYTES: usize = 60_224;
pub const LEGACY_OUTDOOR_MUSIC_MD5: &str = "1A2E7CC637BCF082D21204E2DA1028B2";
pub const LEGACY_OUTDOOR_MUSIC_SHA256: &str =
    "0ba9022f65d5cee0b57103c64264fc64f8fb0f84d63cf70445f2747ead9f2471";
pub const OUTDOOR_MUSIC_REPLACEMENT_SHA256: &str =
    "f34da5b612972af0d6da8c000a1edc494a87b0c7aee627494a8d87f12132143f";
pub const OUTDOOR_MUSIC_REPLACEMENT: &[u8] =
    include_bytes!("../../public/bundled-libraries/providence/Outdoor Music.mod");

pub fn legacy_outdoor_music_slot(name: &str, bytes: &[u8]) -> Option<u8> {
    if !is_legacy_outdoor_music(bytes) {
        return None;
    }
    legacy_outdoor_music_slot_for_fingerprint(name, bytes.len(), LEGACY_OUTDOOR_MUSIC_SHA256)
}

pub fn legacy_outdoor_music_slot_for_fingerprint(
    name: &str,
    byte_length: usize,
    sha256: &str,
) -> Option<u8> {
    let slot = match name.trim().to_ascii_lowercase().as_str() {
        "custom 1 music" => 1,
        "custom 2 music" => 2,
        "custom 3 music" => 3,
        _ => return None,
    };
    (byte_length == LEGACY_OUTDOOR_MUSIC_BYTES
        && sha256.eq_ignore_ascii_case(LEGACY_OUTDOOR_MUSIC_SHA256))
    .then_some(slot)
}

pub fn is_legacy_outdoor_music(bytes: &[u8]) -> bool {
    bytes.len() == LEGACY_OUTDOOR_MUSIC_BYTES && sha256_hex(bytes) == LEGACY_OUTDOOR_MUSIC_SHA256
}

pub fn replacement_bytes() -> &'static [u8] {
    debug_assert_eq!(
        sha256_hex(OUTDOOR_MUSIC_REPLACEMENT),
        OUTDOOR_MUSIC_REPLACEMENT_SHA256
    );
    OUTDOOR_MUSIC_REPLACEMENT
}

pub fn is_outdoor_music_replacement(bytes: &[u8]) -> bool {
    bytes.len() == OUTDOOR_MUSIC_REPLACEMENT.len()
        && sha256_hex(bytes) == OUTDOOR_MUSIC_REPLACEMENT_SHA256
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_replacement_is_a_different_standard_mod() {
        assert_eq!(OUTDOOR_MUSIC_REPLACEMENT.len(), 62_054);
        assert_eq!(&OUTDOOR_MUSIC_REPLACEMENT[1080..1084], b"M.K.");
        assert_eq!(
            sha256_hex(OUTDOOR_MUSIC_REPLACEMENT),
            OUTDOOR_MUSIC_REPLACEMENT_SHA256
        );
        assert!(!is_legacy_outdoor_music(OUTDOOR_MUSIC_REPLACEMENT));
    }

    #[test]
    fn legacy_alias_requires_the_exact_known_fingerprint_and_classic_slot_name() {
        assert_eq!(
            legacy_outdoor_music_slot_for_fingerprint(
                "Custom 2 Music",
                LEGACY_OUTDOOR_MUSIC_BYTES,
                LEGACY_OUTDOOR_MUSIC_SHA256,
            ),
            Some(2)
        );
        assert_eq!(
            legacy_outdoor_music_slot_for_fingerprint(
                "Custom 2 Music",
                LEGACY_OUTDOOR_MUSIC_BYTES - 1,
                LEGACY_OUTDOOR_MUSIC_SHA256,
            ),
            None
        );
        assert_eq!(
            legacy_outdoor_music_slot_for_fingerprint(
                "Outdoor Music",
                LEGACY_OUTDOOR_MUSIC_BYTES,
                LEGACY_OUTDOOR_MUSIC_SHA256,
            ),
            None
        );
    }
}
