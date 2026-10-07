use super::*;

pub(super) fn encode(indices: &[u8], palette: &[[u8; 3]], width: u32, height: u32) -> Vec<u8> {
    let row_bytes = width as usize;
    let mut pict = header(width, height);
    push_u16(&mut pict, 0);
    push_u16(&mut pict, palette.len().saturating_sub(1));
    for (index, color) in palette.iter().enumerate() {
        push_u16(&mut pict, index);
        push_u16(&mut pict, usize::from(color[0]) * 257);
        push_u16(&mut pict, usize::from(color[1]) * 257);
        push_u16(&mut pict, usize::from(color[2]) * 257);
    }
    push_rect(&mut pict, 0, 0, height as i16, width as i16);
    push_rect(&mut pict, 0, 0, height as i16, width as i16);
    push_u16(&mut pict, 0);
    for row in indices.chunks_exact(row_bytes) {
        let packed = packbits(row);
        if row_bytes > 250 {
            push_u16(&mut pict, packed.len());
        } else {
            pict.push(packed.len().min(u8::MAX as usize) as u8);
        }
        pict.extend_from_slice(&packed);
    }
    push_u16(&mut pict, 0x00ff);
    let size = pict.len().min(i16::MAX as usize) as i16;
    pict[0..2].copy_from_slice(&size.to_be_bytes());
    pict
}

fn header(width: u32, height: u32) -> Vec<u8> {
    let row_bytes = width as usize;
    let mut pict = vec![0; 10];
    write_rect(&mut pict, 2, 0, 0, height as i16, width as i16);
    push_u16(&mut pict, 0x0011);
    push_u16(&mut pict, 0x02ff);
    push_u16(&mut pict, 0x0c00);
    pict.extend_from_slice(&(-2_i16).to_be_bytes());
    push_u16(&mut pict, 0);
    push_u32(&mut pict, 72 << 16);
    push_u32(&mut pict, 72 << 16);
    push_rect(&mut pict, 0, 0, height as i16, width as i16);
    push_u32(&mut pict, 0);
    push_u16(&mut pict, 0x0098);
    push_u16(&mut pict, 0x8000 | row_bytes);
    push_rect(&mut pict, 0, 0, height as i16, width as i16);
    push_u16(&mut pict, 0);
    push_u16(&mut pict, 0);
    push_u32(&mut pict, 0);
    push_u32(&mut pict, 0);
    push_u32(&mut pict, 0);
    push_u16(&mut pict, 0);
    push_u16(&mut pict, 8);
    push_u16(&mut pict, 1);
    push_u16(&mut pict, 8);
    for _ in 0..4 {
        push_u32(&mut pict, 0);
    }
    pict
}
