mod byte_io;
mod commands;
mod compressed;
mod constants;
mod headers;
mod pcm;
mod types;

use commands::CommandList;
use constants::FORMAT_TWO_PREFIX_BYTES;
use headers::decode_header;
pub use types::{
    DecodedSnd, SndCompressionKind, SndDecodeError, SndHeaderKind, SndHeaderLocation,
    SndResourceFormat,
};

pub fn decode_classic_snd(input: &[u8]) -> Result<DecodedSnd, SndDecodeError> {
    let list = CommandList::read(input)?;
    let (command, header_offset) = list.sample_header(input)?;
    let declared = decode_header(
        input,
        list.resource_format,
        command,
        header_offset,
        SndHeaderLocation::DeclaredOffset,
    );
    if declared.is_ok() {
        return declared;
    }

    // Apple's dataOffsetFlag contract makes param2 an absolute resource offset. Some
    // Realmz application format-2 resources instead store an offset six bytes past
    // the actual header. ResourceDASM, and therefore Castle's SndPlay path, recovers
    // these by reading the header immediately after the command list. Keep that
    // exception exact: format 2, one format-2 prefix away, and no arbitrary scan.
    let command_tail = list.tail()?;
    if list.resource_format == SndResourceFormat::Format2
        && command_tail.checked_add(FORMAT_TWO_PREFIX_BYTES) == Some(header_offset)
        && let Ok(decoded) = decode_header(
            input,
            list.resource_format,
            command,
            command_tail,
            SndHeaderLocation::Format2CommandTailRecovery,
        )
    {
        return Ok(decoded);
    }
    declared
}

#[cfg(test)]
mod tests;
