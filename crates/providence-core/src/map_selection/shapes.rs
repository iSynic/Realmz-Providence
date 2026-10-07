use super::{MapSelectionRequest, SelectionShape};
use crate::model::MapCoordinate;

pub(super) fn geometry(request: &MapSelectionRequest) -> Vec<MapCoordinate> {
    if request.shape == SelectionShape::Freehand {
        let cells = freehand(&request.path);
        return if request.filled {
            super::enclosure::fill(&cells)
        } else {
            cells
        };
    }
    if request.shape == SelectionShape::Cell {
        return vec![request.start];
    }
    if request.shape == SelectionShape::Line {
        return line(&request.start, &request.end);
    }
    let left = request.start.x.min(request.end.x);
    let right = request.start.x.max(request.end.x);
    let top = request.start.y.min(request.end.y);
    let bottom = request.start.y.max(request.end.y);
    if request.shape == SelectionShape::Ellipse && (left == right || top == bottom) {
        return line(
            &MapCoordinate { x: left, y: top },
            &MapCoordinate {
                x: right,
                y: bottom,
            },
        );
    }
    let mut cells = Vec::new();
    for y in top..=bottom {
        for x in left..=right {
            let included = if request.shape == SelectionShape::Rectangle {
                request.filled || x == left || x == right || y == top || y == bottom
            } else {
                let inside = |px, py| ellipse(px, py, left, right, top, bottom);
                inside(i32::from(x), i32::from(y))
                    && (request.filled
                        || [(0, -1), (1, 0), (0, 1), (-1, 0)]
                            .iter()
                            .any(|(dx, dy)| !inside(i32::from(x) + dx, i32::from(y) + dy)))
            };
            if included {
                cells.push(MapCoordinate { x, y });
            }
        }
    }
    cells
}

fn freehand(path: &[MapCoordinate]) -> Vec<MapCoordinate> {
    if path.len() == 1 {
        return path.to_vec();
    }
    let mut cells = std::collections::BTreeSet::new();
    for pair in path.windows(2) {
        for cell in line(&pair[0], &pair[1]) {
            cells.insert((cell.y, cell.x));
        }
    }
    cells
        .into_iter()
        .map(|(y, x)| MapCoordinate { x, y })
        .collect()
}

fn line(start: &MapCoordinate, end: &MapCoordinate) -> Vec<MapCoordinate> {
    let (mut x, mut y) = (i32::from(start.x), i32::from(start.y));
    let (dx, dy) = ((i32::from(end.x) - x).abs(), (i32::from(end.y) - y).abs());
    let (sx, sy) = (
        (i32::from(end.x) - x).signum(),
        (i32::from(end.y) - y).signum(),
    );
    let (mut moved_x, mut moved_y) = (0, 0);
    let mut cells = vec![*start];
    while moved_x < dx || moved_y < dy {
        if moved_x < dx && (moved_y == dy || (2 * moved_x + 1) * dy < (2 * moved_y + 1) * dx) {
            x += sx;
            moved_x += 1;
        } else {
            y += sy;
            moved_y += 1;
        }
        cells.push(MapCoordinate {
            x: x as u8,
            y: y as u8,
        });
    }
    cells
}

fn ellipse(x: i32, y: i32, left: u8, right: u8, top: u8, bottom: u8) -> bool {
    let width = i64::from(right - left + 1);
    let height = i64::from(bottom - top + 1);
    let px = i64::from(2 * (x - i32::from(left)) + 1) - width;
    let py = i64::from(2 * (y - i32::from(top)) + 1) - height;
    px * px * height * height + py * py * width * width <= width * width * height * height
}
