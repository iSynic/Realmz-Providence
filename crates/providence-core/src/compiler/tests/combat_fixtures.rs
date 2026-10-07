use super::*;

pub(super) fn missing_death_macro() -> (EditorSession, Vec<u8>, Vec<u8>) {
    let mut source = vec![0u8; crate::codecs::MONSTER_RECORD_BYTES * 30 + 3];
    let row_start = crate::codecs::MONSTER_RECORD_BYTES * 29;
    source[row_start + 166..row_start + 168].copy_from_slice(&108i16.to_be_bytes());
    source[row_start + 170..row_start + 178].copy_from_slice(b"Sentinel");
    let tail_start = source.len() - 3;
    source[tail_start..].copy_from_slice(&[0xde, 0xad, 0xbe]);
    let set = decode_monster_set(&source, "Data MD", 0);
    let mut snapshot = ProjectSnapshot::new_authored(StableId("monster-death-macro-repair".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId("sha256:monster-death-macro-repair-annex".into()),
    };
    snapshot.monster_sets.push(set);
    let data_ed3 = vec![0u8; crate::codecs::EXTRA_ACTION_POINT_RECORD_BYTES * 2];
    snapshot.extra_action_points = decode_extra_action_points(&data_ed3).records;
    let session = EditorSession::new(snapshot);
    (session, source, data_ed3)
}
