import { REALMZ_NATIVE_LAYOUT } from "../generated/realmzNativeManifestPolicy";

export const SHOP_RECORD_BYTES = REALMZ_NATIVE_LAYOUT.shopRecordBytes;

const SHOP_ITEM_SLOTS = 1000;
const FOREIGN_RECORD_MIN_NONZERO_ITEMS = 900;
const FOREIGN_RECORD_MIN_OUT_OF_RANGE_ITEMS = 500;
const FOREIGN_RECORD_MIN_NONZERO_QUANTITIES = 900;

export function shopPrefixRecordCount(buffer: Uint8Array | undefined) {
  if (!buffer) return 0;
  let count = Math.floor(buffer.byteLength / SHOP_RECORD_BYTES);
  while (count > 0 && isForeignShopTailRecord(buffer.subarray((count - 1) * SHOP_RECORD_BYTES, count * SHOP_RECORD_BYTES))) {
    count -= 1;
  }
  return count;
}

export function appendPreservedShopSourceSuffix(bytes: Uint8Array, raw: Uint8Array | null | undefined) {
  if (!raw) return bytes;
  const sourcePrefixBytes = shopPrefixRecordCount(raw) * SHOP_RECORD_BYTES;
  const fullSourceBytes = Math.floor(raw.byteLength / SHOP_RECORD_BYTES) * SHOP_RECORD_BYTES;
  const suffixStart = sourcePrefixBytes < fullSourceBytes
    ? sourcePrefixBytes
    : fullSourceBytes < raw.byteLength
      ? fullSourceBytes
      : null;
  if (suffixStart == null) return bytes;
  const suffix = raw.slice(suffixStart);
  const output = new Uint8Array(bytes.byteLength + suffix.byteLength);
  output.set(bytes);
  output.set(suffix, bytes.byteLength);
  return output;
}

export function isForeignShopTailRecord(record: Uint8Array) {
  if (record.byteLength !== SHOP_RECORD_BYTES) return false;
  let nonzeroItems = 0;
  let outOfRangeItems = 0;
  let nonzeroQuantities = 0;
  for (let slot = 0; slot < SHOP_ITEM_SLOTS; slot += 1) {
    const itemId = i16(record, slot * 2);
    if (itemId !== 0) nonzeroItems += 1;
    if (Math.abs(itemId) > 999) outOfRangeItems += 1;
    if (record[2000 + slot] !== 0) nonzeroQuantities += 1;
  }
  return nonzeroItems >= FOREIGN_RECORD_MIN_NONZERO_ITEMS &&
    outOfRangeItems >= FOREIGN_RECORD_MIN_OUT_OF_RANGE_ITEMS &&
    nonzeroQuantities >= FOREIGN_RECORD_MIN_NONZERO_QUANTITIES;
}

function i16(bytes: Uint8Array, offset: number) {
  const unsigned = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
  return unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned;
}
