#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum PictBitmapFormat {
    Monochrome,
    Indexed1,
    Indexed2,
    Indexed4,
    Indexed8,
    Direct16,
    Direct32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum PictStreamVersion {
    Version1,
    Version2,
    UnversionedWordOpcodes,
}

impl PictStreamVersion {
    pub fn name(self) -> &'static str {
        match self {
            Self::Version1 => "version-1",
            Self::Version2 => "version-2",
            Self::UnversionedWordOpcodes => "unversioned-word-opcodes",
        }
    }
}

impl PictBitmapFormat {
    pub fn name(self) -> &'static str {
        match self {
            Self::Monochrome => "monochrome-1",
            Self::Indexed1 => "indexed-1",
            Self::Indexed2 => "indexed-2",
            Self::Indexed4 => "indexed-4",
            Self::Indexed8 => "indexed-8",
            Self::Direct16 => "direct-16",
            Self::Direct32 => "direct-32",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedPict {
    pub stream_version: PictStreamVersion,
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
    pub bitmap_commands: usize,
    pub formats: Vec<PictBitmapFormat>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PictDecodeError {
    TooShort,
    InvalidFrame,
    InvalidStandaloneContainer,
    NoSupportedBitmap,
    UnsupportedVersionOneOpcode {
        offset: usize,
        opcode: u8,
    },
    UnsupportedBitmap {
        offset: usize,
        opcode: u16,
    },
    Truncated {
        offset: usize,
        section: &'static str,
    },
    InvalidGeometry {
        offset: usize,
    },
    InvalidRowBytes {
        offset: usize,
        row_bytes: usize,
    },
    InvalidColorTable {
        offset: usize,
    },
    InvalidPackBits {
        offset: usize,
    },
    PackBitsLengthMismatch {
        offset: usize,
        expected: usize,
        actual: usize,
    },
}

impl std::fmt::Display for PictDecodeError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TooShort => write!(formatter, "PICT is shorter than its size and frame header"),
            Self::InvalidFrame => {
                write!(formatter, "PICT has invalid or unsupported frame geometry")
            }
            Self::InvalidStandaloneContainer => {
                write!(
                    formatter,
                    "standalone PICT has no supported v2 version record"
                )
            }
            Self::NoSupportedBitmap => {
                write!(formatter, "PICT contains no supported bitmap command")
            }
            Self::UnsupportedVersionOneOpcode { offset, opcode } => write!(
                formatter,
                "PICT version-1 opcode 0x{opcode:02x} at byte {offset} is unsupported"
            ),
            Self::UnsupportedBitmap { offset, opcode } => write!(
                formatter,
                "PICT bitmap opcode 0x{opcode:04x} at byte {offset} uses an unsupported pixel shape"
            ),
            Self::Truncated { offset, section } => {
                write!(formatter, "PICT {section} is truncated at byte {offset}")
            }
            Self::InvalidGeometry { offset } => {
                write!(
                    formatter,
                    "PICT bitmap at byte {offset} has invalid geometry"
                )
            }
            Self::InvalidRowBytes { offset, row_bytes } => write!(
                formatter,
                "PICT bitmap at byte {offset} has invalid {row_bytes}-byte rows"
            ),
            Self::InvalidColorTable { offset } => {
                write!(formatter, "PICT color table at byte {offset} is invalid")
            }
            Self::InvalidPackBits { offset } => {
                write!(formatter, "PICT PackBits row at byte {offset} is invalid")
            }
            Self::PackBitsLengthMismatch {
                offset,
                expected,
                actual,
            } => write!(
                formatter,
                "PICT PackBits row at byte {offset} decoded to {actual} bytes; expected {expected}"
            ),
        }
    }
}

impl std::error::Error for PictDecodeError {}
