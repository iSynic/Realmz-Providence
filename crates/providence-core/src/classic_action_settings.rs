//! EDCD reads in Classic newland.c at 491816ad60037394f92c428e99c004494d3c28b3.
//! Masks describe potentially consumed words, not editor form layouts or reachability.

pub(crate) fn primary_words(opcode: i16) -> Option<u8> {
    Some(match opcode {
        -23 | 2 | 3 | 7 | 12 | 13 | 15 | 16 | 20 | 21 | 22 | 23 | 31 | 33 | 37 | 38 | 42 | 45
        | 46 | 48 | 54 | 56 | 58 | 67 | 73 | 74 | 75 | 76 | 77 | 78 | 85 | 86 | 87 | 92 | 107
        | 120 | 123 | 126 => 0b11111,
        17 | 18 | 30 | 40 | 43 | 51 | 63 => 0b01111,
        19 | 41 | 60 | 90 | 106 | 108 | 122 => 0b00011,
        52 | 53 | 57 | 65 | 69 | 103 => 0b00111,
        55 | 64 | 72 | 81 => 0b11011,
        50 => 0b10111,
        59 | 124 => 0b11110,
        61 => 0b01110,
        125 => 0b10011,
        68 => 0b00101,
        70 => 0b00001,
        // Code 121 loads a row but does not inspect any of its words.
        121 => 0,
        _ => return None,
    })
}

pub(crate) fn companion_words(opcode: i16, primary: [i16; 5]) -> u8 {
    if opcode != 92 {
        return 0;
    }
    match primary[4] {
        0 | 2 => 0b01111,
        1 => 0b00011,
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn direct_ids_are_not_extra_code_references() {
        for opcode in [0, 1, 4, 5, 8, 14, -14, 24, 39, 100, 111] {
            assert_eq!(primary_words(opcode), None, "opcode {opcode}");
        }
    }

    #[test]
    fn cross_case_dispatch_reads_are_included() {
        // 33 jumps to branch; 42/46/58 jump to forcebranch; 45 to teleport.
        for opcode in [33, 42, 45, 46, 58] {
            assert_eq!(primary_words(opcode), Some(0b11111));
        }
        // 59 never compares its first word before entering forcebranch.
        assert_eq!(primary_words(59), Some(0b11110));
    }

    #[test]
    fn unused_and_mode_dependent_words_do_not_claim_execution_effects() {
        assert_eq!(primary_words(19), Some(0b00011));
        assert_eq!(primary_words(121), Some(0));
        assert_eq!(primary_words(61), Some(0b01110));
        assert_eq!(companion_words(92, [0, 0, 0, 0, -1]), 0);
        assert_eq!(companion_words(92, [0, 0, 0, 0, 0]), 0b01111);
        assert_eq!(companion_words(92, [0, 0, 0, 0, 1]), 0b00011);
        assert_eq!(companion_words(92, [0, 0, 0, 0, 2]), 0b01111);
    }
}
