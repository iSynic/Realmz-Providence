type ZipFileEntry = {
  path: string;
  bytes: Uint8Array;
  modifiedAt?: Date;
};

export type StoredZipEntry = {
  path: string;
  bytes: Uint8Array;
};

const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;
const VERSION_NEEDED = 20;
const VERSION_MADE_BY = 20;
const CRC_TABLE = makeCrcTable();

export function createStoredZip(entries: ZipFileEntry[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const normalizedPath = entry.path.replace(/\\/g, "/").replace(/^\/+/, "");
    const nameBytes = new TextEncoder().encode(normalizedPath);
    const modified = dosDateTime(entry.modifiedAt ?? new Date());
    const crc = crc32(entry.bytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, VERSION_NEEDED, true);
    localView.setUint16(6, UTF8_FLAG, true);
    localView.setUint16(8, STORE_METHOD, true);
    localView.setUint16(10, modified.time, true);
    localView.setUint16(12, modified.date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.bytes.length, true);
    localView.setUint32(22, entry.bytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, VERSION_MADE_BY, true);
    centralView.setUint16(6, VERSION_NEEDED, true);
    centralView.setUint16(8, UTF8_FLAG, true);
    centralView.setUint16(10, STORE_METHOD, true);
    centralView.setUint16(12, modified.time, true);
    centralView.setUint16(14, modified.date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.bytes.length, true);
    centralView.setUint32(24, entry.bytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, entry.bytes);
    centralParts.push(centralHeader);
    offset += localHeader.length + entry.bytes.length;
  }

  const centralOffset = offset;
  const centralSize = byteLength(centralParts);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);

  return concatBytes([...localParts, ...centralParts, endRecord]);
}

export function readStoredZip(bytes: Uint8Array): StoredZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(endOffset + 16, true);
  const entries: StoredZipEntry[] = [];
  let cursor = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.byteLength || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error("ZIP central directory is malformed.");
    }
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const expectedCrc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const fileNameStart = cursor + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    if (fileNameEnd > bytes.byteLength) throw new Error("ZIP central directory filename extends past end of file.");
    const path = decodeZipPath(bytes.slice(fileNameStart, fileNameEnd), flags);
    cursor = fileNameEnd + extraLength + commentLength;

    if (!path || path.endsWith("/")) continue;
    if (method !== STORE_METHOD) {
      throw new Error(`ZIP entry '${path}' uses compression method ${method}; Providence browser project packages must use stored entries.`);
    }
    if (compressedSize !== uncompressedSize) {
      throw new Error(`ZIP entry '${path}' has mismatched stored and uncompressed sizes.`);
    }
    if (localHeaderOffset + 30 > bytes.byteLength || view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new Error(`ZIP entry '${path}' has a malformed local header.`);
    }
    const localFileNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.byteLength) throw new Error(`ZIP entry '${path}' data extends past end of file.`);
    const entryBytes = bytes.slice(dataStart, dataEnd);
    if (crc32(entryBytes) !== expectedCrc) {
      throw new Error(`ZIP entry '${path}' failed CRC validation.`);
    }
    entries.push({ path, bytes: entryBytes });
  }
  return entries;
}

function concatBytes(parts: Uint8Array[]) {
  const output = new Uint8Array(byteLength(parts));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function byteLength(parts: Uint8Array[]) {
  return parts.reduce((sum, part) => sum + part.length, 0);
}

function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function findEndOfCentralDirectory(view: DataView) {
  const minOffset = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("ZIP end-of-central-directory record was not found.");
}

function decodeZipPath(bytes: Uint8Array, flags: number) {
  if ((flags & UTF8_FLAG) !== 0) return new TextDecoder().decode(bytes);
  return Array.from(bytes).map((byte) => String.fromCharCode(byte)).join("");
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < table.length; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
}
