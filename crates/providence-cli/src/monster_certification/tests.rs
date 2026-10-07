use super::{MONSTER_RECORD_BYTES, compile_repair, decode_monster_set, prepare_repair};
use crate::read_only_probe::verify_owned_bytes;

#[test]
fn death_macro_repair_preserves_other_native_bytes() {
    let mut source = vec![0; MONSTER_RECORD_BYTES];
    source[170..179].copy_from_slice(b"Monster 0");
    let (snapshot, original) = prepare_repair(&source, 0).unwrap();
    assert_eq!(original, 0);
    let compiled = compile_repair(snapshot, &source, 0, 7).unwrap();
    assert_eq!(compiled.len(), source.len());
    assert_eq!(
        verify_owned_bytes(&source, &compiled, 166..168, "death macro range").unwrap(),
        vec![167],
    );
    assert_eq!(
        decode_monster_set(&compiled, "Data MD", 0).monsters[0].death_macro,
        7
    );
}
