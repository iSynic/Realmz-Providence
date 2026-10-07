use super::contracts::*;
use crate::{
    codecs::{
        MONSTER_DESCRIPTION_RECORD_BYTES, MONSTER_RECORD_BYTES, decode_monster_descriptions,
        decode_monsters,
    },
    model::{BlobId, MonsterRecord, NativeRecordId, StableId},
};
use sha2::{Digest, Sha256};
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedMonsterScrapbook {
    pub source: MonsterLibrarySource,
    pub entries: Vec<MonsterLibraryEntry>,
}

pub fn decode_monster_scrapbook(
    bytes: &[u8],
    native_name: &str,
    evidence_revision: &str,
    evidence_path: &str,
) -> DecodedMonsterScrapbook {
    let digest = hex_digest(bytes);
    let blob = BlobId(format!("sha256:{digest}"));
    let source_identity = StableId(format!("monster-library-source:{digest}"));
    let complete_bytes =
        bytes.len() / MONSTER_SCRAPBOOK_RECORD_BYTES * MONSTER_SCRAPBOOK_RECORD_BYTES;
    let rows = bytes[..complete_bytes]
        .chunks_exact(MONSTER_SCRAPBOOK_RECORD_BYTES)
        .collect::<Vec<_>>();
    let mut monster_bytes = Vec::with_capacity(rows.len() * MONSTER_RECORD_BYTES);
    let mut description_bytes = Vec::with_capacity(rows.len() * MONSTER_DESCRIPTION_RECORD_BYTES);
    for row in &rows {
        monster_bytes.extend_from_slice(&row[..MONSTER_RECORD_BYTES]);
        description_bytes.extend_from_slice(&row[MONSTER_RECORD_BYTES..]);
    }
    let monsters = decode_monsters(&monster_bytes, native_name, 0).records;
    let descriptions = decode_monster_descriptions(&description_bytes).records;
    let entries = monsters
        .into_iter()
        .zip(descriptions)
        .enumerate()
        .map(|(index, (monster, description))| {
            scrapbook_entry(&digest, &source_identity, index, monster, description.text)
        })
        .collect::<Vec<_>>();
    DecodedMonsterScrapbook {
        source: MonsterLibrarySource {
            identity: source_identity,
            native_name: native_name.into(),
            blob,
            byte_length: bytes.len() as u64,
            sha256: digest,
            record_bytes: MONSTER_SCRAPBOOK_RECORD_BYTES,
            record_count: rows.len(),
            trailing_bytes: bytes.len() - complete_bytes,
            evidence_revision: evidence_revision.into(),
            evidence_path: evidence_path.into(),
        },
        entries,
    }
}
fn scrapbook_entry(
    digest: &str,
    source_identity: &StableId,
    index: usize,
    mut monster: MonsterRecord,
    description: String,
) -> MonsterLibraryEntry {
    let identity = StableId(format!("monster-library:built-in:{digest}:{index}"));
    let preferred = NativeRecordId(index as u32);
    let label = if monster.display_name.trim().is_empty() {
        format!("Monster {index}")
    } else {
        monster.display_name.clone()
    };
    monster.identity = StableId(format!("{}:template", identity.0));
    monster.native_id = preferred;
    monster.authored = false;
    MonsterLibraryEntry {
        identity,
        ownership: MonsterLibraryOwnership::BuiltIn,
        label,
        preferred_scenario_monster_id: preferred,
        template: monster,
        description,
        origin: MonsterLibraryOrigin::BuiltInScrapbook {
            source: source_identity.clone(),
            record_index: index as u32,
        },
    }
}
fn hex_digest(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
