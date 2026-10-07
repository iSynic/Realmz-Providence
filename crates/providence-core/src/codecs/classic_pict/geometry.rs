use super::byte_io::read_i16;
use super::types::{PictBitmapFormat, PictDecodeError};

const MAX_PICT_SIDE: usize = 4096;

#[derive(Debug, Clone, Copy)]
pub(super) struct Rect {
    pub(super) top: i16,
    pub(super) left: i16,
    pub(super) bottom: i16,
    pub(super) right: i16,
}

impl Rect {
    pub(super) fn read(bytes: &[u8], offset: usize) -> Result<Self, PictDecodeError> {
        Ok(Self {
            top: read_i16(bytes, offset, "rectangle")?,
            left: read_i16(bytes, offset + 2, "rectangle")?,
            bottom: read_i16(bytes, offset + 4, "rectangle")?,
            right: read_i16(bytes, offset + 6, "rectangle")?,
        })
    }

    pub(super) fn width(self) -> Option<usize> {
        usize::try_from(i32::from(self.right) - i32::from(self.left)).ok()
    }

    pub(super) fn height(self) -> Option<usize> {
        usize::try_from(i32::from(self.bottom) - i32::from(self.top)).ok()
    }

    pub(super) fn bounded(self, offset: usize) -> Result<(usize, usize), PictDecodeError> {
        let (Some(width), Some(height)) = (self.width(), self.height()) else {
            return Err(PictDecodeError::InvalidGeometry { offset });
        };
        if width == 0 || height == 0 || width > MAX_PICT_SIDE || height > MAX_PICT_SIDE {
            return Err(PictDecodeError::InvalidGeometry { offset });
        }
        Ok((width, height))
    }
}

#[derive(Debug)]
pub(super) struct BitmapCommand {
    pub(super) next_offset: usize,
    pub(super) bounds: Rect,
    pub(super) source: Rect,
    pub(super) destination: Rect,
    pub(super) format: PictBitmapFormat,
    pub(super) rgba: Vec<u8>,
}
