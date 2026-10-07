use super::byte_io::{read_slice, read_u16, read_u32};
use super::constants::{
    BUFFER_COMMAND, DATA_OFFSET_FLAG, FORMAT_ONE, FORMAT_TWO, FORMAT_TWO_PREFIX_BYTES,
    MAX_COMMANDS, SOUND_COMMAND,
};
use super::types::{SndDecodeError, SndResourceFormat};

pub(super) struct CommandList {
    pub(super) resource_format: SndResourceFormat,
    command_offset: usize,
    command_count: usize,
    command_bytes: usize,
}

impl CommandList {
    pub(super) fn read(input: &[u8]) -> Result<Self, SndDecodeError> {
        let raw_format = read_u16(input, 0, "format word")?;
        let (resource_format, command_offset, command_count) = match raw_format {
            FORMAT_ONE => {
                let modifier_count = usize::from(read_u16(input, 2, "data-format count")?);
                let command_count_offset = modifier_count
                    .checked_mul(6)
                    .and_then(|length| 4usize.checked_add(length))
                    .ok_or(SndDecodeError::PcmLengthOverflow)?;
                let command_count =
                    usize::from(read_u16(input, command_count_offset, "command count")?);
                (
                    SndResourceFormat::Format1,
                    command_count_offset + 2,
                    command_count,
                )
            }
            FORMAT_TWO => (
                SndResourceFormat::Format2,
                FORMAT_TWO_PREFIX_BYTES,
                usize::from(read_u16(input, 4, "command count")?),
            ),
            other => return Err(SndDecodeError::UnsupportedFormat(other)),
        };
        if command_count > MAX_COMMANDS {
            return Err(SndDecodeError::TooManyCommands(command_count));
        }
        let command_bytes = command_count
            .checked_mul(8)
            .ok_or(SndDecodeError::PcmLengthOverflow)?;
        read_slice(input, command_offset, command_bytes, "command list")?;

        Ok(Self {
            resource_format,
            command_offset,
            command_count,
            command_bytes,
        })
    }

    pub(super) fn sample_header(&self, input: &[u8]) -> Result<(u16, usize), SndDecodeError> {
        let mut selected = None;
        for index in 0..self.command_count {
            let offset = self.command_offset + index * 8;
            let command = read_u16(input, offset, "command")?;
            let opcode = command & !DATA_OFFSET_FLAG;
            if command & DATA_OFFSET_FLAG != 0 && matches!(opcode, SOUND_COMMAND | BUFFER_COMMAND) {
                let header_offset =
                    usize::try_from(read_u32(input, offset + 4, "command parameter")?)
                        .map_err(|_| SndDecodeError::PcmLengthOverflow)?;
                selected = Some((command, header_offset));
                break;
            }
        }
        let Some(sample) = selected else {
            return Err(SndDecodeError::NoSampleCommand(self.resource_format));
        };
        Ok(sample)
    }

    pub(super) fn tail(&self) -> Result<usize, SndDecodeError> {
        self.command_offset
            .checked_add(self.command_bytes)
            .ok_or(SndDecodeError::PcmLengthOverflow)
    }
}
