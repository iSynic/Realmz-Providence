import { describe, expect, it } from "vitest";
import pictConformance from "../../../fixtures/pict-conformance/manifest.json";
import { inspectPictConformanceForTest } from "./resourcePreview";

type ConformanceExpectation = {
  status: string;
  width?: number;
  height?: number;
  version?: string;
  format?: string;
  opcode?: string;
  opcodeCount?: number;
  rgbaFnv1a?: string;
  diagnosticCodes: string[];
};

describe("browser PICT conformance", () => {
  it("keeps the required fixture families in one shared byte matrix", () => {
    const ids = pictConformance.fixtures.map((fixture) => fixture.id);

    expect(ids).toContain("v1-bitsrect-byte-stream");
    expect(ids).toContain("v1-bitsrgn-byte-stream");
    expect(ids).toContain("v1-packbitsrect-byte-stream");
    expect(ids).toContain("v1-packbitsrgn-byte-stream");
    expect(ids).toContain("v2-bitsrect-odd-text-padding");
    expect(ids).toContain("v2-bitsrect-pixmap");
    expect(ids).toContain("v2-bitsrect-pixmap-1bit");
    expect(ids).toContain("v2-bitsrect-pixmap-2bit");
    expect(ids).toContain("v2-bitsrect-pixmap-4bit");
    expect(ids).toContain("v2-bitsrgn-pixmap");
    expect(ids).toContain("v2-packbitsrect-rowbytes-7-unpacked");
    expect(ids).toContain("v2-packbitsrect-rowbytes-8-packed");
    expect(ids).toContain("v2-packbitsrect-rowbytes-250-packed");
    expect(ids).toContain("v2-packbitsrect-rowbytes-251-packed");
    expect(ids).toContain("v2-reserved-skip-classes");
    expect(ids).toContain("v2-structured-opcode-lengths");
    expect(ids).toContain("v2-fixed12-truncated");
    expect(ids).toContain("v2-text-record-truncated");
    expect(ids).toContain("v2-polygon-record-truncated");
    expect(ids).toContain("v2-region-record-truncated");
    expect(ids).toContain("v2-word-length-record-truncated");
    expect(ids).toContain("v2-long-comment-truncated");
    expect(ids).toContain("v2-long-length-record-truncated");
    expect(ids).toContain("v2-high-fixed-record-truncated");
    expect(ids).toContain("v2-high-long-record-truncated");
    expect(ids).toContain("v2-word-padding-truncated");
    expect(ids).toContain("directbits16-byte-packbits");
    expect(ids).toContain("directbits16-word-packbits");
    expect(ids).toContain("directbits32-chunky-packbits");
    expect(ids).toContain("directbits32-planar-packbits");
    expect(ids).toContain("standalone-512-byte-container");
    expect(pictConformance.fixtures.filter((fixture) => "malformedCompanionOf" in fixture).length).toBeGreaterThanOrEqual(5);
  });

  it.each(pictConformance.fixtures)("matches the shared current outcome for $id", (fixture) => {
    const bytes = fixtureBytes(fixture);
    const expectations = pictConformance.currentExpectations as Record<string, ConformanceExpectation>;
    const expected = expectations[fixture.id];

    expect(bytes.byteLength).toBe(fixture.byteLength);
    expect(expected, `${fixture.id} is missing a current expectation`).toBeDefined();
    expect(normalizeResult(inspectPictConformanceForTest(bytes))).toEqual(expected);
  });

  it("labels every target-only behavior with its owning parser issue", () => {
    const fixtures = new Map(pictConformance.fixtures.map((fixture) => [fixture.id, fixture]));
    for (const id of Object.keys(pictConformance.targetExpectations)) {
      expect(fixtures.get(id)?.ownerIssue, `${id} needs an ownerIssue`).toMatch(/^ISY-\d+$/);
    }
  });
});

function normalizeResult(result: ReturnType<typeof inspectPictConformanceForTest>): ConformanceExpectation {
  const normalized: ConformanceExpectation = {
    status: result.status,
    diagnosticCodes: result.diagnostics.map((diagnostic) => diagnostic.code)
  };
  if (result.status !== "decoded" || result.rgba === null) return normalized;
  normalized.width = result.width ?? undefined;
  normalized.height = result.height ?? undefined;
  normalized.version = result.summary.pictVersion;
  normalized.format = result.summary.format;
  normalized.opcode = result.summary.opcode;
  normalized.opcodeCount = Number(result.summary.opcodeCount);
  normalized.rgbaFnv1a = fnv1a(result.rgba);
  return normalized;
}

function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function fixtureBytes(fixture: { bytesBase64: string; prefixZeroBytes?: number }) {
  const payload = decodeBase64(fixture.bytesBase64);
  if (!fixture.prefixZeroBytes) return payload;
  const bytes = new Uint8Array(fixture.prefixZeroBytes + payload.byteLength);
  bytes.set(payload, fixture.prefixZeroBytes);
  return bytes;
}

function fnv1a(bytes: Uint8Array | Uint8ClampedArray) {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
