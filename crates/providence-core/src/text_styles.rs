//! Classic styl has a big-endian count followed by 20-byte TextEdit style runs.
//! Edits own offsets and selected font/size/face/color fields. Metrics, padding,
//! unknown face bits, and trailing bytes survive changes to other attributes.
use serde::{Deserialize, Serialize};
mod editing;
#[cfg(test)]
mod tests;

pub const MAX_STYLE_RUNS: usize = 4096;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleRun {
    pub start: u32,
    pub height: i16,
    pub ascent: i16,
    pub font: i16,
    pub face: u8,
    pub padding: u8,
    pub size: i16,
    pub color: [u16; 3],
}

impl Default for StyleRun {
    fn default() -> Self {
        Self {
            start: 0,
            height: 12,
            ascent: 9,
            font: 0,
            face: 0,
            padding: 0,
            size: 12,
            color: [0; 3],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StyleTable {
    pub runs: Vec<StyleRun>,
    trailing: Vec<u8>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StylePatch {
    pub font: Option<i16>,
    pub size: Option<i16>,
    pub bold: Option<bool>,
    pub italic: Option<bool>,
    pub underline: Option<bool>,
    pub color: Option<[u16; 3]>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum TextStyleEdit {
    ReplaceText {
        start: usize,
        removed: usize,
        text: String,
    },
    Format {
        start: usize,
        end: usize,
        patch: StylePatch,
    },
    AddRange {
        start: usize,
    },
    RemoveRange {
        start: usize,
    },
}

impl StyleTable {
    pub fn decode(bytes: &[u8], text_length: usize) -> Result<Self, String> {
        if bytes.len() < 2 {
            return Err(
                "Imported formatting has no complete style count. Its bytes are retained.".into(),
            );
        }
        let count = u16::from_be_bytes([bytes[0], bytes[1]]) as usize;
        if count > MAX_STYLE_RUNS || bytes.len() < 2 + count * 20 {
            return Err("Imported formatting is incomplete or exceeds the editable range bound. Its bytes are retained.".into());
        }
        let mut runs = Vec::with_capacity(count);
        for chunk in bytes[2..2 + count * 20].chunks_exact(20) {
            let signed = i32::from_be_bytes(chunk[..4].try_into().unwrap());
            if signed < 0 {
                return Err(
                    "Imported formatting has a negative character offset. Its bytes are retained."
                        .into(),
                );
            }
            let i16_at = |offset| i16::from_be_bytes([chunk[offset], chunk[offset + 1]]);
            let u16_at = |offset| u16::from_be_bytes([chunk[offset], chunk[offset + 1]]);
            runs.push(StyleRun {
                start: signed as u32,
                height: i16_at(4),
                ascent: i16_at(6),
                font: i16_at(8),
                face: chunk[10],
                padding: chunk[11],
                size: i16_at(12),
                color: [u16_at(14), u16_at(16), u16_at(18)],
            });
        }
        let table = Self {
            runs,
            trailing: bytes[2 + count * 20..].to_vec(),
        };
        table.validate(text_length)?;
        Ok(table)
    }

    pub fn plain() -> Self {
        Self {
            runs: vec![StyleRun::default()],
            trailing: Vec::new(),
        }
    }

    pub fn validate(&self, text_length: usize) -> Result<(), String> {
        if self.runs.len() > MAX_STYLE_RUNS
            || self.runs.first().is_some_and(|run| run.start != 0)
            || self.runs.iter().any(|run| run.start as usize > text_length)
            || self
                .runs
                .windows(2)
                .any(|pair| pair[0].start >= pair[1].start)
        {
            return Err("Formatting ranges must start at zero, stay within the text and have distinct increasing offsets. Imported bytes are retained.".into());
        }
        Ok(())
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut bytes = (self.runs.len() as u16).to_be_bytes().to_vec();
        for run in &self.runs {
            bytes.extend_from_slice(&(run.start as i32).to_be_bytes());
            for value in [run.height, run.ascent, run.font] {
                bytes.extend_from_slice(&value.to_be_bytes());
            }
            bytes.extend_from_slice(&[run.face, run.padding]);
            bytes.extend_from_slice(&run.size.to_be_bytes());
            for value in run.color {
                bytes.extend_from_slice(&value.to_be_bytes());
            }
        }
        bytes.extend_from_slice(&self.trailing);
        bytes
    }

    pub fn active_at(&self, start: usize) -> StyleRun {
        self.runs
            .iter()
            .rev()
            .find(|run| run.start as usize <= start)
            .cloned()
            .unwrap_or_default()
    }
}

pub fn font_name(font: i16) -> Option<&'static str> {
    Some(match font {
        0 => "Default",
        1 => "Application / Geneva",
        3 => "Geneva",
        4 => "Monaco",
        16 => "Palatino",
        20 => "Times",
        21 => "Helvetica",
        22 => "Courier",
        23 => "Symbol",
        1602 => "Black Chancery",
        2004 => "Sand",
        _ => return None,
    })
}

pub fn prepare_text_style_draft(
    original: &str,
    style: Option<&[u8]>,
    edits: &[TextStyleEdit],
) -> Result<(String, Option<StyleTable>), String> {
    if edits.len() > 4096 {
        return Err(
            "This text draft has too many individual edits. Apply it before continuing.".into(),
        );
    }
    let mut text = original.to_string();
    let mut table = style
        .map(|bytes| StyleTable::decode(bytes, text.chars().count()))
        .transpose()?;
    for edit in edits {
        match edit {
            TextStyleEdit::ReplaceText {
                start,
                removed,
                text: inserted,
            } => {
                editing::replace_draft_text(&mut text, table.as_mut(), *start, *removed, inserted)?;
            }
            TextStyleEdit::Format { start, end, patch } => table
                .get_or_insert_with(StyleTable::plain)
                .format(*start, *end, patch, text.chars().count())?,
            TextStyleEdit::AddRange { start } => table
                .get_or_insert_with(StyleTable::plain)
                .add_range(*start, text.chars().count())?,
            TextStyleEdit::RemoveRange { start } => {
                table
                    .as_mut()
                    .ok_or("This text has no formatting range to remove.")?
                    .remove_range(*start)?;
            }
        }
        if let Some(table) = &table {
            table.validate(text.chars().count())?;
        }
        if text.len() > original.len().max(1024 * 1024) {
            return Err("Scrolling text edits support up to 1 MiB; larger imports may be preserved or shortened.".into());
        }
    }
    crate::codecs::encode_classic_text_payload(&text).map_err(|error| error.to_string())?;
    Ok((text, table))
}

/// Classic export accepts authored visible fields and offsets only when the
/// original metrics, padding, unknown face bits, and trailing bytes survive.
pub fn verify_preserved_style_fields(original: &[u8], edited: &[u8]) -> Result<(), String> {
    let original = StyleTable::decode(original, i32::MAX as usize)?;
    let edited = StyleTable::decode(edited, i32::MAX as usize)?;
    if original.trailing != edited.trailing {
        return Err("Imported formatting trailing bytes changed.".into());
    }
    let unowned = |run: &StyleRun| (run.height, run.ascent, run.padding, run.face & !7);
    if edited.runs.iter().any(|run| {
        !original
            .runs
            .iter()
            .any(|source| unowned(source) == unowned(run))
    }) {
        return Err(
            "Imported formatting metrics, padding, or unsupported attributes changed.".into(),
        );
    }
    Ok(())
}
