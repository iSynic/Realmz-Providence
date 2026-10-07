use super::RegistrationInput;

fn name_value(serial: i32, name: &str) -> i32 {
    let bytes = name.to_ascii_lowercase().into_bytes();
    bytes
        .windows(2)
        .enumerate()
        .fold(serial, |value, (index, pair)| {
            value
                .wrapping_add(((index + 1) as i32).wrapping_mul(i32::from(pair[1])))
                .wrapping_sub(i32::from(pair[1]).wrapping_mul(i32::from(pair[0])))
        })
}

fn remainder(value: i32, divisor: i32) -> Result<i32, String> {
    if divisor == 0 {
        Err("This input produces a zero Classic divisor.".into())
    } else {
        Ok(value.wrapping_rem(divisor))
    }
}

pub(super) fn pc_bundled(
    input: &RegistrationInput,
    serial: i32,
    slot: i32,
    rec: i32,
    max: i32,
) -> Result<i32, String> {
    let nv = name_value(serial, &input.registration_name);
    let sv = serial.wrapping_div((slot - 5).wrapping_mul(666));
    if nv == 0 || sv == 0 {
        return Err("This input produces a zero name or serial factor.".into());
    }
    let part1 = remainder(512_i32.wrapping_add(sv), 128_i32.wrapping_mul(nv))?.wrapping_mul(256);
    let part2 = 1024_i32.wrapping_add(remainder(
        1024_i32.wrapping_add(nv),
        512_i32.wrapping_mul(sv),
    )?);
    Ok(part1
        .wrapping_add(part2)
        .wrapping_mul(max)
        .wrapping_sub(512)
        .wrapping_div(rec)
        .wrapping_add(18))
}

pub(super) fn pc_custom(
    input: &RegistrationInput,
    serial: i32,
    title: &[u8],
) -> Result<i32, String> {
    let nv = name_value(serial, &input.registration_name);
    let sv = serial / 333;
    if nv == 0 || sv == 0 {
        return Err("This input produces a zero name or serial factor.".into());
    }
    let part1 = remainder(450_i32.wrapping_add(sv), 96_i32.wrapping_mul(nv))?.wrapping_mul(512);
    let part2 = 999_i32.wrapping_add(remainder(
        999_i32.wrapping_add(nv),
        456_i32.wrapping_mul(sv),
    )?);
    let mut code = part1.wrapping_add(part2);
    for byte in input.segment1.bytes() {
        code = code.wrapping_add((1689_i32 * i32::from(byte.to_ascii_lowercase())) as i16 as i32);
    }
    for byte in input.segment2.bytes() {
        code = code.wrapping_sub((423_i32 * i32::from(byte.to_ascii_lowercase())) as i16 as i32);
    }
    // Classic lowercases its first sixty title bytes, then sums the complete string.
    for (index, byte) in title.iter().enumerate() {
        let byte = if index < 60 {
            byte.to_ascii_lowercase()
        } else {
            *byte
        };
        code = code.wrapping_add(112233_i32.wrapping_mul(i32::from(byte)));
    }
    Ok(code)
}

fn masked(bytes: &[u8]) -> i32 {
    let value = bytes.iter().fold(0_i32, |value, byte| {
        value.wrapping_mul(10).wrapping_add(i32::from(byte & 15))
    });
    if bytes.first() == Some(&b'-') {
        value.wrapping_neg()
    } else {
        value
    }
}

// MyrBit* addresses from the most significant bit, with Classic's shift wrapping.
fn mask(bit: i32) -> i32 {
    1_i32.wrapping_shl((31_i32.wrapping_sub(bit)) as u32)
}
fn test(value: i32, bit: i32) -> bool {
    value & mask(bit) != 0
}
fn set(value: i32, bit: i32) -> i32 {
    value | mask(bit)
}
fn clear(value: i32, bit: i32) -> i32 {
    value & !mask(bit)
}
fn memory_toggle(value: i32, bit: i32) -> i32 {
    if (0..32).contains(&bit) {
        value ^ mask(bit)
    } else {
        value
    }
}

pub(super) fn mac_custom(input: &RegistrationInput, serial: i32, title: &[u8]) -> i32 {
    let first = input.segment1.as_bytes();
    let second = input.segment2.as_bytes();
    let mut code = clear(serial, 8);
    for (left, right) in first.iter().zip(second) {
        code = code
            .wrapping_add(i32::from(*left))
            .wrapping_sub(i32::from(*right));
    }
    code = code
        .wrapping_add(masked(input.registration_name.as_bytes()))
        .wrapping_add(masked(title));
    let primer1 = 32 - (input.registration_name.len() % 4) as i32;
    let primer2 = 31 - (first.len() % 3) as i32;
    let primer3 = 30 - (second.len() % 5) as i32;
    for byte in input.registration_name.bytes() {
        let bit = i32::from(byte.to_ascii_lowercase()) % primer2;
        code = if test(code, bit) {
            clear(code, bit + 2)
        } else {
            set(code, bit + 1)
        };
    }
    // MyrNumToString returns C digits, but this path interprets their first byte as a Pascal length.
    let serial_text = serial.to_string();
    for index in 1..=usize::from(serial_text.as_bytes()[0]) {
        let bit = i32::from(serial_text.as_bytes().get(index).copied().unwrap_or(0)) % primer1;
        code = if test(code, bit + 2) {
            clear(code, bit + 1)
        } else {
            set(code, bit)
        };
    }
    for byte in first {
        let bit = i32::from(*byte) % primer3;
        code = if test(code, bit + 2) {
            clear(code, bit)
        } else {
            set(code, bit + 1)
        };
    }
    for byte in second {
        code = if test(code, i32::from(*byte) % primer1) {
            clear(code, i32::from(*byte) % primer2)
        } else {
            set(code, i32::from(*byte) % primer3)
        };
    }
    code.wrapping_abs()
}

pub(super) fn mac_bundled(
    input: &RegistrationInput,
    serial: i32,
    slot: i32,
    rec: i32,
    max: i32,
) -> Result<i32, String> {
    let mut serial_number = if slot == 13 || slot > 14 {
        serial.wrapping_div((slot - 5).wrapping_mul(666))
    } else {
        0
    };
    if slot > 14 {
        serial_number = serial_number.wrapping_add(later_switch(
            &input.registration_name,
            serial,
            serial_number,
            slot,
        )?);
    }
    Ok(masked(input.registration_name.as_bytes())
        .wrapping_div(rec)
        .wrapping_add(24)
        .wrapping_mul(max)
        .wrapping_sub(256)
        .wrapping_abs()
        .wrapping_add(100)
        .wrapping_add(serial_number))
}

fn later_switch(name: &str, serial: i32, serial_number: i32, slot: i32) -> Result<i32, String> {
    let mut bytes = [0_u8; 27];
    bytes[..name.len()].copy_from_slice(name.as_bytes());
    let mut code = masked(name.as_bytes());
    let mut temp = 0;
    for byte in bytes.iter_mut().take(26) {
        *byte = byte.to_ascii_lowercase();
        if *byte == 0 {
            break;
        }
        if *byte == 32 {
            *byte = 128;
        }
        temp = i32::from(*byte) - 97;
        code ^= mask(temp);
    }
    let serial_text = serial.to_string();
    let digits = serial_text.as_bytes();
    for (index, byte) in digits.iter().enumerate() {
        code = memory_toggle(code, 2 * i32::from(*byte) + index as i32 + 1 - 95);
    }
    if slot == 21 {
        return Ok(if serial_number == 0 {
            code
        } else {
            remainder(code, serial_number)?.wrapping_mul(digits.len() as i32)
        });
    }
    if serial_number == 0 {
        return Err("This input produces a zero Classic divisor.".into());
    }
    let last = i32::from(*digits.last().unwrap());
    let first = remainder(256 + 1024 * digits.len() as i32, 69 + last)?;
    let second = remainder(1024 + 256 * digits.len() as i32, 96 + last)?;
    let factor = i32::from(bytes[0])
        .wrapping_mul(temp)
        .wrapping_mul((i32::from(bytes[2]) - i32::from(bytes[1])).abs());
    let inner = remainder(code, serial_number)?.wrapping_mul(factor);
    Ok(first.wrapping_add(second.wrapping_mul(inner.wrapping_abs())))
}
