use crate::error::{ProvidenceError, Result};
use crate::project::LandLayout;
use crate::realmz::record_bytes::{i16_be, provenance, write_i16_be};

pub const LAND_LAYOUT_ROWS: usize = 8;
pub const LAND_LAYOUT_COLS: usize = 16;
pub const LAND_LAYOUT_BYTES: usize = LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS * 2;

pub fn parse_land_layout(buffer: &[u8]) -> Result<LandLayout> {
    if buffer.len() < LAND_LAYOUT_BYTES {
        return Err(ProvidenceError::message(format!(
            "Layout is {} byte(s); expected at least {} bytes",
            buffer.len(),
            LAND_LAYOUT_BYTES
        )));
    }
    let cells = (0..LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS)
        .map(|index| i16_be(buffer, index * 2))
        .collect();
    Ok(LandLayout {
        rows: LAND_LAYOUT_ROWS,
        cols: LAND_LAYOUT_COLS,
        cells,
        authored: false,
        provenance: Some(provenance("Layout", 0, 0, LAND_LAYOUT_BYTES)),
    })
}

pub fn write_land_layout(layout: &LandLayout) -> Result<Vec<u8>> {
    if layout.rows != LAND_LAYOUT_ROWS || layout.cols != LAND_LAYOUT_COLS {
        return Err(ProvidenceError::message(format!(
            "Layout must be {} rows by {} columns",
            LAND_LAYOUT_ROWS, LAND_LAYOUT_COLS
        )));
    }
    let expected_cells = LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS;
    if layout.cells.len() != expected_cells {
        return Err(ProvidenceError::message(format!(
            "Layout must contain exactly {expected_cells} cells; found {}",
            layout.cells.len()
        )));
    }
    let mut output = vec![0u8; LAND_LAYOUT_BYTES];
    for (index, value) in layout.cells.iter().enumerate() {
        write_i16_be(&mut output, index * 2, *value);
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_only_the_semantic_grid() {
        let mut input = vec![0u8; LAND_LAYOUT_BYTES + 4];
        write_i16_be(&mut input, 0, -1);
        write_i16_be(&mut input, 2, 1);
        write_i16_be(&mut input, LAND_LAYOUT_BYTES - 2, 19);
        input[LAND_LAYOUT_BYTES..].copy_from_slice(&[9, 8, 7, 6]);

        let layout = parse_land_layout(&input).unwrap();

        assert_eq!(layout.rows, LAND_LAYOUT_ROWS);
        assert_eq!(layout.cols, LAND_LAYOUT_COLS);
        assert_eq!(layout.cells[0], -1);
        assert_eq!(layout.cells[1], 1);
        assert_eq!(layout.cells[LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS - 1], 19);
    }

    #[test]
    fn compiles_exact_semantic_grid_without_embedded_compatibility_bytes() {
        let mut layout = parse_land_layout(&vec![0xa5; LAND_LAYOUT_BYTES + 256]).unwrap();
        layout.cells[0] = -1;
        layout.cells[LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS - 1] = 202;

        let output = write_land_layout(&layout).unwrap();

        assert_eq!(output.len(), LAND_LAYOUT_BYTES);
        assert_eq!(i16_be(&output, 0), -1);
        assert_eq!(i16_be(&output, LAND_LAYOUT_BYTES - 2), 202);
    }

    #[test]
    fn legacy_project_json_drops_embedded_tail_bytes() {
        let layout: LandLayout = serde_json::from_value(serde_json::json!({
            "rows": LAND_LAYOUT_ROWS,
            "cols": LAND_LAYOUT_COLS,
            "cells": vec![0; LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS],
            "trailingBytes": [222, 173, 190, 239],
            "authored": false,
            "provenance": null
        }))
        .unwrap();

        let serialized = serde_json::to_value(layout).unwrap();

        assert!(serialized.get("trailingBytes").is_none());
    }

    #[test]
    fn rejects_noncanonical_grid_shapes() {
        let mut layout = parse_land_layout(&vec![0; LAND_LAYOUT_BYTES]).unwrap();
        layout.cells.pop();
        assert!(write_land_layout(&layout)
            .unwrap_err()
            .to_string()
            .contains("exactly 128 cells"));

        layout.cells.push(0);
        layout.rows = 16;
        layout.cols = 8;
        assert!(write_land_layout(&layout)
            .unwrap_err()
            .to_string()
            .contains("8 rows by 16 columns"));
    }
}
