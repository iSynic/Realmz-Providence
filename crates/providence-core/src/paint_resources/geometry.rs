//! Pure geometry plans for project-local palette and stamp drafts.
use super::{PaintResource, PaintResourceCell, PaintResourceKind};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
pub enum GeometryEdit {
    Resize { width: u8, height: u8, fill: i16 },
    SetCell { x: u8, y: u8, tile: i16 },
    RemoveCell { x: u8, y: u8 },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeometryPreview {
    pub resource: PaintResource,
    pub removed: Vec<PaintResourceCell>,
    pub added: usize,
}

pub fn preview(resource: &PaintResource, edit: GeometryEdit) -> Result<GeometryPreview, String> {
    resource.validate()?;
    let mut result = GeometryPreview {
        resource: resource.clone(),
        removed: vec![],
        added: 0,
    };
    match edit {
        GeometryEdit::Resize {
            width,
            height,
            fill,
        } => resize(&mut result, width, height, fill)?,
        GeometryEdit::SetCell { x, y, tile } => {
            if x >= resource.width || y >= resource.height {
                return Err("The cell must be inside the resource dimensions.".into());
            }
            if let Some(cell) = result
                .resource
                .cells
                .iter_mut()
                .find(|cell| cell.x == x && cell.y == y)
            {
                cell.tile = tile;
            } else {
                result.resource.cells.push(PaintResourceCell { x, y, tile });
                result.added = 1;
            }
        }
        GeometryEdit::RemoveCell { x, y } => {
            if resource.kind != PaintResourceKind::Stamp {
                return Err("A palette requires every cell. Only stamps can contain holes.".into());
            }
            result.removed = resource
                .cells
                .iter()
                .filter(|cell| cell.x == x && cell.y == y)
                .cloned()
                .collect();
            result
                .resource
                .cells
                .retain(|cell| cell.x != x || cell.y != y);
        }
    }
    result.resource.cells.sort_by_key(|cell| (cell.y, cell.x));
    result.resource.validate()?;
    if result.resource == *resource {
        return Err("There are no geometry changes to review.".into());
    }
    Ok(result)
}

fn resize(result: &mut GeometryPreview, width: u8, height: u8, fill: i16) -> Result<(), String> {
    if !(1..=32).contains(&width) || !(1..=32).contains(&height) {
        return Err("Resource dimensions must be between 1 and 32.".into());
    }
    result.resource.width = width;
    result.resource.height = height;
    result.removed = result
        .resource
        .cells
        .iter()
        .filter(|cell| cell.x >= width || cell.y >= height)
        .cloned()
        .collect();
    result
        .resource
        .cells
        .retain(|cell| cell.x < width && cell.y < height);
    if result.resource.kind == PaintResourceKind::Palette {
        for y in 0..height {
            for x in 0..width {
                if !result
                    .resource
                    .cells
                    .iter()
                    .any(|cell| cell.x == x && cell.y == y)
                {
                    result
                        .resource
                        .cells
                        .push(PaintResourceCell { x, y, tile: fill });
                    result.added += 1;
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;
