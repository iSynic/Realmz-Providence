export const SECURITY_SEGMENT_LENGTH = 20;

export type RegistrationConfidence = "verified" | "candidate" | "reported-unmatched";

export type RegistrationAlgorithmId =
  | "pcBundledV71"
  | "macBundledClassic"
  | "pcCustomV71"
  | "macCustomLegacy"
  | "officialMacEvidence"
  | "officialWindowsEvidence"
  | "reportedEvidence";

export type RegistrationVariant = {
  algorithmId: RegistrationAlgorithmId;
  label: string;
  confidence: RegistrationConfidence;
  code: string;
  detail: string;
};

export type RegistrationInput = {
  scenarioName: string;
  segment1: string;
  segment2: string;
  registrationName: string;
  serialNumber: string;
  scenarioSlot?: number;
  recLevel?: number;
  maxLevel?: number;
};

export type RegistrationEvidenceVector = {
  scenarioName: string;
  segment1?: string;
  segment2?: string;
  registrationName: string;
  serialNumber: string;
  expectedCode: string;
  status: "official-mac" | "official-windows" | "reported";
  source: string;
};

export type SecuritySegmentShell = {
  codeseg1?: number[] | null;
  codeseg2?: number[] | null;
};

export const REGISTRATION_EVIDENCE_VECTORS: RegistrationEvidenceVector[] = [
  {
    scenarioName: "Prelude to Pestilence",
    segment1: "Macdom",
    segment2: "Norman Baites",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "25470888",
    status: "official-mac",
    source: "Official Fantasoft MacOS registration form supplied by user."
  },
  {
    scenarioName: "Assault on Giant Mountain",
    segment1: "MacMade",
    segment2: "System 6.0.1",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "58371333",
    status: "official-mac",
    source: "Official Fantasoft MacOS registration form supplied by user."
  },
  {
    scenarioName: "Castle in the Clouds",
    segment1: "Yah Doc",
    segment2: "Metal is our friend",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "26279812",
    status: "official-mac",
    source: "Official Fantasoft MacOS registration form supplied by user."
  },
  {
    scenarioName: "Destroy the Necronomicon",
    segment1: "Ian Bobein",
    segment2: "Banana Fo Fanna",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "5013448",
    status: "official-mac",
    source: "Official Fantasoft MacOS registration form supplied by user."
  },
  {
    scenarioName: "White Dragon",
    segment1: "Tiny Worms",
    segment2: "Mystic Rainbow",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "7476219",
    status: "official-mac",
    source: "Official Fantasoft MacOS registration form supplied by user."
  },
  {
    scenarioName: "Grilochs Revenge",
    segment1: "Very Aggresive",
    segment2: "Stocks Rock",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "8731175",
    status: "official-mac",
    source: "Official Fantasoft MacOS registration form supplied by user."
  },
  {
    scenarioName: "Trouble in the Sword Lands",
    segment1: "Avast Matey!",
    segment2: "Holy 28 Toes Batman",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "52358362",
    status: "official-mac",
    source: "Official Fantasoft MacOS registration form supplied by user."
  },
  {
    scenarioName: "Mithril Vault",
    segment1: "Vrap Attack!",
    segment2: "Aquahaulic",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "3247949",
    status: "official-mac",
    source: "Official Fantasoft MacOS registration form supplied by user."
  },
  {
    scenarioName: "Twin Sands of Time",
    segment1: "",
    segment2: "",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "42454079",
    status: "official-mac",
    source: "Official Fantasoft MacOS registration form supplied by user."
  },
  {
    scenarioName: "War in the Sword Lands",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "24767635",
    status: "official-mac",
    source: "Official Fantasoft MacOS registration form supplied by user."
  },
  {
    scenarioName: "Half Truth",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "31841033",
    status: "official-mac",
    source: "Official Fantasoft MacOS registration form supplied by user."
  },
  {
    scenarioName: "Wrath of the Mind Lords",
    segment1: "p38beta",
    segment2: "p38delta",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "11993502",
    status: "official-mac",
    source: "Official Fantasoft MacOS registration form supplied by user."
  },
  {
    scenarioName: "Prelude to Pestilence",
    segment1: "Macdom",
    segment2: "Norman Baites",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "1905660",
    status: "official-windows",
    source: "Official Fantasoft Windows registration form supplied by user."
  },
  {
    scenarioName: "Assault on Giant Mountain",
    segment1: "MacMade",
    segment2: "System 6.0.1",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "1840485",
    status: "official-windows",
    source: "Official Fantasoft Windows registration form supplied by user."
  },
  {
    scenarioName: "Castle in the Clouds",
    segment1: "Yah Doc",
    segment2: "Metal is our friend",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "1239074",
    status: "official-windows",
    source: "Official Fantasoft Windows registration form supplied by user."
  },
  {
    scenarioName: "Destroy the Necronomicon",
    segment1: "Ian Bobein",
    segment2: "Banana Fo Fanna",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "202458",
    status: "official-windows",
    source: "Official Fantasoft Windows registration form supplied by user."
  },
  {
    scenarioName: "White Dragon",
    segment1: "Tiny Worms",
    segment2: "Mystic Rainbow",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "204146",
    status: "official-windows",
    source: "Official Fantasoft Windows registration form supplied by user."
  },
  {
    scenarioName: "Grilochs Revenge",
    segment1: "Very Aggresive",
    segment2: "Stocks Rock",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "460806",
    status: "official-windows",
    source: "Official Fantasoft Windows registration form supplied by user."
  },
  {
    scenarioName: "Trouble in the Sword Lands",
    segment1: "Avast Matey!",
    segment2: "Holy 28 Toes Batman",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "1032019",
    status: "official-windows",
    source: "Official Fantasoft Windows registration form supplied by user."
  },
  {
    scenarioName: "Mithril Vault",
    segment1: "Vrap Attack!",
    segment2: "Aquahaulic",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "109146",
    status: "official-windows",
    source: "Official Fantasoft Windows registration form supplied by user."
  },
  {
    scenarioName: "Twin Sands of Time",
    segment1: "",
    segment2: "",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "1653401",
    status: "official-windows",
    source: "Official Fantasoft Windows registration form supplied by user."
  },
  {
    scenarioName: "War in the Sword Lands",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "621043",
    status: "official-windows",
    source: "Official Fantasoft Windows registration form supplied by user."
  },
  {
    scenarioName: "Half Truth",
    registrationName: "RABREAUS",
    serialNumber: "9140886",
    expectedCode: "964355",
    status: "official-windows",
    source: "Official Fantasoft Windows registration form supplied by user."
  },
  {
    scenarioName: "Prelude to Pestilence",
    segment1: "Macdom",
    segment2: "Norman Baites",
    registrationName: "JONESC",
    serialNumber: "9515615",
    expectedCode: "1398120",
    status: "official-mac",
    source: "Official Fantasoft MacOS registration form supplied by user."
  },
  {
    scenarioName: "Assault on Giant Mountain",
    segment1: "MacMade",
    segment2: "System 6.0.1",
    registrationName: "JONESC",
    serialNumber: "9515615",
    expectedCode: "3204672",
    status: "official-mac",
    source: "Official Fantasoft MacOS registration form supplied by user."
  },
  {
    scenarioName: "Castle In The Clouds",
    segment1: "Yah Doc",
    segment2: "Metal is our friend",
    registrationName: "JONESC",
    serialNumber: "9515615",
    expectedCode: "1442844",
    status: "official-mac",
    source: "Official Fantasoft MacOS registration form supplied by user."
  },
  {
    scenarioName: "Destroy The Necronomicon",
    segment1: "Ian Bobein",
    segment2: "Banana Fo Fanna",
    registrationName: "JONESC",
    serialNumber: "9515615",
    expectedCode: "276995",
    status: "official-mac",
    source: "Official Fantasoft MacOS registration form supplied by user."
  },
  {
    scenarioName: "White Dragon",
    segment1: "Tiny Worms",
    segment2: "Mystic Rainbow",
    registrationName: "JONESC",
    serialNumber: "9515615",
    expectedCode: "412608",
    status: "official-mac",
    source: "Official Fantasoft MacOS registration form supplied by user."
  },
  {
    scenarioName: "Griloch's Revenge",
    segment1: "Very Aggresive",
    segment2: "Stocks Rock",
    registrationName: "JONESC",
    serialNumber: "9515615",
    expectedCode: "481007",
    status: "official-mac",
    source: "Official Fantasoft MacOS registration form supplied by user."
  },
  {
    scenarioName: "War in the Sword Lands",
    registrationName: "AMBERK",
    serialNumber: "13706024",
    expectedCode: "933071",
    status: "reported",
    source: "User-supplied War in the Sword Lands code with Realmz registration code 7995820 and verification code 410."
  }
];

export function registrationVariantsFor(input: RegistrationInput): RegistrationVariant[] {
  const serial = parseSerialNumber(input.serialNumber);
  const registrationName = cleanRegistrationName(input.registrationName);
  if (serial === null || !registrationName.trim()) return [];

  const normalizedInput = {
    ...input,
    registrationName,
    segment1: cleanSecuritySegment(input.segment1),
    segment2: cleanSecuritySegment(input.segment2)
  };
  const rawVariants: RegistrationVariant[] = [];
  const scenarioSlot = input.scenarioSlot ?? officialScenarioSlotFor(input.scenarioName);
  if (
    scenarioSlot !== null
    && input.recLevel !== undefined
    && input.maxLevel !== undefined
    && input.recLevel !== 0
  ) {
    rawVariants.push(
      {
        algorithmId: "pcBundledV71",
        label: "Windows bundled scenario",
        confidence: "candidate",
        code: String(pcBundledV71(normalizedInput, serial, scenarioSlot, input.recLevel, input.maxLevel)),
        detail: "Source path: regscen_pc in Realmz main.c for Fantasoft menu scenarios."
      },
      {
        algorithmId: "macBundledClassic",
        label: scenarioSlot <= 14 ? "Mac bundled scenario" : "Mac bundled scenario (unresolved later-slot branch)",
        confidence: "candidate",
        code: String(macBundledClassic(normalizedInput, serial, scenarioSlot, input.recLevel, input.maxLevel)),
        detail: scenarioSlot <= 14
          ? "Source path: legacy regscen bundled scenario branch before the later-slot bit switch."
          : "Source path: legacy regscen bundled scenario branch; later-slot bit switch still needs compiled-runtime confirmation."
      }
    );
  }
  rawVariants.push(
    {
      algorithmId: "pcCustomV71",
      label: "PC v7.1 custom",
      confidence: "candidate",
      code: String(pcCustomV71(normalizedInput, serial)),
      detail: "Source path: regscen_pc_custom in Realmz main.c."
    },
    {
      algorithmId: "macCustomLegacy",
      label: "Mac classic custom",
      confidence: "candidate",
      code: String(macCustomLegacy(normalizedInput, serial)),
      detail: "Source path: third-party scenario branch in legacy regscen."
    }
  );

  const evidences = matchingEvidenceVectors(normalizedInput);
  if (evidences.length === 0) return rawVariants;

  const matched = rawVariants.map((variant) =>
    evidences.some((evidence) => variant.code === evidence.expectedCode)
      ? {
          ...variant,
          confidence: "verified" as const,
          detail: `${variant.detail} Matches reported vector.`
        }
      : variant
  );
  const matchedCodes = new Set(matched.filter((variant) => variant.confidence === "verified").map((variant) => variant.code));

  return [
    ...matched,
    ...evidences
      .filter((evidence) => !matchedCodes.has(evidence.expectedCode))
      .map((evidence): RegistrationVariant => ({
      algorithmId: evidence.status === "official-mac"
        ? "officialMacEvidence"
        : evidence.status === "official-windows"
          ? "officialWindowsEvidence"
          : "reportedEvidence",
      label: evidence.status === "official-mac"
        ? "Official Fantasoft Mac code"
        : evidence.status === "official-windows"
          ? "Official Fantasoft Windows code"
          : "Reported external vector",
      confidence: evidence.status === "reported" ? "reported-unmatched" : "verified",
      code: evidence.expectedCode,
      detail: evidence.status === "reported"
        ? evidence.source
        : `${evidence.source} This is verified form evidence, but no source-ported candidate currently reproduces it for this scenario/name/serial.`
    }))
  ];
}

export function officialScenarioSlotFor(scenarioName: string) {
  return OFFICIAL_SCENARIO_SLOTS.get(normalizeGeneralText(scenarioName)) ?? null;
}

export function pcBundledV71(
  input: Omit<RegistrationInput, "serialNumber">,
  serial: number,
  scenarioSlot: number,
  recLevel: number,
  maxLevel: number
) {
  const nameValue = pcNameValue(serial, input.registrationName);
  const serialValue = cDiv(serial, (scenarioSlot - 5) * 666);
  if (serialValue === 0 || nameValue === 0 || recLevel === 0) return 0;
  const part1 = toInt32(256 * cMod(512 + serialValue, 128 * nameValue));
  const part2 = toInt32(1024 + cMod(1024 + nameValue, 512 * serialValue));
  const registrationValue = toInt32(part1 + part2);
  let registrationCode = registrationValue;
  registrationCode = toInt32(registrationCode * maxLevel);
  registrationCode = toInt32(registrationCode - 512);
  registrationCode = cDiv(registrationCode, recLevel);
  registrationCode = toInt32(registrationCode + 18);
  return registrationCode;
}

export function macBundledClassic(
  input: Omit<RegistrationInput, "serialNumber">,
  serial: number,
  scenarioSlot: number,
  recLevel: number,
  maxLevel: number
) {
  if (recLevel === 0) return 0;
  let serialNumber = 0;
  if (scenarioSlot === 13 || scenarioSlot > 14) {
    serialNumber = cDiv(serial, (scenarioSlot - 5) * 666);
  }
  if (scenarioSlot > 14) {
    serialNumber = toInt32(serialNumber + macLaterBundledBitSwitch(input.registrationName, serial, serialNumber, scenarioSlot));
  }

  let tempValue = stringToNumMasked(pascalStringBytes(cleanRegistrationName(input.registrationName)));
  tempValue = cDiv(tempValue, recLevel);
  tempValue = toInt32(tempValue + 24);
  tempValue = toInt32(tempValue * maxLevel);
  tempValue = toInt32(tempValue - 256);
  let base = tempValue < 0 ? toInt32(-tempValue) : tempValue;
  base = toInt32(base + 100);
  return toInt32(base + serialNumber);
}

export function pcCustomV71(input: Omit<RegistrationInput, "serialNumber">, serial: number) {
  const nameValue = pcNameValue(serial, input.registrationName);

  const serialValue = cDiv(serial, 333);
  if (serialValue === 0 || nameValue === 0) return 0;
  const part1 = toInt32(512 * cMod(450 + serialValue, 96 * nameValue));
  const part2 = toInt32(999 + cMod(999 + nameValue, 456 * serialValue));
  let code = toInt32(part1 + part2);

  for (const char of cleanSecuritySegment(input.segment1).toLowerCase()) {
    code = toInt32(code + toInt16(1689 * toInt16(char.charCodeAt(0))));
  }
  for (const char of cleanSecuritySegment(input.segment2).toLowerCase()) {
    code = toInt32(code - toInt16(423 * toInt16(char.charCodeAt(0))));
  }
  for (const char of cleanAsciiText(input.scenarioName).toLowerCase()) {
    code = toInt32(code + Math.imul(112233, char.charCodeAt(0)));
  }
  return code;
}

export function macCustomLegacy(input: Omit<RegistrationInput, "serialNumber">, serial: number) {
  const segment1 = cStringBytes(cleanSecuritySegment(input.segment1), SECURITY_SEGMENT_LENGTH);
  const segment2 = cStringBytes(cleanSecuritySegment(input.segment2), SECURITY_SEGMENT_LENGTH);
  const registrationName = pascalStringBytes(cleanRegistrationName(input.registrationName));

  let regcode = macBitClear(serial, 8);
  const segmentCompareLength = Math.min(cStringLength(segment1), cStringLength(segment2));
  for (let index = 0; index < segmentCompareLength; index += 1) {
    regcode = toInt32(regcode + signedByte(segment1[index]) - signedByte(segment2[index]));
  }
  regcode = toInt32(regcode + stringToNumMasked(registrationName));
  regcode = toInt32(regcode + stringToNumMasked(pascalStringBytes(input.scenarioName)));

  const serialString = cStringBytes(String(serial), 64);
  const segment1Pascal = cStringToPascal(segment1);
  const segment2Pascal = cStringToPascal(segment2);
  const primer1 = 32 - (registrationName[0] % 4);
  const primer2 = 31 - (segment1Pascal[0] % 3);
  const primer3 = 30 - (segment2Pascal[0] % 5);

  for (let index = 1; index <= registrationName[0]; index += 1) {
    registrationName[index] = asciiLower(registrationName[index]);
  }

  for (let index = 1; index <= registrationName[0]; index += 1) {
    const byte = registrationName[index];
    regcode = myrBitTestLong(regcode, byte % primer2)
      ? myrBitClearLong(regcode, byte % primer2 + 2)
      : myrBitSetLong(regcode, byte % primer2 + 1);
  }

  // Realmz calls MyrNumToString here, which leaves a C string, then iterates it
  // as if it were Pascal. Preserve that oddity because registration code paths
  // depend on historical bugs as much as intended math.
  const serialLoopCount = serialString[0] ?? 0;
  for (let index = 1; index <= serialLoopCount; index += 1) {
    const byte = serialString[index] ?? 0;
    regcode = myrBitTestLong(regcode, byte % primer1 + 2)
      ? myrBitClearLong(regcode, byte % primer1 + 1)
      : myrBitSetLong(regcode, byte % primer1);
  }

  for (let index = 1; index <= segment1Pascal[0]; index += 1) {
    const byte = segment1Pascal[index];
    regcode = myrBitTestLong(regcode, byte % primer3 + 2)
      ? myrBitClearLong(regcode, byte % primer3)
      : myrBitSetLong(regcode, byte % primer3 + 1);
  }

  for (let index = 1; index <= segment2Pascal[0]; index += 1) {
    const byte = segment2Pascal[index];
    regcode = myrBitTestLong(regcode, byte % primer1)
      ? myrBitClearLong(regcode, byte % primer2)
      : myrBitSetLong(regcode, byte % primer3);
  }

  return regcode < 0 ? toInt32(-regcode) : regcode;
}

export function matchingEvidenceVector(input: Omit<RegistrationInput, "serialNumber"> & { serialNumber: string }) {
  return matchingEvidenceVectors(input)[0] ?? null;
}

export function matchingEvidenceVectors(input: Omit<RegistrationInput, "serialNumber"> & { serialNumber: string }) {
  const serial = parseSerialNumber(input.serialNumber);
  if (serial === null) return [];
  return REGISTRATION_EVIDENCE_VECTORS.filter((vector) =>
    sameGeneralText(vector.scenarioName, input.scenarioName)
    && (vector.segment1 === undefined || sameSecurityText(vector.segment1, input.segment1))
    && (vector.segment2 === undefined || sameSecurityText(vector.segment2, input.segment2))
    && sameGeneralText(vector.registrationName, input.registrationName)
    && Number(vector.serialNumber) === serial
  );
}

export function decodeSecuritySegments(shell: SecuritySegmentShell, securityBackup: SecuritySegmentShell | null) {
  const stored1 = normalizedSecurityBytes(shell.codeseg1);
  const stored2 = normalizedSecurityBytes(shell.codeseg2);
  const mask1 = normalizedSecurityBytes(securityBackup?.codeseg1);
  const decoded2 = stored2.map((byte, index) => subtractByte(byte, mask1[index]));
  const decoded1 = stored1.map((byte, index) => subtractByte(byte, decoded2[index]));
  if (!securityBackup) {
    return {
      segment1: bytesToSecurityText(stored1),
      segment2: bytesToSecurityText(stored2)
    };
  }
  return {
    segment1: bytesToSecurityText(decoded1),
    segment2: bytesToSecurityText(decoded2)
  };
}

export function encodeSecuritySegments(segment1: string, segment2: string, securityBackup: SecuritySegmentShell | null) {
  const plain1 = securityTextToBytes(segment1);
  const plain2 = securityTextToBytes(segment2);
  const backupCodeseg1 = normalizedSecurityBytes(securityBackup?.codeseg1);
  const backupCodeseg2 = normalizedSecurityBytes(securityBackup?.codeseg2);
  return {
    codeseg1: plain1.map((byte, index) => addByte(byte, plain2[index])),
    codeseg2: plain2.map((byte, index) => addByte(byte, backupCodeseg1[index])),
    backupCodeseg1,
    backupCodeseg2
  };
}

export function normalizedSecurityBytes(bytes: number[] | undefined | null) {
  return Array.from({ length: SECURITY_SEGMENT_LENGTH }, (_, index) => ((bytes?.[index] ?? 0) & 0xff));
}

export function securityTextToBytes(value: string) {
  const clean = cleanSecuritySegment(value);
  return Array.from({ length: SECURITY_SEGMENT_LENGTH }, (_, index) => {
    const code = clean.charCodeAt(index);
    return Number.isFinite(code) ? code & 0xff : 0;
  });
}

export function bytesToSecurityText(bytes: number[]) {
  const normalized = normalizedSecurityBytes(bytes);
  const end = normalized.findIndex((byte) => byte === 0);
  return normalized
    .slice(0, end === -1 ? SECURITY_SEGMENT_LENGTH : end)
    .map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ""))
    .join("");
}

export function cleanSecuritySegment(value: string) {
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code <= 126;
    })
    .slice(0, SECURITY_SEGMENT_LENGTH)
    .join("");
}

export function cleanRegistrationName(value: string) {
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code <= 126;
    })
    .slice(0, 26)
    .join("");
}

export function stringToNumMasked(pascalBytes: number[]) {
  let value = 0;
  const length = pascalBytes[0] ?? 0;
  const negative = length > 0 && pascalBytes[1] === 45;
  for (let index = 0; index < length; index += 1) {
    value = toInt32(Math.imul(value, 10) + ((pascalBytes[index + 1] ?? 0) & 0x0f));
  }
  return negative ? toInt32(-value) : value;
}

export function pascalStringBytes(value: string) {
  const bytes = asciiBytes(value).slice(0, 255);
  return [bytes.length, ...bytes];
}

export function cStringToPascal(bytes: number[]) {
  const length = cStringLength(bytes);
  return [length, ...bytes.slice(0, length)];
}

function parseSerialNumber(value: string) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || !Number.isInteger(serial) || serial === 0) return null;
  return toInt32(serial);
}

function pcNameValue(serial: number, registrationName: string) {
  const name = cleanRegistrationName(registrationName).toLowerCase();
  let nameValue = toInt32(serial);
  for (let index = 1; index < name.length; index += 1) {
    const current = name.charCodeAt(index);
    const previous = name.charCodeAt(index - 1);
    if (current) {
      nameValue = toInt32(nameValue + index * current);
      nameValue = toInt32(nameValue - current * previous);
    }
  }
  return nameValue;
}

function macLaterBundledBitSwitch(registrationName: string, serial: number, serialNumber: number, scenarioSlot: number) {
  const tempword = cStringBytes(cleanRegistrationName(registrationName), 27);
  let regcode = stringToNumMasked(pascalStringBytes(cleanRegistrationName(registrationName)));
  let temp = 0;
  for (let index = 0; index < 26; index += 1) {
    tempword[index] = asciiLower(tempword[index]);
    if (tempword[index] === 0) break;
    if (tempword[index] === 32) tempword[index] = 0x80;
    temp = tempword[index] - 97;
    regcode = myrBitTestLong(regcode, temp)
      ? myrBitClearLong(regcode, temp)
      : myrBitSetLong(regcode, temp);
  }

  const serialPascal = pascalStringBytes(String(serial));
  for (let index = 1; index <= serialPascal[0]; index += 1) {
    const bit = serialPascal[index] + serialPascal[index] + index - 95;
    regcode = bitTestByMacMemoryOrder(regcode, bit)
      ? bitClearByMacMemoryOrder(regcode, bit)
      : bitSetByMacMemoryOrder(regcode, bit);
  }

  if (scenarioSlot === 21) {
    return serialNumber ? toInt32(cMod(regcode, serialNumber) * serialPascal[0]) : 0;
  }
  if (!serialNumber) return 0;
  const serialLast = serialPascal[serialPascal[0]] ?? 0;
  const first = cMod(256 + 1024 * serialPascal[0], 69 + serialLast);
  const second = cMod(1024 + 256 * serialPascal[0], 96 + serialLast);
  const inner = toInt32(cMod(regcode, serialNumber) * (tempword[0] * temp * Math.abs((tempword[2] ?? 0) - (tempword[1] ?? 0))));
  return toInt32(first + second * Math.abs(inner));
}

function cStringBytes(value: string, width: number) {
  const bytes = asciiBytes(value).slice(0, Math.max(0, width - 1));
  return [...bytes, 0, ...new Array(Math.max(0, width - bytes.length - 1)).fill(0)];
}

function cStringLength(bytes: number[]) {
  const end = bytes.findIndex((byte) => byte === 0);
  return end === -1 ? bytes.length : end;
}

function asciiBytes(value: string) {
  return Array.from(value).map((char) => char.charCodeAt(0) & 0xff);
}

function asciiLower(byte: number) {
  return byte >= 65 && byte <= 90 ? byte + 32 : byte;
}

function signedByte(byte: number) {
  const normalized = byte & 0xff;
  return normalized > 127 ? normalized - 256 : normalized;
}

function addByte(left: number, right: number) {
  return (left + right) & 0xff;
}

function subtractByte(left: number, right: number) {
  return (left - right + 256) & 0xff;
}

function sameSecurityText(left: string, right: string) {
  return cleanSecuritySegment(left).toLowerCase() === cleanSecuritySegment(right).toLowerCase();
}

function sameGeneralText(left: string, right: string) {
  return normalizeGeneralText(left) === normalizeGeneralText(right);
}

function cleanAsciiText(value: string) {
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code <= 126;
    })
    .join("");
}

function normalizeGeneralText(value: string) {
  return cleanAsciiText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function macBitClear(value: number, bit: number) {
  return bitClearByMacMemoryOrder(value, bit);
}

function bitClearByMacMemoryOrder(value: number, bit: number) {
  const bytes = int32ToBigEndianBytes(value);
  bytes[bit >> 3] &= ~(0x80 >> (bit & 7)) & 0xff;
  return bigEndianBytesToInt32(bytes);
}

function bitTestByMacMemoryOrder(value: number, bit: number) {
  const bytes = int32ToBigEndianBytes(value);
  return (bytes[bit >> 3] & (0x80 >> (bit & 7))) !== 0;
}

function bitSetByMacMemoryOrder(value: number, bit: number) {
  const bytes = int32ToBigEndianBytes(value);
  bytes[bit >> 3] |= (0x80 >> (bit & 7)) & 0xff;
  return bigEndianBytesToInt32(bytes);
}

function myrBitTestLong(value: number, bit: number) {
  return (value >>> 0 & (1 << (31 - bit))) !== 0;
}

function myrBitSetLong(value: number, bit: number) {
  return toInt32((value >>> 0) | (1 << (31 - bit)));
}

function myrBitClearLong(value: number, bit: number) {
  return toInt32((value >>> 0) & ~(1 << (31 - bit)));
}

function int32ToBigEndianBytes(value: number) {
  const unsigned = value >>> 0;
  return [
    (unsigned >>> 24) & 0xff,
    (unsigned >>> 16) & 0xff,
    (unsigned >>> 8) & 0xff,
    unsigned & 0xff
  ];
}

function bigEndianBytesToInt32(bytes: number[]) {
  return toInt32(
    ((bytes[0] ?? 0) << 24)
    | ((bytes[1] ?? 0) << 16)
    | ((bytes[2] ?? 0) << 8)
    | (bytes[3] ?? 0)
  );
}

function cDiv(left: number, right: number) {
  return Math.trunc(left / right);
}

function cMod(left: number, right: number) {
  return left - cDiv(left, right) * right;
}

function toInt32(value: number) {
  return value | 0;
}

function toInt16(value: number) {
  const normalized = value & 0xffff;
  return normalized > 0x7fff ? normalized - 0x10000 : normalized;
}

const OFFICIAL_SCENARIO_SLOTS = new Map<string, number>([
  ["cityofbywater", 10],
  ["preludetopestilence", 11],
  ["assaultongiantmountain", 12],
  ["destroythenecronomicon", 13],
  ["castleintheclouds", 14],
  ["grilochsrevenge", 15],
  ["whitedragon", 16],
  ["mithrilvault", 17],
  ["twinsandsoftime", 18],
  ["troubleintheswordlands", 19],
  ["warintheswordlands", 20],
  ["halftruth", 21],
  ["wrathofthemindlords", 21]
]);
