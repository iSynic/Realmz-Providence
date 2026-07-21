export type StandardModInfo = {
  title: string;
  channels: number;
  patterns: number;
  sampleBytes: number;
};

export function inspectStandardMod(bytes: Uint8Array): StandardModInfo {
  if (bytes.byteLength < 1084) throw new Error("The selected file is too short to be a standard 31-sample MOD module.");
  const signature = ascii(bytes, 1080, 4);
  const channels = modChannelCount(signature);
  if (channels === null) {
    throw new Error(`The selected file is not a supported standard MOD module (signature ${JSON.stringify(signature)}). XM, S3M, IT, MADG, and PlayerPRO files are not accepted.`);
  }
  let sampleBytes = 0;
  for (let index = 0; index < 31; index += 1) {
    const offset = 20 + index * 30;
    sampleBytes += ((bytes[offset + 22] << 8) | bytes[offset + 23]) * 2;
    if (bytes[offset + 25] > 64) throw new Error(`MOD sample ${index + 1} has an invalid volume greater than 64.`);
  }
  const songLength = bytes[950];
  if (songLength < 1 || songLength > 128) throw new Error("The MOD order list length must be between 1 and 128.");
  let highestPattern = 0;
  for (let index = 0; index < songLength; index += 1) highestPattern = Math.max(highestPattern, bytes[952 + index]);
  const patterns = highestPattern + 1;
  const requiredBytes = 1084 + patterns * 64 * channels * 4 + sampleBytes;
  if (requiredBytes > bytes.byteLength) {
    throw new Error(`The MOD payload is truncated: its headers require at least ${requiredBytes.toLocaleString()} bytes, but the file has ${bytes.byteLength.toLocaleString()}.`);
  }
  return {
    title: ascii(bytes, 0, 20).replace(/\0.*$/s, "").trim(),
    channels,
    patterns,
    sampleBytes
  };
}

function modChannelCount(signature: string): number | null {
  if (["M.K.", "M!K!", "M&K!", "N.T.", "FLT4"].includes(signature)) return 4;
  if (["OCTA", "CD81", "FLT8"].includes(signature)) return 8;
  const short = signature.match(/^(\d)CHN$/);
  if (short) return Number(short[1]);
  const long = signature.match(/^(\d{2})CH$/);
  if (long) return Number(long[1]);
  return null;
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  let value = "";
  for (let index = 0; index < length; index += 1) value += String.fromCharCode(bytes[offset + index] ?? 0);
  return value;
}
