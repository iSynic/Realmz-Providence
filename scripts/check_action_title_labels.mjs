import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const actionsPath = path.join(root, "src/editor/realmzActions.ts");
const helpPath = path.join(root, "src/editor/generated/divinityOpcodeHelp.json");

const actionsSource = fs.readFileSync(actionsPath, "utf8");
const helpData = JSON.parse(fs.readFileSync(helpPath, "utf8"));

const failures = [];

if (!actionsSource.includes("divinityHelpForOpcode")) {
  failures.push("realmzActions.ts does not derive action titles from Divinity opcode help.");
}
for (const field of ["officialTitle", "displayTitle", "aliasTitle"]) {
  if (!actionsSource.includes(field)) failures.push(`RealmzActionOption is missing ${field}.`);
}

const actionDetails = new Map();
for (const match of actionsSource.matchAll(/^\s*(-?\d+): \{ shortLabel: "([^"]+)"/gm)) {
  actionDetails.set(Number(match[1]), match[2]);
}

const preservedCodes = new Set();
const preserveMatch = actionsSource.match(/PRESERVE_CURRENT_LABEL_CODES = new Set\(\[([^\]]*)\]\)/);
for (const value of preserveMatch?.[1]?.match(/-?\d+/g) ?? []) {
  preservedCodes.add(Number(value));
}

function officialTitleFor(code) {
  const lookupCode = code < 0 && code !== -14 && code !== -23 ? -code : code;
  const resourceId = helpData.byCode[String(lookupCode)]?.[0];
  return helpData.entries.find((entry) => entry.resourceId === resourceId)?.title;
}

function displayTitleFor(code) {
  const fallback = actionDetails.get(code) ?? `Opcode ${code}`;
  const official = officialTitleFor(code);
  return official && !preservedCodes.has(code) ? official : fallback;
}

const expectedTitles = new Map([
  [1, "Display String"],
  [7, "Change Action Point Codes"],
  [24, "Exit Action Point And Keep Codes"],
  [35, "Eliminate Simple Encounter Option"],
  [50, "Pick On Race • Caste • Race Class • Caste Class • Gender"],
  [101, "Back Up Party"]
]);

for (const [code, expected] of expectedTitles) {
  const actual = displayTitleFor(code);
  if (actual !== expected) failures.push(`Opcode ${code} displays "${actual}", expected "${expected}".`);
}

if (displayTitleFor(84) !== "Registration Check?") {
  failures.push("Opcode 84 should keep the discrepancy label instead of becoming the manual Not Used title.");
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Action title label checks passed.");
