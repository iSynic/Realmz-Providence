export type ResourceEntry = {
  resourceType: string;
  id: number;
  name: string;
  attributes: number;
  refOffset: number;
  nameOffset: number | null;
  dataRelativeOffset: number;
  offset: number;
  length: number;
  data: Uint8Array;
};

export type ResourceForkUpdate = {
  resourceType: string;
  id: number;
  name: string;
  attributes: number;
  data: Uint8Array;
};

const APPLE_SINGLE_MAGIC = 0x00051600;
const APPLE_DOUBLE_MAGIC = 0x00051607;
const RESOURCE_FORK_ENTRY_ID = 2;

export function parseResourceFork(original: Uint8Array): ResourceEntry[] {
  const buffer = extractResourceFork(original);
  if (buffer.byteLength < 32) return [];
  const dataOffset = u32At(buffer, 0);
  const mapOffset = u32At(buffer, 4);
  if (dataOffset === null || mapOffset === null || mapOffset + 28 > buffer.byteLength) return [];
  const typeListRelativeOffset = u16At(buffer, mapOffset + 24);
  const nameListRelativeOffset = u16At(buffer, mapOffset + 26);
  if (typeListRelativeOffset === null || nameListRelativeOffset === null) return [];
  const typeListOffset = mapOffset + typeListRelativeOffset;
  const nameListOffset = mapOffset + nameListRelativeOffset;
  if (typeListOffset + 2 > buffer.byteLength) return [];
  const rawTypeCount = u16At(buffer, typeListOffset);
  if (rawTypeCount === null) return [];

  const resources: ResourceEntry[] = [];
  for (let typeIndex = 0; typeIndex <= rawTypeCount; typeIndex += 1) {
    const typeOffset = typeListOffset + 2 + typeIndex * 8;
    if (typeOffset + 8 > buffer.byteLength) continue;
    const resourceType = decodeAscii(buffer.slice(typeOffset, typeOffset + 4));
    const rawResourceCount = u16At(buffer, typeOffset + 4);
    const refListRelativeOffset = u16At(buffer, typeOffset + 6);
    if (rawResourceCount === null || refListRelativeOffset === null) continue;
    const refListOffset = typeListOffset + refListRelativeOffset;
    for (let refIndex = 0; refIndex <= rawResourceCount; refIndex += 1) {
      const refOffset = refListOffset + refIndex * 12;
      if (refOffset + 12 > buffer.byteLength) continue;
      const id = i16At(buffer, refOffset);
      const nameRelativeOffset = i16At(buffer, refOffset + 2);
      let name = "";
      let nameOffset: number | null = null;
      if (nameRelativeOffset >= 0) {
        nameOffset = nameListOffset + nameRelativeOffset;
        if (nameOffset < buffer.byteLength) {
          const length = buffer[nameOffset] ?? 0;
          const end = Math.min(nameOffset + 1 + length, buffer.byteLength);
          name = decodeClassicText(buffer.slice(nameOffset + 1, end));
        }
      }
      const dataRelativeOffset = ((buffer[refOffset + 5] ?? 0) << 16) | ((buffer[refOffset + 6] ?? 0) << 8) | (buffer[refOffset + 7] ?? 0);
      const lengthOffset = dataOffset + dataRelativeOffset;
      const length = u32At(buffer, lengthOffset);
      if (length === null || lengthOffset + 4 + length > buffer.byteLength) continue;
      const offset = lengthOffset + 4;
      resources.push({
        resourceType,
        id,
        name,
        attributes: buffer[refOffset + 4] ?? 0,
        refOffset,
        nameOffset,
        dataRelativeOffset,
        offset,
        length,
        data: buffer.slice(offset, offset + length)
      });
    }
  }
  return resources;
}

export function mergeResourceEntries(original: Uint8Array, updates: ResourceForkUpdate[]) {
  const entries = parseResourceFork(original).map(resourceEntryToUpdate);
  let replaced = 0;
  for (const update of updates) {
    const existingIndex = entries.findIndex((entry) => entry.resourceType === update.resourceType && entry.id === update.id);
    if (existingIndex >= 0) {
      entries[existingIndex] = update;
      replaced += 1;
    } else {
      entries.push(update);
    }
  }
  return { bytes: writeResourceFork(entries), replaced };
}

export function writeResourceFork(entries: ResourceForkUpdate[]) {
  const groups = new Map<string, ResourceForkUpdate[]>();
  for (const entry of entries) {
    if (entry.resourceType.length !== 4) throw new Error(`Resource type '${entry.resourceType}' must be four bytes.`);
    if (!groups.has(entry.resourceType)) groups.set(entry.resourceType, []);
    groups.get(entry.resourceType)!.push(entry);
  }
  const sortedGroups = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  for (const [, group] of sortedGroups) group.sort((left, right) => left.id - right.id);

  const dataSection: number[] = [];
  const offsets = new Map<string, number>();
  for (const [resourceType, group] of sortedGroups) {
    for (const entry of group) {
      offsets.set(resourceOffsetKey(resourceType, entry.id), dataSection.length);
      pushU32(dataSection, entry.data.byteLength);
      pushBytes(dataSection, entry.data);
    }
  }

  const typeListLength = 2 + sortedGroups.length * 8;
  const refListStart = typeListLength;
  const refListLength = sortedGroups.reduce((sum, [, group]) => sum + group.length * 12, 0);
  const nameListStart = refListStart + refListLength;

  const typeList: number[] = [];
  pushU16(typeList, Math.max(0, sortedGroups.length - 1));
  let refCursor = refListStart;
  for (const [resourceType, group] of sortedGroups) {
    pushAscii(typeList, resourceType);
    pushU16(typeList, Math.max(0, group.length - 1));
    pushU16(typeList, refCursor);
    refCursor += group.length * 12;
  }

  const refLists: number[] = [];
  const names: number[] = [];
  for (const [resourceType, group] of sortedGroups) {
    for (const entry of group) {
      pushI16(refLists, entry.id);
      if (entry.name) {
        pushI16(refLists, names.length);
        const encoded = encodeClassicText(entry.name).slice(0, 255);
        names.push(encoded.length);
        pushBytes(names, encoded);
      } else {
        pushI16(refLists, -1);
      }
      refLists.push(entry.attributes & 0xff);
      const offset = offsets.get(resourceOffsetKey(resourceType, entry.id)) ?? 0;
      refLists.push((offset >> 16) & 0xff, (offset >> 8) & 0xff, offset & 0xff, 0, 0, 0, 0);
    }
  }

  const dataOffset = 16;
  const mapOffset = dataOffset + dataSection.length;
  const mapLength = 28 + typeList.length + refLists.length + names.length;
  const output: number[] = [];
  pushU32(output, dataOffset);
  pushU32(output, mapOffset);
  pushU32(output, dataSection.length);
  pushU32(output, mapLength);
  pushBytes(output, dataSection);

  const map: number[] = [];
  pushU32(map, dataOffset);
  pushU32(map, mapOffset);
  pushU32(map, dataSection.length);
  pushU32(map, mapLength);
  pushBytes(map, [0, 0, 0, 0, 0, 0, 0, 0]);
  pushU16(map, 28);
  pushU16(map, nameListStart + 28);
  pushBytes(map, typeList);
  pushBytes(map, refLists);
  pushBytes(map, names);
  pushBytes(output, map);
  return new Uint8Array(output);
}

export function encodeStringListResource(strings: string[]) {
  const output: number[] = [];
  pushU16(output, strings.length);
  for (const string of strings) {
    const encoded = encodeClassicText(string).slice(0, 255);
    output.push(encoded.length);
    pushBytes(output, encoded);
  }
  return new Uint8Array(output);
}

export function parseStringListResource(bytes: Uint8Array) {
  const count = u16At(bytes, 0);
  if (count === null) return [];
  const strings: string[] = [];
  let offset = 2;
  for (let index = 0; index < count; index += 1) {
    if (offset >= bytes.byteLength) break;
    const length = bytes[offset] ?? 0;
    offset += 1;
    if (offset + length > bytes.byteLength) break;
    strings.push(decodeClassicText(bytes.slice(offset, offset + length)));
    offset += length;
  }
  return strings;
}

function resourceEntryToUpdate(entry: ResourceEntry): ResourceForkUpdate {
  return {
    resourceType: entry.resourceType,
    id: entry.id,
    name: entry.name,
    attributes: entry.attributes,
    data: entry.data
  };
}

function extractResourceFork(buffer: Uint8Array) {
  if (buffer.byteLength < 26) return buffer;
  const magic = u32At(buffer, 0);
  if (magic !== APPLE_SINGLE_MAGIC && magic !== APPLE_DOUBLE_MAGIC) return buffer;
  const entryCount = u16At(buffer, 24);
  if (entryCount === null) return buffer;
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = 26 + index * 12;
    const entryId = u32At(buffer, entryOffset);
    const offset = u32At(buffer, entryOffset + 4);
    const length = u32At(buffer, entryOffset + 8);
    if (entryId === RESOURCE_FORK_ENTRY_ID && offset !== null && length !== null && offset + length <= buffer.byteLength) {
      return buffer.slice(offset, offset + length);
    }
  }
  return buffer;
}

function encodeClassicText(value: string) {
  return new Uint8Array([...value].map((char) => char.charCodeAt(0) <= 0x7f ? char.charCodeAt(0) : "?".charCodeAt(0)));
}

function decodeClassicText(bytes: Uint8Array) {
  const nul = bytes.indexOf(0);
  const slice = nul >= 0 ? bytes.slice(0, nul) : bytes;
  let output = "";
  let lastSpace = false;
  for (const byte of slice) {
    const ch = byte <= 31 ? " " : String.fromCharCode(byte);
    if (/\s/.test(ch)) {
      if (!lastSpace) output += " ";
      lastSpace = true;
    } else {
      output += ch;
      lastSpace = false;
    }
  }
  return output.trim();
}

function decodeAscii(bytes: Uint8Array) {
  return [...bytes].map((byte) => String.fromCharCode(byte)).join("");
}

function u32At(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 4 > bytes.byteLength) return null;
  return (
    (bytes[offset] ?? 0) * 0x1000000 +
    (bytes[offset + 1] ?? 0) * 0x10000 +
    (bytes[offset + 2] ?? 0) * 0x100 +
    (bytes[offset + 3] ?? 0)
  );
}

function u16At(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 2 > bytes.byteLength) return null;
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function i16At(bytes: Uint8Array, offset: number) {
  const value = u16At(bytes, offset);
  if (value === null) return 0;
  return value >= 0x8000 ? value - 0x10000 : value;
}

function resourceOffsetKey(resourceType: string, id: number) {
  return `${resourceType}\0${id}`;
}

function pushAscii(output: number[], value: string) {
  for (let index = 0; index < value.length; index += 1) output.push(value.charCodeAt(index) & 0xff);
}

function pushBytes(output: number[], bytes: ArrayLike<number>) {
  for (let index = 0; index < bytes.length; index += 1) output.push(bytes[index] & 0xff);
}

function pushU16(output: number[], value: number) {
  output.push((value >> 8) & 0xff, value & 0xff);
}

function pushI16(output: number[], value: number) {
  const normalized = value < 0 ? value + 0x10000 : value;
  pushU16(output, normalized);
}

function pushU32(output: number[], value: number) {
  output.push((value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
}
