use super::{Entry, catalog::Inventory, conversion};

pub(super) struct Original {
    pub bytes: Vec<u8>,
    pub extension: String,
    pub png_fingerprint: Option<[u8; 32]>,
}

pub(super) fn read(inventory: &Inventory<'_>, entry: &Entry) -> Result<Original, String> {
    let asset = &entry.asset;
    // Imported source bytes outrank generated Classic resources and preview media.
    // Otherwise the retained Classic payload is the original, not its decoded PNG.
    if let Some(source) = &entry.source_original {
        let bytes = inventory.read(entry, &source.blob, source.byte_length)?;
        let mut descriptor = asset.clone();
        descriptor.mime_type = Some(source.mime_type.clone());
        descriptor.extension = None;
        let png_fingerprint = if source.mime_type == "image/png" && source.blob != asset.blob {
            conversion::png_fingerprint(&bytes)
        } else {
            None
        };
        return Ok(Original {
            bytes,
            extension: conversion::original_extension(&descriptor, false),
            png_fingerprint,
        });
    }
    if let Some(native) = &asset.classic_payload_blob {
        let length = asset
            .classic_payload_byte_length
            .ok_or("Native payload length is unavailable.")?;
        return Ok(Original {
            bytes: inventory.read(entry, native, length)?,
            extension: conversion::original_extension(asset, true),
            png_fingerprint: None,
        });
    }
    Ok(Original {
        bytes: inventory.read(entry, &asset.blob, asset.byte_length)?,
        extension: conversion::original_extension(asset, false),
        png_fingerprint: None,
    })
}
