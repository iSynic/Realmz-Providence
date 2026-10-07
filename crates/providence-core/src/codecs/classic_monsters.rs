use super::classic_world::certified_monster_extent;
use crate::model::{MonsterDescription, MonsterRecord, MonsterSet, NativeRecordId, StableId};

pub const MONSTER_RECORD_BYTES: usize = 210;
pub const MONSTER_DESCRIPTION_RECORD_BYTES: usize = 256;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedMonsterFile {
    pub records: Vec<MonsterRecord>,
    pub trailing_bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedMonsterDescriptionFile {
    pub records: Vec<MonsterDescription>,
    pub trailing_bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MonsterCodecError {
    DuplicateNativeId(NativeRecordId),
    MissingCompatibilitySource {
        native_path: String,
        native_id: NativeRecordId,
    },
    InvalidShape {
        native_id: NativeRecordId,
        field: &'static str,
        expected: usize,
        actual: usize,
    },
    DescriptionTooLong {
        native_id: NativeRecordId,
        bytes: usize,
    },
    DisplayNameTooLong {
        native_id: NativeRecordId,
        bytes: usize,
    },
}

impl std::fmt::Display for MonsterCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateNativeId(native_id) => {
                write!(formatter, "duplicate monster record id {}", native_id.0)
            }
            Self::MissingCompatibilitySource {
                native_path,
                native_id,
            } => write!(
                formatter,
                "imported monster record {} requires its {native_path} compatibility source",
                native_id.0
            ),
            Self::InvalidShape {
                native_id,
                field,
                expected,
                actual,
            } => write!(
                formatter,
                "monster {} {field} has {actual} values; expected {expected}",
                native_id.0
            ),
            Self::DescriptionTooLong { native_id, bytes } => write!(
                formatter,
                "monster description {} encodes to {bytes} bytes; Classic maximum is 255",
                native_id.0
            ),
            Self::DisplayNameTooLong { native_id, bytes } => write!(
                formatter,
                "monster {} display name encodes to {bytes} bytes; Classic maximum is 40",
                native_id.0
            ),
        }
    }
}

impl std::error::Error for MonsterCodecError {}

pub fn decode_monsters(bytes: &[u8], native_path: &str, set_id: i16) -> DecodedMonsterFile {
    let complete_bytes = certified_monster_extent(bytes, native_path)
        .map(|extent| extent.authored_records * MONSTER_RECORD_BYTES)
        .unwrap_or(bytes.len() / MONSTER_RECORD_BYTES * MONSTER_RECORD_BYTES);
    let records = bytes[..complete_bytes]
        .chunks_exact(MONSTER_RECORD_BYTES)
        .enumerate()
        .map(|(index, row)| decode_monster_row(row, index as u32, set_id))
        .collect();
    let _ = native_path;
    DecodedMonsterFile {
        records,
        trailing_bytes: bytes[complete_bytes..].to_vec(),
    }
}

pub fn decode_monster_set(bytes: &[u8], native_path: &str, set_id: i16) -> MonsterSet {
    MonsterSet {
        set_id,
        native_path: native_path.to_string(),
        monsters: decode_monsters(bytes, native_path, set_id).records,
    }
}

pub fn encode_monster_set(
    set: &MonsterSet,
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, MonsterCodecError> {
    encode_monsters(&set.monsters, &set.native_path, compatibility_source)
}

pub fn encode_monsters(
    records: &[MonsterRecord],
    native_path: &str,
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, MonsterCodecError> {
    let selected = sorted_unique(records)?;
    let source_body_bytes = compatibility_source
        .map(|source| {
            certified_monster_extent(source, native_path)
                .map(|extent| extent.authored_records * MONSTER_RECORD_BYTES)
                .unwrap_or(source.len() / MONSTER_RECORD_BYTES * MONSTER_RECORD_BYTES)
        })
        .unwrap_or(0);
    let required_bytes = selected
        .last()
        .map(|record| (record.native_id.0 as usize + 1) * MONSTER_RECORD_BYTES)
        .unwrap_or(0);
    let mut output = compatibility_source
        .map(|source| source[..source_body_bytes].to_vec())
        .unwrap_or_default();
    output.resize(output.len().max(required_bytes), 0);

    for record in selected {
        let start = record.native_id.0 as usize * MONSTER_RECORD_BYTES;
        let end = start + MONSTER_RECORD_BYTES;
        if !record.authored {
            if end <= source_body_bytes {
                continue;
            }
            return Err(MonsterCodecError::MissingCompatibilitySource {
                native_path: native_path.to_string(),
                native_id: record.native_id,
            });
        }
        if end <= source_body_bytes {
            encode_monster_edit(record, &mut output[start..end])?;
        } else {
            encode_monster_row(record, &mut output[start..end])?;
        }
    }

    if let Some(source) = compatibility_source {
        output.extend_from_slice(&source[source_body_bytes..]);
    }
    Ok(output)
}

pub fn decode_monster_descriptions(bytes: &[u8]) -> DecodedMonsterDescriptionFile {
    let complete_bytes =
        bytes.len() / MONSTER_DESCRIPTION_RECORD_BYTES * MONSTER_DESCRIPTION_RECORD_BYTES;
    let records = bytes[..complete_bytes]
        .chunks_exact(MONSTER_DESCRIPTION_RECORD_BYTES)
        .enumerate()
        .map(|(index, row)| MonsterDescription {
            identity: StableId(format!("monster-description:{index}")),
            native_id: NativeRecordId(index as u32),
            text: decode_pascal_text(row),
            authored: false,
        })
        .collect();
    DecodedMonsterDescriptionFile {
        records,
        trailing_bytes: bytes[complete_bytes..].to_vec(),
    }
}

pub fn encode_monster_descriptions(
    records: &[MonsterDescription],
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, MonsterCodecError> {
    let mut selected = records.iter().collect::<Vec<_>>();
    selected.sort_by_key(|record| record.native_id);
    for pair in selected.windows(2) {
        if pair[0].native_id == pair[1].native_id {
            return Err(MonsterCodecError::DuplicateNativeId(pair[0].native_id));
        }
    }
    let source_body_bytes = compatibility_source
        .map(|source| {
            source.len() / MONSTER_DESCRIPTION_RECORD_BYTES * MONSTER_DESCRIPTION_RECORD_BYTES
        })
        .unwrap_or(0);
    let required_bytes = selected
        .last()
        .map(|record| (record.native_id.0 as usize + 1) * MONSTER_DESCRIPTION_RECORD_BYTES)
        .unwrap_or(0);
    let mut output = compatibility_source
        .map(|source| source[..source_body_bytes].to_vec())
        .unwrap_or_default();
    output.resize(output.len().max(required_bytes), 0);

    for record in selected {
        let start = record.native_id.0 as usize * MONSTER_DESCRIPTION_RECORD_BYTES;
        let end = start + MONSTER_DESCRIPTION_RECORD_BYTES;
        if !record.authored {
            if end <= source_body_bytes {
                continue;
            }
            return Err(MonsterCodecError::MissingCompatibilitySource {
                native_path: "Data DES".into(),
                native_id: record.native_id,
            });
        }
        if end <= source_body_bytes && record.text == decode_pascal_text(&output[start..end]) {
            continue;
        }
        let bytes = encode_classic_text(&record.text);
        if bytes.len() > 255 {
            return Err(MonsterCodecError::DescriptionTooLong {
                native_id: record.native_id,
                bytes: bytes.len(),
            });
        }
        output[start..end].fill(0);
        output[start] = bytes.len() as u8;
        output[start + 1..start + 1 + bytes.len()].copy_from_slice(&bytes);
    }

    if let Some(source) = compatibility_source {
        output.extend_from_slice(&source[source_body_bytes..]);
    }
    Ok(output)
}

fn sorted_unique(records: &[MonsterRecord]) -> Result<Vec<&MonsterRecord>, MonsterCodecError> {
    let mut selected = records.iter().collect::<Vec<_>>();
    selected.sort_by_key(|record| record.native_id);
    for pair in selected.windows(2) {
        if pair[0].native_id == pair[1].native_id {
            return Err(MonsterCodecError::DuplicateNativeId(pair[0].native_id));
        }
    }
    Ok(selected)
}

fn decode_monster_row(row: &[u8], native_id: u32, set_id: i16) -> MonsterRecord {
    let native_id = NativeRecordId(native_id);
    let display_name = decode_fixed_text(&row[170..210]);
    MonsterRecord {
        identity: StableId(format!("monster:{set_id}:{}", native_id.0)),
        native_id,
        hit_dice: row[0],
        stamina_bonus: row[1],
        agility: row[2],
        name_id: row[3],
        movement_max: row[4],
        armor: row[5] as i8,
        magic_resistance: row[6] as i8,
        required_weapon: row[7] as i8,
        traitor: row[8] as i8,
        size: row[9] as i8,
        type_flags: signed(&row[10..18]),
        attack_count: row[18] as i8,
        magic_attack_count: row[19] as i8,
        attacks: (0..5)
            .map(|index| signed(&row[20 + index * 4..24 + index * 4]))
            .collect(),
        damage_bonus: row[40] as i8,
        cast_percent: row[41] as i8,
        run_percent: row[42] as i8,
        surrender_percent: row[43] as i8,
        missile_percent: row[44] as i8,
        can_summon: row[45] as i8,
        saves: signed(&row[46..52]),
        spell_immunities: signed(&row[52..58]),
        money: read_i16s(row, 58, 3),
        spells: read_i16s(row, 64, 10),
        items: read_i16s(row, 84, 6),
        weapon: read_i16(row, 96),
        icon_id: read_i16(row, 98),
        spell_points: read_i16(row, 100),
        experience: read_i16(row, 102),
        stamina: read_i16(row, 104),
        stamina_max: read_i16(row, 106),
        underneath: read_i16s(row, 108, 4),
        target: row[116] as i8,
        guarding: row[117] as i8,
        not_on_menu: row[118] != 0,
        been_attacked: row[119] as i8,
        movement: row[120] as i8,
        magic_to_hit: row[121] as i8,
        conditions: signed(&row[122..162]),
        left_right: row[162] as i8,
        up_down: row[163] as i8,
        attack_number: row[164] as i8,
        bonus_attack: row[165] as i8,
        death_macro: read_i16(row, 166),
        max_spell_points: read_i16(row, 168),
        display_name: if display_name.is_empty() {
            format!("Monster {}", native_id.0)
        } else {
            display_name
        },
        authored: false,
    }
}

fn encode_monster_edit(record: &MonsterRecord, row: &mut [u8]) -> Result<(), MonsterCodecError> {
    let original = decode_monster_row(row, record.native_id.0, 0);
    let mut before = [0; MONSTER_RECORD_BYTES];
    let mut after = [0; MONSTER_RECORD_BYTES];
    encode_monster_row(&original, &mut before)?;
    encode_monster_row(record, &mut after)?;
    // Retain source representations of untouched values, including noncanonical
    // true bytes and name padding. A changed name owns its complete fixed field.
    for index in 0..170 {
        if before[index] != after[index] {
            row[index] = after[index];
        }
    }
    if original.display_name != record.display_name {
        row[170..210].copy_from_slice(&after[170..210]);
    }
    Ok(())
}

fn encode_monster_row(record: &MonsterRecord, row: &mut [u8]) -> Result<(), MonsterCodecError> {
    validate_monster_record_shape(record)?;
    row.fill(0);
    row[0] = record.hit_dice;
    row[1] = record.stamina_bonus;
    row[2] = record.agility;
    row[3] = record.name_id;
    row[4] = record.movement_max;
    row[5] = record.armor as u8;
    row[6] = record.magic_resistance as u8;
    row[7] = record.required_weapon as u8;
    row[8] = record.traitor as u8;
    row[9] = record.size as u8;
    write_i8s(row, 10, &record.type_flags);
    row[18] = record.attack_count as u8;
    row[19] = record.magic_attack_count as u8;
    for (index, attack) in record.attacks.iter().enumerate() {
        write_i8s(row, 20 + index * 4, attack);
    }
    row[40] = record.damage_bonus as u8;
    row[41] = record.cast_percent as u8;
    row[42] = record.run_percent as u8;
    row[43] = record.surrender_percent as u8;
    row[44] = record.missile_percent as u8;
    row[45] = record.can_summon as u8;
    write_i8s(row, 46, &record.saves);
    write_i8s(row, 52, &record.spell_immunities);
    write_i16s(row, 58, &record.money);
    write_i16s(row, 64, &record.spells);
    write_i16s(row, 84, &record.items);
    write_i16(row, 96, record.weapon);
    write_i16(row, 98, record.icon_id);
    write_i16(row, 100, record.spell_points);
    write_i16(row, 102, record.experience);
    write_i16(row, 104, record.stamina);
    write_i16(row, 106, record.stamina_max);
    write_i16s(row, 108, &record.underneath);
    row[116] = record.target as u8;
    row[117] = record.guarding as u8;
    row[118] = u8::from(record.not_on_menu);
    row[119] = record.been_attacked as u8;
    row[120] = record.movement as u8;
    row[121] = record.magic_to_hit as u8;
    write_i8s(row, 122, &record.conditions);
    row[162] = record.left_right as u8;
    row[163] = record.up_down as u8;
    row[164] = record.attack_number as u8;
    row[165] = record.bonus_attack as u8;
    write_i16(row, 166, record.death_macro);
    write_i16(row, 168, record.max_spell_points);
    let name = encode_classic_text(&record.display_name);
    if name.len() > 40 {
        return Err(MonsterCodecError::DisplayNameTooLong {
            native_id: record.native_id,
            bytes: name.len(),
        });
    }
    row[170..170 + name.len()].copy_from_slice(&name);
    Ok(())
}

pub fn validate_monster_record_shape(record: &MonsterRecord) -> Result<(), MonsterCodecError> {
    for (field, actual, expected) in [
        ("type flags", record.type_flags.len(), 8),
        ("attack rows", record.attacks.len(), 5),
        ("saves", record.saves.len(), 6),
        ("spell immunities", record.spell_immunities.len(), 6),
        ("money slots", record.money.len(), 3),
        ("spell slots", record.spells.len(), 10),
        ("item slots", record.items.len(), 6),
        ("underneath slots", record.underneath.len(), 4),
        ("condition fields", record.conditions.len(), 40),
    ] {
        if actual != expected {
            return Err(MonsterCodecError::InvalidShape {
                native_id: record.native_id,
                field,
                expected,
                actual,
            });
        }
    }
    if let Some(actual) = record
        .attacks
        .iter()
        .map(Vec::len)
        .find(|length| *length != 4)
    {
        return Err(MonsterCodecError::InvalidShape {
            native_id: record.native_id,
            field: "attack row",
            expected: 4,
            actual,
        });
    }
    Ok(())
}

fn read_i16(row: &[u8], offset: usize) -> i16 {
    i16::from_be_bytes([row[offset], row[offset + 1]])
}
fn read_i16s(row: &[u8], offset: usize, count: usize) -> Vec<i16> {
    (0..count)
        .map(|index| read_i16(row, offset + index * 2))
        .collect()
}
fn write_i16(row: &mut [u8], offset: usize, value: i16) {
    row[offset..offset + 2].copy_from_slice(&value.to_be_bytes());
}
fn write_i16s(row: &mut [u8], offset: usize, values: &[i16]) {
    for (index, value) in values.iter().enumerate() {
        write_i16(row, offset + index * 2, *value);
    }
}
fn signed(bytes: &[u8]) -> Vec<i8> {
    bytes.iter().map(|byte| *byte as i8).collect()
}
fn write_i8s(row: &mut [u8], offset: usize, values: &[i8]) {
    for (index, value) in values.iter().enumerate() {
        row[offset + index] = *value as u8;
    }
}
fn decode_fixed_text(bytes: &[u8]) -> String {
    bytes
        .iter()
        .take_while(|byte| **byte != 0)
        .map(|byte| {
            if (32..=126).contains(byte) {
                *byte as char
            } else {
                ' '
            }
        })
        .collect::<String>()
        .trim_end()
        .to_string()
}
fn decode_pascal_text(row: &[u8]) -> String {
    let end = (row.first().copied().unwrap_or(0) as usize + 1).min(row.len());
    decode_fixed_text(row.get(1..end).unwrap_or_default())
}
fn encode_classic_text(value: &str) -> Vec<u8> {
    value
        .chars()
        .map(|character| {
            if character.is_ascii() {
                character as u8
            } else {
                b'?'
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record() -> MonsterRecord {
        let mut record = decode_monsters(&vec![0; MONSTER_RECORD_BYTES], "Data MD", 0)
            .records
            .remove(0);
        record.authored = true;
        record.display_name = "Drowned Captain".into();
        record.hit_dice = 9;
        record.stamina_bonus = 200;
        record.agility = 17;
        record.name_id = 6;
        record.movement_max = 14;
        record.armor = -4;
        record.magic_resistance = -3;
        record.required_weapon = -2;
        record.traitor = -1;
        record.size = 4;
        record.type_flags = vec![1, -1, 2, -2, 3, -3, 4, -4];
        record.attack_count = 2;
        record.magic_attack_count = 1;
        record.attacks = vec![
            vec![1, 2, 3, 4],
            vec![-1, -2, -3, -4],
            vec![0; 4],
            vec![0; 4],
            vec![0; 4],
        ];
        record.money = vec![100, 200, 300];
        record.spells = (10..20).collect();
        record.items = (20..26).collect();
        record.damage_bonus = -5;
        record.cast_percent = 33;
        record.run_percent = 44;
        record.surrender_percent = 55;
        record.missile_percent = 66;
        record.can_summon = 1;
        record.saves = vec![1, 2, 3, 4, 5, 6];
        record.spell_immunities = vec![-1, -2, -3, -4, -5, -6];
        record.weapon = 26;
        record.icon_id = -27;
        record.spell_points = 28;
        record.experience = 29;
        record.stamina = 30;
        record.stamina_max = 31;
        record.underneath = vec![32, 33, 34, 35];
        record.target = -7;
        record.guarding = -8;
        record.not_on_menu = true;
        record.been_attacked = -9;
        record.movement = -10;
        record.magic_to_hit = -11;
        record.conditions = (0..40)
            .map(|index| if index % 2 == 0 { index } else { -index })
            .collect();
        record.left_right = -12;
        record.up_down = -13;
        record.attack_number = -14;
        record.bonus_attack = -15;
        record.death_macro = -16;
        record.max_spell_points = 37;
        record
    }

    #[test]
    fn semantic_record_round_trip_covers_every_owned_field() {
        let expected = record();
        let encoded = encode_monsters(std::slice::from_ref(&expected), "Data MD", None).unwrap();
        let mut decoded = decode_monsters(&encoded, "Data MD", 0).records.remove(0);
        decoded.authored = true;
        assert_eq!(decoded, expected);
    }

    #[test]
    fn no_edit_round_trip_preserves_rows_and_malformed_tail() {
        let mut source = encode_monsters(&[record()], "Data MD", None).unwrap();
        source.extend_from_slice(&[0xde, 0xad]);
        let decoded = decode_monster_set(&source, "Data MD", 0);
        assert_eq!(encode_monster_set(&decoded, Some(&source)).unwrap(), source);
    }

    #[test]
    fn edited_record_regenerates_only_its_fully_owned_row() {
        let first = record();
        let mut second = record();
        second.native_id = NativeRecordId(1);
        second.identity = StableId("monster:0:1".into());
        let source = encode_monsters(&[first, second], "Data MD", None).unwrap();
        let mut decoded = decode_monster_set(&source, "Data MD", 0);
        decoded.monsters[1].authored = true;
        decoded.monsters[1].hit_dice = 12;
        let output = encode_monster_set(&decoded, Some(&source)).unwrap();
        assert_eq!(
            &output[..MONSTER_RECORD_BYTES],
            &source[..MONSTER_RECORD_BYTES]
        );
        assert_eq!(output[MONSTER_RECORD_BYTES], 12);
    }

    #[test]
    fn description_is_deterministic_pascal_text_and_preserves_tail() {
        let record = MonsterDescription {
            identity: StableId("monster-description:3".into()),
            native_id: NativeRecordId(3),
            text: "Sea-worn sentinel".into(),
            authored: true,
        };
        let encoded = encode_monster_descriptions(&[record], None).unwrap();
        assert_eq!(encoded.len(), 4 * MONSTER_DESCRIPTION_RECORD_BYTES);
        assert_eq!(encoded[3 * 256], 17);
        let mut source = encoded.clone();
        source.push(0xa5);
        let decoded = decode_monster_descriptions(&source);
        assert_eq!(decoded.records[3].text, "Sea-worn sentinel");
        assert_eq!(
            encode_monster_descriptions(&decoded.records, Some(&source)).unwrap(),
            source
        );
    }
}
