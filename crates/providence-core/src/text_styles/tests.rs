use super::*;

fn imported() -> StyleTable {
    StyleTable {
        runs: vec![
            StyleRun {
                font: 32000,
                face: 0x81,
                padding: 0x5a,
                height: 22,
                ascent: 17,
                size: 18,
                color: [0x1234, 0x2345, 0x3456],
                ..StyleRun::default()
            },
            StyleRun {
                start: 5,
                font: 3,
                size: 14,
                color: [0x4567, 0x5678, 0x6789],
                ..StyleRun::default()
            },
        ],
        trailing: vec![0xde, 0xad, 0xbe, 0xef],
    }
}

#[test]
fn unchanged_tables_and_unowned_attributes_survive_selected_field_edits() {
    let table = imported();
    let bytes = table.encode();
    assert_eq!(StyleTable::decode(&bytes, 10).unwrap().encode(), bytes);
    let edits = [TextStyleEdit::Format {
        start: 1,
        end: 3,
        patch: StylePatch {
            italic: Some(true),
            ..Default::default()
        },
    }];
    let (_, styled) = prepare_text_style_draft("abcdefghij", Some(&bytes), &edits).unwrap();
    let styled = styled.unwrap();
    assert_eq!(styled.trailing, table.trailing);
    let active = styled.active_at(1);
    assert_eq!(
        (
            active.font,
            active.padding,
            active.height,
            active.ascent,
            active.color
        ),
        (32000, 0x5a, 22, 17, [0x1234, 0x2345, 0x3456])
    );
    assert_eq!(active.face, 0x83);
    assert_eq!(styled.active_at(3).face, 0x81);
    assert_eq!(styled.runs.last(), table.runs.last());
}

#[test]
fn sequential_text_edits_rebase_ranges_without_normalizing_imported_attributes() {
    let bytes = imported().encode();
    let edits = [
        TextStyleEdit::ReplaceText {
            start: 2,
            removed: 1,
            text: "éé".into(),
        },
        TextStyleEdit::ReplaceText {
            start: 0,
            removed: 1,
            text: "".into(),
        },
    ];
    let (text, styled) = prepare_text_style_draft("abcdefghij", Some(&bytes), &edits).unwrap();
    assert_eq!(text, "béédefghij");
    let styled = styled.unwrap();
    assert_eq!(styled.runs.last().unwrap().start, 5);
    assert_eq!(styled.runs.last().unwrap().color, [0x4567, 0x5678, 0x6789]);
    assert_eq!(styled.trailing, [0xde, 0xad, 0xbe, 0xef]);
}

#[test]
fn plain_text_has_no_companion_until_formatting_is_explicitly_selected() {
    assert!(
        prepare_text_style_draft("plain", None, &[])
            .unwrap()
            .1
            .is_none()
    );
    let (_, style) = prepare_text_style_draft(
        "plain",
        None,
        &[TextStyleEdit::Format {
            start: 0,
            end: 2,
            patch: StylePatch {
                bold: Some(true),
                ..Default::default()
            },
        }],
    )
    .unwrap();
    let mut style = style.unwrap();
    assert_eq!(style.runs.len(), 2);
    style.remove_range(2).unwrap();
    assert_eq!(style.runs.len(), 1);
    let mut unknown = imported();
    assert!(unknown.remove_range(0).is_err());
    assert_eq!(unknown, imported());
}

#[test]
fn malformed_ranges_and_unrepresentable_insertions_cannot_be_authored() {
    for bytes in [vec![0], vec![0, 1, 0], {
        let mut bytes = imported().encode();
        bytes[2..6].copy_from_slice(&(-1i32).to_be_bytes());
        bytes
    }] {
        assert!(StyleTable::decode(&bytes, 10).is_err());
    }
    assert!(
        prepare_text_style_draft(
            "plain",
            None,
            &[TextStyleEdit::ReplaceText {
                start: 0,
                removed: 1,
                text: "🐉".into()
            }]
        )
        .is_err()
    );
    let bytes = imported().encode();
    assert_eq!(
        prepare_text_style_draft("abcdefghij", Some(&bytes), &[])
            .unwrap()
            .1
            .unwrap()
            .encode(),
        bytes
    );
}

#[test]
fn classic_export_rejects_changes_to_unowned_style_fields_and_tail() {
    let original = StyleTable::plain().encode();
    let mut visible = original.clone();
    visible[12] = 5;
    super::verify_preserved_style_fields(&original, &visible).unwrap();
    for offset in [6, 8, 13] {
        let mut edited = original.clone();
        edited[offset] ^= 0x40;
        assert!(super::verify_preserved_style_fields(&original, &edited).is_err());
    }
    let mut tail = original.clone();
    tail.push(3);
    assert!(super::verify_preserved_style_fields(&original, &tail).is_err());
}

#[test]
fn appending_text_keeps_existing_formatting_bytes_without_a_redundant_boundary() {
    let bytes = imported().encode();
    let (text, style) = prepare_text_style_draft(
        "abcdefghij",
        Some(&bytes),
        &[TextStyleEdit::ReplaceText {
            start: 10,
            removed: 0,
            text: "é".into(),
        }],
    )
    .unwrap();
    assert_eq!(text, "abcdefghijé");
    assert_eq!(style.unwrap().encode(), bytes);
}

#[test]
fn final_text_validation_allows_repair_and_reports_absolute_character_positions() {
    let bytes = imported().encode();
    for style in [None, Some(bytes.as_slice())] {
        let insert = TextStyleEdit::ReplaceText {
            start: 10,
            removed: 0,
            text: "🐉".into(),
        };
        let error = prepare_text_style_draft("abcdefghij", style, std::slice::from_ref(&insert))
            .unwrap_err();
        assert!(
            error.contains("at character index 10 is not representable"),
            "{error}"
        );
        for replacement in ["", "é"] {
            let edits = [
                insert.clone(),
                TextStyleEdit::ReplaceText {
                    start: 10,
                    removed: 1,
                    text: replacement.into(),
                },
            ];
            let (text, _) = prepare_text_style_draft("abcdefghij", style, &edits).unwrap();
            assert_eq!(text, format!("abcdefghij{replacement}"));
        }
    }
}
