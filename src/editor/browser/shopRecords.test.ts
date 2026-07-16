import { describe, expect, it } from "vitest";
import { parseScenarioBuffers } from "./realmzParser";
import { SHOP_RECORD_BYTES, appendPreservedShopSourceSuffix, isForeignShopTailRecord, shopPrefixRecordCount } from "./shopRecords";

describe("shop record ownership", () => {
  it("separates dense foreign suffix records from the editable shop prefix", () => {
    const valid = shopRecord([{ itemId: 10, quantity: 2 }], 100);
    const foreign = denseForeignRecord();
    const bytes = concat(valid, foreign, foreign);

    expect(shopPrefixRecordCount(bytes)).toBe(1);
    expect(isForeignShopTailRecord(foreign)).toBe(true);
  });

  it("keeps sparse malformed records visible to authors", () => {
    const malformed = shopRecord([{ itemId: 32000, quantity: 1 }], -25);

    expect(shopPrefixRecordCount(malformed)).toBe(1);
    expect(isForeignShopTailRecord(malformed)).toBe(false);
  });

  it("does not hide a dense record when a later shop proves it is not a suffix", () => {
    const bytes = concat(shopRecord([], 100), denseForeignRecord(), shopRecord([{ itemId: 42, quantity: 3 }], 95));

    expect(shopPrefixRecordCount(bytes)).toBe(3);
  });

  it("reports the same author-facing boundary through the browser importer", () => {
    const parsed = parseScenarioBuffers(new Map([
      ["Data SD", concat(shopRecord([{ itemId: 10, quantity: 2 }], 100), denseForeignRecord())]
    ]));

    expect(parsed.shops).toHaveLength(1);
    expect(parsed.records.counts["Data SD"]).toBe(1);
    expect(parsed.records.alignments.find((alignment) => alignment.source === "Data SD")?.count).toBe(1);
    expect(parsed.diagnostics).toContainEqual(expect.objectContaining({ code: "non-shop-data-suffix", source: "Data SD" }));
  });

  it("inserts added shops before the preserved source suffix", () => {
    const valid = shopRecord([{ itemId: 10, quantity: 2 }], 100);
    const added = shopRecord([{ itemId: 11, quantity: 3 }], 95);
    const foreign = denseForeignRecord();

    const output = appendPreservedShopSourceSuffix(concat(valid, added), concat(valid, foreign));

    expect(output).toEqual(concat(valid, added, foreign));
  });

  it("retains a partial malformed source tail", () => {
    const valid = shopRecord([{ itemId: 10, quantity: 2 }], 100);
    const output = appendPreservedShopSourceSuffix(valid, concat(valid, new Uint8Array([7, 8, 9])));

    expect(output).toEqual(concat(valid, new Uint8Array([7, 8, 9])));
  });
});

function shopRecord(items: Array<{ itemId: number; quantity: number }>, inflation: number) {
  const bytes = new Uint8Array(SHOP_RECORD_BYTES);
  items.forEach(({ itemId, quantity }, slot) => {
    writeI16(bytes, slot * 2, itemId);
    bytes[2000 + slot] = quantity;
  });
  writeI16(bytes, 3000, inflation);
  return bytes;
}

function denseForeignRecord() {
  const bytes = new Uint8Array(SHOP_RECORD_BYTES);
  for (let slot = 0; slot < 1000; slot += 1) {
    writeI16(bytes, slot * 2, 2000 + slot);
    bytes[2000 + slot] = 0xff;
  }
  return bytes;
}

function writeI16(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}

function concat(...records: Uint8Array[]) {
  const bytes = new Uint8Array(records.reduce((sum, record) => sum + record.byteLength, 0));
  let offset = 0;
  for (const record of records) {
    bytes.set(record, offset);
    offset += record.byteLength;
  }
  return bytes;
}
