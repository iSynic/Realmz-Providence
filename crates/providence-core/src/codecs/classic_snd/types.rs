#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum SndResourceFormat {
    Format1,
    Format2,
}

impl SndResourceFormat {
    pub fn name(self) -> &'static str {
        match self {
            Self::Format1 => "format-1",
            Self::Format2 => "format-2",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum SndHeaderKind {
    Standard,
    Extended,
    Compressed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum SndHeaderLocation {
    DeclaredOffset,
    Format2CommandTailRecovery,
}

impl SndHeaderLocation {
    pub fn name(self) -> &'static str {
        match self {
            Self::DeclaredOffset => "declared-offset",
            Self::Format2CommandTailRecovery => "format-2-command-tail-recovery",
        }
    }
}

impl SndHeaderKind {
    pub fn name(self) -> &'static str {
        match self {
            Self::Standard => "standard",
            Self::Extended => "extended",
            Self::Compressed => "compressed",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum SndCompressionKind {
    None,
    LittleEndianPcm,
    Mace3,
}

impl SndCompressionKind {
    pub fn name(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::LittleEndianPcm => "sowt-pcm",
            Self::Mace3 => "mace-3-to-1",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedSnd {
    pub resource_format: SndResourceFormat,
    pub command: u16,
    pub header_location: SndHeaderLocation,
    pub header_offset: u32,
    pub header_kind: SndHeaderKind,
    pub compression: SndCompressionKind,
    pub sample_rate_fixed: u32,
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    pub frames: u32,
    pub loop_start: u32,
    pub loop_end: u32,
    pub base_frequency: u8,
    /// Unsigned bytes for 8-bit PCM and signed little-endian words for 16-bit PCM.
    pub runtime_pcm: Vec<u8>,
}

impl DecodedSnd {
    pub fn duration_ms(&self) -> u64 {
        u64::from(self.frames)
            .saturating_mul(1000)
            .checked_div(u64::from(self.sample_rate))
            .unwrap_or(0)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SndDecodeError {
    TooShort,
    UnsupportedFormat(u16),
    TooManyCommands(usize),
    Truncated {
        offset: usize,
        section: &'static str,
    },
    NoSampleCommand(SndResourceFormat),
    HeaderOutOfRange(usize),
    UnsupportedHeaderEncoding(u8),
    InvalidSampleRate(u32),
    UnsupportedChannels(u32),
    UnsupportedSampleSize(u16),
    UnsupportedCompression {
        compression_id: u16,
        format: u32,
    },
    UnsupportedCompressedStereo,
    PcmLengthOverflow,
    TruncatedSamples {
        offset: usize,
        expected: usize,
        available: usize,
    },
}

impl std::fmt::Display for SndDecodeError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TooShort => write!(formatter, "snd resource is too short for a format word"),
            Self::UnsupportedFormat(format) => {
                write!(
                    formatter,
                    "snd format {format} is not a sampled-sound format"
                )
            }
            Self::TooManyCommands(count) => {
                write!(formatter, "snd command list contains {count} commands")
            }
            Self::Truncated { offset, section } => {
                write!(formatter, "snd {section} is truncated at byte {offset}")
            }
            Self::NoSampleCommand(format) => write!(
                formatter,
                "{} snd contains no offset-bearing soundCmd or bufferCmd",
                format.name()
            ),
            Self::HeaderOutOfRange(offset) => {
                write!(
                    formatter,
                    "snd sound header points outside the resource at byte {offset}"
                )
            }
            Self::UnsupportedHeaderEncoding(encoding) => write!(
                formatter,
                "snd sound-header encoding 0x{encoding:02x} is unsupported"
            ),
            Self::InvalidSampleRate(rate) => {
                write!(formatter, "snd 16.16 sample rate 0x{rate:08x} is invalid")
            }
            Self::UnsupportedChannels(channels) => {
                write!(
                    formatter,
                    "snd channel count {channels} is outside mono/stereo"
                )
            }
            Self::UnsupportedSampleSize(bits) => {
                write!(formatter, "snd {bits}-bit PCM is unsupported")
            }
            Self::UnsupportedCompression {
                compression_id,
                format,
            } => format_compression(formatter, *compression_id, *format),
            Self::UnsupportedCompressedStereo => {
                write!(formatter, "stereo MACE 3:1 snd data is unsupported")
            }
            Self::PcmLengthOverflow => {
                write!(formatter, "snd PCM length exceeds the bounded decoder")
            }
            Self::TruncatedSamples {
                offset,
                expected,
                available,
            } => format_sample_shortage(formatter, *offset, *expected, *available),
        }
    }
}

impl std::error::Error for SndDecodeError {}

fn format_compression(
    formatter: &mut std::fmt::Formatter<'_>,
    compression_id: u16,
    format: u32,
) -> std::fmt::Result {
    write!(
        formatter,
        "snd compression 0x{compression_id:04x}/0x{format:08x} is unsupported"
    )
}

fn format_sample_shortage(
    formatter: &mut std::fmt::Formatter<'_>,
    offset: usize,
    expected: usize,
    available: usize,
) -> std::fmt::Result {
    write!(
        formatter,
        "snd sample data at byte {offset} has {available} bytes; expected {expected}"
    )
}
