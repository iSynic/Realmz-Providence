import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const catalogPath = resolve(root, "schemas/remake-scenario-capabilities.v2.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const sourceNames = new Map();

for (const operation of catalog.operations ?? []) {
  const original = String(operation.example ?? "").trim();
  const existingSourceName = String(operation.editor?.sourceName ?? "");
  if (original.startsWith("func example_") && existingSourceName) {
    const owner = sourceNames.get(existingSourceName);
    if (owner && owner !== operation.id) {
      throw new Error(
        `Scenario API source name ${existingSourceName} is shared by ${owner} and ${operation.id}`
      );
    }
    sourceNames.set(existingSourceName, operation.id);
    continue;
  }
  const call = [...original.matchAll(/\b(?:await\s+)?([a-z_][a-z0-9_]*)\s*\(/g)];
  if (call.length !== 1) {
    throw new Error(
      `Operation ${operation.id} needs one callable example before it can be normalized`
    );
  }
  const sourceName = call[0][1];
  const owner = sourceNames.get(sourceName);
  if (owner && owner !== operation.id) {
    throw new Error(
      `Scenario API source name ${sourceName} is shared by ${owner} and ${operation.id}`
    );
  }
  sourceNames.set(sourceName, operation.id);
  operation.editor = { ...(operation.editor ?? {}), sourceName };

  const callArguments = invocationArguments(original, sourceName);
  const parameters = Object.entries(operation.parameters ?? {});
  const declarations = [];
  const declaredNames = new Set();
  for (let index = 0; index < callArguments.length; index += 1) {
    const argument = callArguments[index].trim();
    if (!/^[a-z_][a-z0-9_]*$/.test(argument)) continue;
    if (["true", "false", "null"].includes(argument) || declaredNames.has(argument)) {
      continue;
    }
    const parameterType = String(parameters[index]?.[1] ?? "variant");
    declarations.push(
      `    var ${argument}: ${safeType(parameterType)} = ${defaultValue(parameterType)}`
    );
    declaredNames.add(argument);
  }

  let statement = original;
  if (
    operation.result !== "void"
    && operation.result !== "variant"
    && /^var\s+[a-z_][a-z0-9_]*\s*=/.test(statement)
  ) {
    statement = statement.replace(
      /^(var\s+[a-z_][a-z0-9_]*)(\s*=)/,
      `$1: ${safeType(operation.result)}$2`
    );
  }
  operation.example = [
    `func example_${sourceName}() -> void:`,
    ...declarations,
    ...statement.split(/\r?\n/).map((line) => `    ${line}`),
    "    return"
  ].join("\n");
}

await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(
  `Generated ${catalog.operations.length} compiling Scenario API operation examples.`
);

function invocationArguments(source, sourceName) {
  const start = source.indexOf(`${sourceName}(`);
  if (start < 0) return [];
  const open = start + sourceName.length;
  let depth = 0;
  let quote = "";
  let escaped = false;
  let argumentStart = open + 1;
  const arguments_ = [];
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(" || character === "[") depth += 1;
    if (character === ")" || character === "]") depth -= 1;
    if (character === "," && depth === 1) {
      arguments_.push(source.slice(argumentStart, index));
      argumentStart = index + 1;
    }
    if (character === ")" && depth === 0) {
      const finalArgument = source.slice(argumentStart, index).trim();
      if (finalArgument) arguments_.push(finalArgument);
      return arguments_;
    }
  }
  throw new Error(`Example invocation ${sourceName} has unbalanced delimiters`);
}

function safeType(value) {
  const normalized = String(value).replace(/\?$/, "");
  const aliases = {
    string: "String",
    "string-array": "Array[String]",
    "CharacterSnapshot-array": "Array[CharacterSnapshot]",
    "ItemInstanceSnapshot-array": "Array[ItemInstanceSnapshot]",
    variant: "String"
  };
  return aliases[normalized] ?? normalized;
}

function defaultValue(value) {
  const normalized = String(value).replace(/\?$/, "");
  if (normalized === "bool") return "false";
  if (normalized === "int") return "1";
  if (normalized === "float") return "1.0";
  if (normalized === "string-array") return '["Example"]';
  return '""';
}
