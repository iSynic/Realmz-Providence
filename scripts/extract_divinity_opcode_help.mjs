import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APPLE_SINGLE_MAGIC = 0x00051600;
const APPLE_DOUBLE_MAGIC = 0x00051607;
const RESOURCE_FORK_ENTRY_ID = 2;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const sourceRelativePath = "public/bundled-libraries/divinity/Divinity Data/Bag of Holding.rsrc";
const sourcePath = path.join(repoRoot, sourceRelativePath);
const docsOutputPath = path.join(repoRoot, "docs/generated/divinity-opcode-help.json");
const uiOutputPath = path.join(repoRoot, "src/editor/generated/divinityOpcodeHelp.json");

const rawFile = new Uint8Array(fs.readFileSync(sourcePath));
const sourceSha256 = crypto.createHash("sha256").update(rawFile).digest("hex");
const resources = parseResourceFork(rawFile)
  .filter((resource) => resource.resourceType === "TEXT")
  .sort((a, b) => a.id - b.id);

const entries = [];
const examples = [];

for (const resource of resources) {
  const text = decodeClassicText(resource.data);
  if (!text) continue;
  const parsed = parseCodeText(resource.id, text);
  if (parsed) {
    entries.push(parsed);
  } else {
    examples.push({
      resourceId: resource.id,
      title: firstNonemptyLine(text),
      summary: summarize(text),
      fullText: text
    });
  }
}

const byCode = {};
for (const entry of entries) {
  for (const code of entry.codes) {
    const key = String(code);
    byCode[key] ??= [];
    byCode[key].push(entry.resourceId);
  }
}

const artifact = {
  schemaVersion: 1,
  source: sourceRelativePath,
  sourceSha256,
  textResourceCount: resources.length,
  opcodeEntryCount: entries.length,
  byCode,
  entries,
  examples
};

writeJson(docsOutputPath, artifact);
writeJson(uiOutputPath, artifact);

console.log(`Extracted ${entries.length} Divinity opcode help entries from ${resources.length} TEXT resources.`);
console.log(`Wrote ${path.relative(repoRoot, docsOutputPath)}`);
console.log(`Wrote ${path.relative(repoRoot, uiOutputPath)}`);

function parseCodeText(resourceId, text) {
  const firstLine = firstNonemptyLine(text);
  const match = /^Code\s+(.+?)\s{2,}(.+)$/i.exec(firstLine) ?? /^Code\s+(-?\d+(?:\s*&\s*-?\d+)*)\s+(.+)$/i.exec(firstLine);
  if (!match) return null;
  const codes = [...match[1].matchAll(/-?\d+/g)].map((codeMatch) => Number(codeMatch[0]));
  if (codes.length === 0) return null;
  const title = normalizeWhitespace(match[2]);
  const idField = sectionText(text, "ID", ["Use", "Options", "E-Codes"]);
  const use = sectionText(text, "Use", ["Options", "E-Codes"]);
  const options = sectionText(text, "Options", ["E-Codes"]);
  const extraCodes = sectionText(text, "E-Codes", []);
  const summary = summarize(use || options || text);
  return {
    resourceId,
    codes,
    primaryCode: codes[0],
    title,
    idField,
    use,
    options,
    extraCodes,
    summary,
    fullText: text
  };
}

function sectionText(text, label, nextLabels) {
  const escapedLabel = escapeRegex(label);
  const startRegex = new RegExp(`(?:^|\\n)\\s*${escapedLabel}\\s*:?(?:\\s|$)`, "i");
  const startMatch = startRegex.exec(text);
  if (!startMatch) return "";
  const start = startMatch.index + startMatch[0].length;
  let end = text.length;
  for (const nextLabel of nextLabels) {
    const escapedNext = escapeRegex(nextLabel);
    const nextRegex = new RegExp(`\\n\\s*${escapedNext}\\s*:?(?:\\s|$)`, "i");
    const nextMatch = nextRegex.exec(text.slice(start));
    if (nextMatch) end = Math.min(end, start + nextMatch.index);
  }
  return normalizeWhitespace(text.slice(start, end));
}

function firstNonemptyLine(text) {
  return normalizeWhitespace(text.split("\n").find((line) => line.trim()) ?? "");
}

function summarize(text) {
  const clean = normalizeWhitespace(text);
  if (clean.length <= 220) return clean;
  const sentenceEnd = clean.slice(0, 220).search(/[.!?]\s/);
  if (sentenceEnd > 40) return clean.slice(0, sentenceEnd + 1);
  return `${clean.slice(0, 217).trim()}...`;
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseResourceFork(original) {
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

  const resources = [];
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
      if (nameRelativeOffset >= 0) {
        const nameOffset = nameListOffset + nameRelativeOffset;
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
      resources.push({
        resourceType,
        id,
        name,
        data: buffer.slice(lengthOffset + 4, lengthOffset + 4 + length)
      });
    }
  }
  return resources;
}

function extractResourceFork(buffer) {
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

function u32At(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.byteLength) return null;
  return ((bytes[offset] ?? 0) << 24) | ((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
}

function u16At(bytes, offset) {
  if (offset < 0 || offset + 2 > bytes.byteLength) return null;
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function i16At(bytes, offset) {
  const value = u16At(bytes, offset);
  if (value === null) return 0;
  return value >= 0x8000 ? value - 0x10000 : value;
}

function decodeAscii(bytes) {
  return [...bytes].map((byte) => String.fromCharCode(byte)).join("");
}

function decodeClassicText(bytes) {
  const decoded = new TextDecoder("macintosh").decode(bytes);
  return decoded.replace(/\r\n?/g, "\n").replace(/\0/g, "").trim();
}
