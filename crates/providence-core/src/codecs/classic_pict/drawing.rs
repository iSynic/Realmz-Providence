use super::geometry::{BitmapCommand, Rect};

pub(super) fn draw_bitmap(
    canvas: &mut [u8],
    canvas_width: usize,
    canvas_height: usize,
    frame: Rect,
    command: &BitmapCommand,
) {
    let Some(source_width) = command.source.width() else {
        return;
    };
    let Some(source_height) = command.source.height() else {
        return;
    };
    let Some(destination_width) = command.destination.width() else {
        return;
    };
    let Some(destination_height) = command.destination.height() else {
        return;
    };
    let Some(bitmap_width) = command.bounds.width() else {
        return;
    };
    let Some(bitmap_height) = command.bounds.height() else {
        return;
    };
    for y in 0..destination_height {
        let canvas_y = i32::from(command.destination.top) - i32::from(frame.top) + y as i32;
        if canvas_y < 0 || canvas_y >= canvas_height as i32 {
            continue;
        }
        let source_y = i32::from(command.source.top) - i32::from(command.bounds.top)
            + (y * source_height / destination_height) as i32;
        if source_y < 0 || source_y >= bitmap_height as i32 {
            continue;
        }
        for x in 0..destination_width {
            let canvas_x = i32::from(command.destination.left) - i32::from(frame.left) + x as i32;
            if canvas_x < 0 || canvas_x >= canvas_width as i32 {
                continue;
            }
            let source_x = i32::from(command.source.left) - i32::from(command.bounds.left)
                + (x * source_width / destination_width) as i32;
            if source_x < 0 || source_x >= bitmap_width as i32 {
                continue;
            }
            let source = (source_y as usize * bitmap_width + source_x as usize) * 4;
            let destination = (canvas_y as usize * canvas_width + canvas_x as usize) * 4;
            canvas[destination..destination + 4].copy_from_slice(&command.rgba[source..source + 4]);
        }
    }
}
