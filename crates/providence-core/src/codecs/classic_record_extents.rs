use sha2::{Digest, Sha256};

/// Exact source-backed exceptions where a native file contains aligned foreign
/// payload after its authored records. The original bytes remain compatibility
/// source and are never discarded by compilation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CertifiedRecordExtent {
    pub authored_records: usize,
    pub source: &'static str,
}

const WHITE_DRAGON_DATA_ED3_SHA256: &str =
    "ff82bb8ad3f1585b9cc70fd869ec0f89932e922c28bdfd826620af77c4d5a608";
const WHITE_DRAGON_DATA_ED3_BYTES: usize = 86_040;
const WHITE_DRAGON_AUTHORED_XAPS: usize = 394;

const PRELUDE_DATA_BD_SHA256: &str =
    "4a49bc7491cefdc5148ce3a755716e8c14f6086b797f1fd69bd6fd823b25f5e1";
const PRELUDE_DATA_BD_BYTES: usize = 75_774;
const PRELUDE_AUTHORED_BATTLES: usize = 111;
const CASTLE_DATA_BD_SHA256: &str =
    "6aca0d77976d4055c64f6424343066b196189fdc2325a02ff4fb82239331c7f9";
const CASTLE_DATA_BD_BYTES: usize = 84_424;
const CASTLE_AUTHORED_BATTLES: usize = 229;

const GRILOCH_DATA_MD_SHA256: &str =
    "6a1496e62e7c0b96c4d5b6e532c2a8c8d99fdbbd54048b73ba386dbb2e43df6d";
const GRILOCH_DATA_MD_BYTES: usize = 52_710;
const GRILOCH_AUTHORED_NORMAL_MONSTERS: usize = 175;
const GRILOCH_DATA_MD1_SHA256: &str =
    "176c493a4e21e420eded7370fadd2eb298629ef17ed1618459f9526373ff6c99";
const GRILOCH_DATA_MD1_BYTES: usize = 36_750;
const GRILOCH_AUTHORED_STRONG_MONSTERS: usize = 171;
const BYWATER_DATA_MD_SHA256: &str =
    "b1badaf44c9e48f51f143310bce20b28a18f779b1e4fb9914993885e40c746bf";
const BYWATER_DATA_MD_BYTES: usize = 32_550;
const BYWATER_AUTHORED_NORMAL_MONSTERS: usize = 137;
const PRELUDE_DATA_MD_MINUS_1_SHA256: &str =
    "d36b2de09c45d27fed70617f27cbecb88b0678e7367104f99c563f984a24db2f";
const PRELUDE_DATA_MD_MINUS_1_BYTES: usize = 36_120;
const PRELUDE_AUTHORED_MEGA_MONSTERS: usize = 171;

const DESTROY_DATA_SD_SHA256: &str =
    "a5980db21b901800a9ef71c26d02e9d8a3c8c9cede7095f17ceb5742e2a27dc6";
const DESTROY_DATA_SD_BYTES: usize = 114_076;
const DESTROY_AUTHORED_SHOPS: usize = 21;

const GRILOCH_DATA_SD_SHA256: &str =
    "9edc86d34039c26e4acae19a791c1e2eabe383345c7b05e353f62b726e657b8e";
const GRILOCH_DATA_SD_BYTES: usize = 114_076;
const GRILOCH_AUTHORED_SHOPS: usize = 30;

const TROUBLE_DATA_SD_SHA256: &str =
    "1df7b58bb3f21383e62b6abc62216ef0cc8530cf409fe1b79a522eef1af28568";
const TROUBLE_DATA_SD_BYTES: usize = 114_076;
const TROUBLE_AUTHORED_SHOPS: usize = 22;

const GRILOCH_DATA_TD_SHA256: &str =
    "f69b43b524fb211e4f60f8bce858a45e96994b463de1c532b70376800da1fa72";
const GRILOCH_DATA_TD_BYTES: usize = 3_888;
const GRILOCH_AUTHORED_TREASURES: usize = 80;

pub fn certified_extra_action_point_extent(bytes: &[u8]) -> Option<CertifiedRecordExtent> {
    if bytes.len() != WHITE_DRAGON_DATA_ED3_BYTES {
        return None;
    }
    let digest = format!("{:x}", Sha256::digest(bytes));
    known_extra_action_point_extent(&digest, bytes.len())
}

pub fn certified_extra_action_point_source(
    blob_id: &str,
    byte_length: usize,
) -> Option<CertifiedRecordExtent> {
    let digest = blob_id.strip_prefix("sha256:").unwrap_or(blob_id);
    known_extra_action_point_extent(digest, byte_length)
}

pub fn certified_battle_extent(bytes: &[u8]) -> Option<CertifiedRecordExtent> {
    exact_extent(
        bytes,
        PRELUDE_DATA_BD_SHA256,
        PRELUDE_DATA_BD_BYTES,
        PRELUDE_AUTHORED_BATTLES,
        "Prelude to Pestilence Data BD foreign-tail provenance audit",
    )
    .or_else(|| {
        exact_extent(
            bytes,
            CASTLE_DATA_BD_SHA256,
            CASTLE_DATA_BD_BYTES,
            CASTLE_AUTHORED_BATTLES,
            "Castle in the Clouds Data BD foreign-tail provenance audit",
        )
    })
}

pub fn certified_battle_source(blob_id: &str, byte_length: usize) -> Option<CertifiedRecordExtent> {
    let digest = blob_id.strip_prefix("sha256:").unwrap_or(blob_id);
    match (digest, byte_length) {
        (PRELUDE_DATA_BD_SHA256, PRELUDE_DATA_BD_BYTES) => Some(CertifiedRecordExtent {
            authored_records: PRELUDE_AUTHORED_BATTLES,
            source: "Prelude to Pestilence Data BD foreign-tail provenance audit",
        }),
        (CASTLE_DATA_BD_SHA256, CASTLE_DATA_BD_BYTES) => Some(CertifiedRecordExtent {
            authored_records: CASTLE_AUTHORED_BATTLES,
            source: "Castle in the Clouds Data BD foreign-tail provenance audit",
        }),
        _ => None,
    }
}

pub fn certified_monster_extent(bytes: &[u8], native_path: &str) -> Option<CertifiedRecordExtent> {
    match native_path {
        "Data MD" => exact_extent(
            bytes,
            GRILOCH_DATA_MD_SHA256,
            GRILOCH_DATA_MD_BYTES,
            GRILOCH_AUTHORED_NORMAL_MONSTERS,
            "Grilochs Revenge Data MD foreign-tail provenance audit",
        )
        .or_else(|| {
            exact_extent(
                bytes,
                BYWATER_DATA_MD_SHA256,
                BYWATER_DATA_MD_BYTES,
                BYWATER_AUTHORED_NORMAL_MONSTERS,
                "City of Bywater Data MD post-terminator payload audit",
            )
        }),
        "Data MD-1" => exact_extent(
            bytes,
            PRELUDE_DATA_MD_MINUS_1_SHA256,
            PRELUDE_DATA_MD_MINUS_1_BYTES,
            PRELUDE_AUTHORED_MEGA_MONSTERS,
            "Prelude to Pestilence Data MD-1 post-terminator payload audit",
        ),
        "Data MD1" => exact_extent(
            bytes,
            GRILOCH_DATA_MD1_SHA256,
            GRILOCH_DATA_MD1_BYTES,
            GRILOCH_AUTHORED_STRONG_MONSTERS,
            "Grilochs Revenge Data MD1 post-terminator payload audit",
        ),
        _ => None,
    }
}

pub fn certified_monster_source(
    blob_id: &str,
    byte_length: usize,
    native_path: &str,
) -> Option<CertifiedRecordExtent> {
    let digest = blob_id.strip_prefix("sha256:").unwrap_or(blob_id);
    match native_path {
        "Data MD" if digest == GRILOCH_DATA_MD_SHA256 && byte_length == GRILOCH_DATA_MD_BYTES => {
            Some(CertifiedRecordExtent {
                authored_records: GRILOCH_AUTHORED_NORMAL_MONSTERS,
                source: "Grilochs Revenge Data MD foreign-tail provenance audit",
            })
        }
        "Data MD" if digest == BYWATER_DATA_MD_SHA256 && byte_length == BYWATER_DATA_MD_BYTES => {
            Some(CertifiedRecordExtent {
                authored_records: BYWATER_AUTHORED_NORMAL_MONSTERS,
                source: "City of Bywater Data MD post-terminator payload audit",
            })
        }
        "Data MD-1"
            if digest == PRELUDE_DATA_MD_MINUS_1_SHA256
                && byte_length == PRELUDE_DATA_MD_MINUS_1_BYTES =>
        {
            Some(CertifiedRecordExtent {
                authored_records: PRELUDE_AUTHORED_MEGA_MONSTERS,
                source: "Prelude to Pestilence Data MD-1 post-terminator payload audit",
            })
        }
        "Data MD1"
            if digest == GRILOCH_DATA_MD1_SHA256 && byte_length == GRILOCH_DATA_MD1_BYTES =>
        {
            Some(CertifiedRecordExtent {
                authored_records: GRILOCH_AUTHORED_STRONG_MONSTERS,
                source: "Grilochs Revenge Data MD1 post-terminator payload audit",
            })
        }
        _ => None,
    }
}

pub fn certified_shop_extent(bytes: &[u8]) -> Option<CertifiedRecordExtent> {
    exact_extent(
        bytes,
        DESTROY_DATA_SD_SHA256,
        DESTROY_DATA_SD_BYTES,
        DESTROY_AUTHORED_SHOPS,
        "Destroy the Necronomicon Data SD foreign-tail provenance audit",
    )
    .or_else(|| {
        exact_extent(
            bytes,
            GRILOCH_DATA_SD_SHA256,
            GRILOCH_DATA_SD_BYTES,
            GRILOCH_AUTHORED_SHOPS,
            "Grilochs Revenge Data SD foreign-tail provenance audit",
        )
    })
    .or_else(|| {
        exact_extent(
            bytes,
            TROUBLE_DATA_SD_SHA256,
            TROUBLE_DATA_SD_BYTES,
            TROUBLE_AUTHORED_SHOPS,
            "Trouble in the Sword Lands Data SD foreign-tail provenance audit",
        )
    })
}

pub fn certified_shop_source(blob_id: &str, byte_length: usize) -> Option<CertifiedRecordExtent> {
    let digest = blob_id.strip_prefix("sha256:").unwrap_or(blob_id);
    match (digest, byte_length) {
        (DESTROY_DATA_SD_SHA256, DESTROY_DATA_SD_BYTES) => Some(CertifiedRecordExtent {
            authored_records: DESTROY_AUTHORED_SHOPS,
            source: "Destroy the Necronomicon Data SD foreign-tail provenance audit",
        }),
        (GRILOCH_DATA_SD_SHA256, GRILOCH_DATA_SD_BYTES) => Some(CertifiedRecordExtent {
            authored_records: GRILOCH_AUTHORED_SHOPS,
            source: "Grilochs Revenge Data SD foreign-tail provenance audit",
        }),
        (TROUBLE_DATA_SD_SHA256, TROUBLE_DATA_SD_BYTES) => Some(CertifiedRecordExtent {
            authored_records: TROUBLE_AUTHORED_SHOPS,
            source: "Trouble in the Sword Lands Data SD foreign-tail provenance audit",
        }),
        _ => None,
    }
}

pub fn certified_treasure_extent(bytes: &[u8]) -> Option<CertifiedRecordExtent> {
    exact_extent(
        bytes,
        GRILOCH_DATA_TD_SHA256,
        GRILOCH_DATA_TD_BYTES,
        GRILOCH_AUTHORED_TREASURES,
        "Grilochs Revenge Data TD foreign-tail provenance audit",
    )
}

pub fn certified_treasure_source(
    blob_id: &str,
    byte_length: usize,
) -> Option<CertifiedRecordExtent> {
    let digest = blob_id.strip_prefix("sha256:").unwrap_or(blob_id);
    (digest == GRILOCH_DATA_TD_SHA256 && byte_length == GRILOCH_DATA_TD_BYTES).then_some(
        CertifiedRecordExtent {
            authored_records: GRILOCH_AUTHORED_TREASURES,
            source: "Grilochs Revenge Data TD foreign-tail provenance audit",
        },
    )
}

fn exact_extent(
    bytes: &[u8],
    expected_digest: &str,
    expected_length: usize,
    authored_records: usize,
    source: &'static str,
) -> Option<CertifiedRecordExtent> {
    if bytes.len() != expected_length {
        return None;
    }
    (format!("{:x}", Sha256::digest(bytes)) == expected_digest).then_some(CertifiedRecordExtent {
        authored_records,
        source,
    })
}

fn known_extra_action_point_extent(
    digest: &str,
    byte_length: usize,
) -> Option<CertifiedRecordExtent> {
    (digest == WHITE_DRAGON_DATA_ED3_SHA256 && byte_length == WHITE_DRAGON_DATA_ED3_BYTES)
        .then_some(CertifiedRecordExtent {
            authored_records: WHITE_DRAGON_AUTHORED_XAPS,
            source: "White Dragon Data ED3 foreign-tail provenance audit",
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn white_dragon_extent_requires_both_exact_hash_and_length() {
        let extent = known_extra_action_point_extent(
            WHITE_DRAGON_DATA_ED3_SHA256,
            WHITE_DRAGON_DATA_ED3_BYTES,
        )
        .expect("certified source");
        assert_eq!(extent.authored_records, 394);
        assert!(known_extra_action_point_extent(WHITE_DRAGON_DATA_ED3_SHA256, 40).is_none());
        assert!(
            known_extra_action_point_extent(&"0".repeat(64), WHITE_DRAGON_DATA_ED3_BYTES).is_none()
        );
        assert_eq!(
            certified_extra_action_point_source(
                &format!("sha256:{WHITE_DRAGON_DATA_ED3_SHA256}"),
                WHITE_DRAGON_DATA_ED3_BYTES,
            ),
            Some(extent)
        );
    }

    #[test]
    fn certified_battle_and_monster_extents_remain_source_specific() {
        assert_eq!(PRELUDE_AUTHORED_BATTLES, 111);
        assert_eq!(CASTLE_AUTHORED_BATTLES, 229);
        assert_eq!(GRILOCH_AUTHORED_NORMAL_MONSTERS, 175);
        assert_eq!(GRILOCH_AUTHORED_STRONG_MONSTERS, 171);
        assert!(certified_monster_extent(&[], "Data MD1").is_none());
        assert!(certified_battle_extent(&vec![0; PRELUDE_DATA_BD_BYTES]).is_none());
        assert_eq!(
            certified_battle_source(PRELUDE_DATA_BD_SHA256, PRELUDE_DATA_BD_BYTES)
                .expect("certified Prelude source")
                .authored_records,
            PRELUDE_AUTHORED_BATTLES
        );
        assert!(certified_battle_source(PRELUDE_DATA_BD_SHA256, 346).is_none());
        assert_eq!(
            certified_battle_source(CASTLE_DATA_BD_SHA256, CASTLE_DATA_BD_BYTES)
                .expect("certified Castle source")
                .authored_records,
            CASTLE_AUTHORED_BATTLES
        );
        assert_eq!(
            certified_monster_source(GRILOCH_DATA_MD_SHA256, GRILOCH_DATA_MD_BYTES, "Data MD")
                .expect("certified Griloch source")
                .authored_records,
            GRILOCH_AUTHORED_NORMAL_MONSTERS
        );
        assert_eq!(
            certified_monster_source(GRILOCH_DATA_MD1_SHA256, GRILOCH_DATA_MD1_BYTES, "Data MD1")
                .expect("certified Griloch strong-set source")
                .authored_records,
            GRILOCH_AUTHORED_STRONG_MONSTERS
        );
        assert!(
            certified_monster_source(GRILOCH_DATA_MD1_SHA256, GRILOCH_DATA_MD1_BYTES, "Data MD-1")
                .is_none()
        );
    }

    #[test]
    fn additional_terminated_monster_extents_are_source_specific() {
        assert_eq!(
            certified_monster_source(BYWATER_DATA_MD_SHA256, BYWATER_DATA_MD_BYTES, "Data MD")
                .expect("certified Bywater normal set")
                .authored_records,
            BYWATER_AUTHORED_NORMAL_MONSTERS
        );
        assert_eq!(
            certified_monster_source(
                PRELUDE_DATA_MD_MINUS_1_SHA256,
                PRELUDE_DATA_MD_MINUS_1_BYTES,
                "Data MD-1",
            )
            .expect("certified Prelude mega set")
            .authored_records,
            PRELUDE_AUTHORED_MEGA_MONSTERS
        );
        assert!(
            certified_monster_source(BYWATER_DATA_MD_SHA256, BYWATER_DATA_MD_BYTES, "Data MD1")
                .is_none()
        );
    }

    #[test]
    fn certified_economy_extents_remain_source_specific() {
        assert_eq!(DESTROY_AUTHORED_SHOPS, 21);
        assert_eq!(GRILOCH_AUTHORED_SHOPS, 30);
        assert_eq!(TROUBLE_AUTHORED_SHOPS, 22);
        assert_eq!(GRILOCH_AUTHORED_TREASURES, 80);
        assert!(certified_shop_extent(&vec![0; DESTROY_DATA_SD_BYTES]).is_none());
        assert!(certified_treasure_extent(&vec![0; GRILOCH_DATA_TD_BYTES]).is_none());
        assert_eq!(
            certified_shop_source(DESTROY_DATA_SD_SHA256, DESTROY_DATA_SD_BYTES)
                .expect("certified Destroy source")
                .authored_records,
            DESTROY_AUTHORED_SHOPS
        );
        assert_eq!(
            certified_shop_source(GRILOCH_DATA_SD_SHA256, GRILOCH_DATA_SD_BYTES)
                .expect("certified Griloch shop source")
                .authored_records,
            GRILOCH_AUTHORED_SHOPS
        );
        assert_eq!(
            certified_shop_source(TROUBLE_DATA_SD_SHA256, TROUBLE_DATA_SD_BYTES)
                .expect("certified Trouble shop source")
                .authored_records,
            TROUBLE_AUTHORED_SHOPS
        );
        assert_eq!(
            certified_treasure_source(GRILOCH_DATA_TD_SHA256, GRILOCH_DATA_TD_BYTES)
                .expect("certified Griloch treasure source")
                .authored_records,
            GRILOCH_AUTHORED_TREASURES
        );
    }
}
