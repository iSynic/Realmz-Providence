use crate::model::{NativeRecordId, StableId};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextOccurrence {
    pub identity: StableId,
    pub native_id: NativeRecordId,
    pub character_index: usize,
    pub character_length: usize,
    pub line: usize,
    pub column: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextOccurrenceSearch {
    pub total: usize,
    pub next: Option<TextOccurrence>,
    pub wrapped: bool,
}

pub fn find_text_occurrence<'a>(
    records: impl Iterator<Item = (&'a StableId, NativeRecordId, &'a str)>,
    query: &str,
    after: Option<(u64, u64)>,
) -> TextOccurrenceSearch {
    let needle = query.to_lowercase().chars().collect::<Vec<_>>();
    let mut result = TextOccurrenceSearch {
        total: 0,
        next: None,
        wrapped: false,
    };
    if needle.is_empty() {
        return result;
    }
    let (mut first, mut next): (Option<TextOccurrence>, Option<TextOccurrence>) = (None, None);
    for (identity, native_id, text) in records {
        let characters = text.chars().collect::<Vec<_>>();
        let lowered = lowercase_with_indices(&characters);
        let mut cursor = 0;
        while cursor + needle.len() <= lowered.len() {
            if lowered[cursor..cursor + needle.len()]
                .iter()
                .map(|pair| pair.0)
                .eq(needle.iter().copied())
            {
                let start = lowered[cursor].1;
                let end = lowered[cursor + needle.len() - 1].1 + 1;
                result.total += 1;
                let key = (u64::from(native_id.0), start as u64);
                let is_first = first.as_ref().is_none_or(|item| {
                    key < (u64::from(item.native_id.0), item.character_index as u64)
                });
                let is_next = after.is_none_or(|after| key > after)
                    && next.as_ref().is_none_or(|item| {
                        key < (u64::from(item.native_id.0), item.character_index as u64)
                    });
                if is_first || is_next {
                    let occurrence = occurrence_at(identity, native_id, &characters, start, end);
                    if is_first {
                        first = Some(occurrence.clone());
                    }
                    if is_next {
                        next = Some(occurrence);
                    }
                }
                cursor += needle.len();
            } else {
                cursor += 1;
            }
        }
    }
    result.wrapped = after.is_some() && next.is_none() && first.is_some();
    result.next = next.or(first);
    result
}

fn lowercase_with_indices(characters: &[char]) -> Vec<(char, usize)> {
    characters
        .iter()
        .enumerate()
        .flat_map(|(index, character)| character.to_lowercase().map(move |lower| (lower, index)))
        .collect()
}

fn occurrence_at(
    identity: &StableId,
    native_id: NativeRecordId,
    characters: &[char],
    start: usize,
    end: usize,
) -> TextOccurrence {
    let prefix = &characters[..start];
    TextOccurrence {
        identity: identity.clone(),
        native_id,
        character_index: start,
        character_length: end - start,
        line: prefix
            .iter()
            .filter(|character| **character == '\n')
            .count()
            + 1,
        column: start
            - prefix
                .iter()
                .rposition(|character| *character == '\n')
                .map_or(0, |index| index + 1)
            + 1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn case_insensitive_search_keeps_original_unicode_character_positions_and_native_order() {
        let first = StableId("message:9".into());
        let second = StableId("message:2".into());
        let records = [
            (&first, NativeRecordId(9), "GUARD guard"),
            (&second, NativeRecordId(2), "é\nGuard"),
        ];
        let matches = find_text_occurrence(records.into_iter(), "guard", None);
        assert_eq!(matches.total, 3);
        let selected = matches.next.unwrap();
        assert_eq!(selected.native_id, NativeRecordId(2));
        assert_eq!(
            (selected.character_index, selected.line, selected.column),
            (2, 2, 1)
        );
        let last = find_text_occurrence(records.into_iter(), "guard", Some((9, 0)))
            .next
            .unwrap();
        assert_eq!(last.character_index, 6);
        assert!(find_text_occurrence(records.into_iter(), "guard", Some((9, 6))).wrapped);
        let expanded =
            find_text_occurrence([(&first, NativeRecordId(9), "İx")].into_iter(), "x", None)
                .next
                .unwrap();
        assert_eq!(expanded.character_index, 1);
        assert_eq!(expanded.column, 2);
    }
}
