import SCENARIO_API_CATALOG_JSON from "../../schemas/remake-scenario-capabilities.v2.json";
import type {
  RemakeBehaviorDefinition,
  RemakeStateDefinition,
  RemakeScriptValueType
} from "./types";

export type SafeScriptDiagnostic = {
  line: number;
  column: number;
  message: string;
};

export type SafeScriptParseResult = {
  program: Record<string, unknown> | null;
  sourceMap: Record<string, unknown>;
  requestedCapabilities: string[];
  diagnostics: SafeScriptDiagnostic[];
};

type JsonNode = Record<string, unknown>;
type SourceLine = { number: number; indent: number; text: string };
type Token = { text: string; column: number };
type OperationSpec = {
  capability: string;
  names: readonly string[];
  optionalNames?: readonly string[];
  result: string;
  fixed?: Record<string, string>;
  yields?: boolean;
};

type CatalogOperation = {
  id: string;
  roles: string[];
  yields: boolean;
  mutates: boolean;
  parameters: Record<string, string | undefined>;
  result: string;
  editor?: { sourceName?: string };
};

type CatalogTypeDefinition = {
  id: string;
  fields: Record<string, string>;
};

const CATALOG_OPERATION_ROWS =
  SCENARIO_API_CATALOG_JSON.operations as CatalogOperation[];
const CATALOG_TYPE_FIELDS = new Map<RemakeScriptValueType, Record<string, RemakeScriptValueType | "unknown">>(
  (SCENARIO_API_CATALOG_JSON.types as unknown as CatalogTypeDefinition[]).map((definition) => [
    scriptTypeForCatalogType(definition.id) as RemakeScriptValueType,
    Object.fromEntries(Object.entries(definition.fields).map(([name, type]) => [
      name,
      scriptTypeForCatalogType(type)
    ]))
  ])
);

const BASE_OPERATION_SPECS: Record<string, OperationSpec> = {
  read_state: { capability: "core.state.read", names: ["scope", "name"], optionalNames: ["ownerId"], result: "dynamic" },
  write_state: { capability: "core.state.write", names: ["scope", "name", "value"], optionalNames: ["ownerId"], result: "void" },
  read_quest: { capability: "core.state.read", names: ["id"], result: "int", fixed: { scope: "quest" } },
  write_quest: { capability: "core.state.write", names: ["id", "value"], result: "void", fixed: { scope: "quest" } },
  read_variable: { capability: "core.state.read", names: ["name"], result: "dynamic", fixed: { scope: "campaign" } },
  write_variable: { capability: "core.state.write", names: ["name", "value"], result: "void", fixed: { scope: "campaign" } },
  current_location: { capability: "core.map.location", names: [], result: "location-snapshot", yields: true },
  current_time: { capability: "core.map.time", names: [], result: "time-snapshot", yields: true },
  party_wealth: { capability: "core.inventory.wealth", names: [], result: "wealth-snapshot", yields: true },
  party_members: { capability: "core.character.party", names: [], result: "character-snapshot-array", yields: true },
  combat_snapshot: { capability: "core.combat.snapshot", names: [], result: "combat-snapshot", yields: true },
  show_text: { capability: "core.presentation.text", names: ["text"], result: "void", yields: true },
  choose: { capability: "core.presentation.choice", names: ["prompt", "options"], result: "int", yields: true },
  show_picture: { capability: "core.presentation.picture", names: ["pictureId"], result: "void", yields: true },
  play_sound: { capability: "core.presentation.sound", names: ["soundId"], optionalNames: ["wait"], result: "void", yields: true },
  teleport: { capability: "core.map.teleport", names: ["levelType", "levelIndex", "x", "y"], result: "void", yields: true },
  set_map_tile: { capability: "core.map.set-tile", names: ["levelType", "levelIndex", "x", "y", "tile"], result: "void", yields: true },
  advance_time: { capability: "core.map.advance-time", names: ["seconds"], result: "time-snapshot", yields: true },
  take_wealth: { capability: "core.inventory.take-wealth", names: ["gold"], optionalNames: ["gems", "jewelry", "showWarning"], result: "bool", yields: true },
  party_has_item: { capability: "core.inventory.has-item", names: ["itemId"], optionalNames: ["minimumCharges"], result: "bool", yields: true },
  give_treasure: { capability: "core.inventory.give-treasure", names: ["treasureId"], result: "void", yields: true },
  party_has_condition: { capability: "core.character.party-condition", names: ["conditionIndex"], result: "bool", yields: true },
  change_health: { capability: "core.character.change-health", names: ["amount"], optionalNames: ["canKill"], result: "void", yields: true },
  give_experience: { capability: "core.character.give-experience", names: ["amount"], optionalNames: ["selectedOnly"], result: "void", yields: true },
  start_encounter: { capability: "core.encounter.start", names: ["encounterKind", "encounterId"], result: "int", yields: true },
  start_battle: { capability: "core.encounter.start-battle", names: ["battleId"], result: "void", yields: true },
  apply_damage: { capability: "core.combat.damage", names: ["targetId", "amount", "damageType"], result: "int", yields: true },
  apply_healing: { capability: "core.combat.heal", names: ["targetId", "amount"], result: "int", yields: true },
  roll: { capability: "core.rng.roll", names: ["maximum"], result: "int" }
};

const OPERATION_SPECS: Record<string, OperationSpec> = {
  ...BASE_OPERATION_SPECS,
  ...Object.fromEntries(CATALOG_OPERATION_ROWS.map((operation) => {
    const required: string[] = [];
    const optional: string[] = [];
    for (const [name, type] of Object.entries(operation.parameters)) {
      (String(type).endsWith("?") ? optional : required).push(name);
    }
    const sourceName = operation.editor?.sourceName
      ?? operation.id.replace(/^core\./, "").replace(/[.-]/g, "_");
    return [sourceName, {
      capability: operation.id,
      names: required,
      ...(optional.length > 0 ? { optionalNames: optional } : {}),
      result: scriptTypeForCatalogType(operation.result),
      yields: operation.yields
    } satisfies OperationSpec];
  }))
};

const CATALOG_OPERATIONS = new Map(
  CATALOG_OPERATION_ROWS.map((operation) => [operation.id, operation])
);

const CATALOG_ROLES = new Map(
  (SCENARIO_API_CATALOG_JSON.roles as Array<{
    id: string;
    allowsYield: boolean;
    pureHooks?: string[];
  }>).map((role) => [role.id, role])
);

type OperationName = string;

export function parseSafeScript(
  source: string,
  script: Pick<RemakeBehaviorDefinition, "id" | "parameters" | "returnType" | "role" | "hook">,
  knownScripts: readonly RemakeBehaviorDefinition[] = [],
  persistentVariables: readonly RemakeStateDefinition[] = []
): SafeScriptParseResult {
  const diagnostics: SafeScriptDiagnostic[] = [];
  const sourceMap: Record<string, unknown> = {};
  const capabilities = new Set<string>();
  const lines = meaningfulLines(source);
  if (lines.length === 0) {
    return failed(1, "A safe script requires one typed function.", diagnostics);
  }
  const header = parseHeader(lines[0].text);
  if (!header) {
    return failed(lines[0].number, "Expected 'func name(parameters) -> type:'.", diagnostics);
  }
  if (header.returnType !== script.returnType) {
    diagnostics.push(at(lines[0], `Function return type must be ${script.returnType}.`));
  }
  const declaredSignature = script.parameters.map((parameter) => `${parameter.name}:${parameter.valueType}`);
  const parsedSignature = header.parameters.map((parameter) => `${parameter.name}:${parameter.valueType}`);
  if (declaredSignature.join("|") !== parsedSignature.join("|")) {
    diagnostics.push(at(lines[0], "Function parameters must match the script definition."));
  }
  if (lines.length > 1 && lines[1].indent <= lines[0].indent) {
    diagnostics.push(at(lines[1], "Function body must be indented."));
  }
  const parser = new BlockParser(
    lines,
    diagnostics,
    sourceMap,
    capabilities,
    knownScripts,
    persistentVariables
  );
  parser.index = 1;
  const body = parser.parseBlock(lines[1]?.indent ?? 1);
  if (parser.index < lines.length) {
    diagnostics.push(at(lines[parser.index], "Unexpected indentation."));
  }
  const program = {
    kind: "function",
    name: header.name,
    parameters: header.parameters,
    returnType: header.returnType,
    body
  };
  validateSafeTypes(program, script, knownScripts, persistentVariables, diagnostics, sourceMap);
  for (const capability of capabilities) {
    const operation = CATALOG_OPERATIONS.get(capability);
    const role = CATALOG_ROLES.get(script.role);
    if (!operation) {
      diagnostics.push({ line: 1, column: 1, message: `Scenario API operation '${capability}' is unavailable.` });
    } else if (!operation.roles.includes(script.role)) {
      diagnostics.push({ line: 1, column: 1, message: `'${capability}' cannot be used by a ${script.role} behavior.` });
    } else if (operation.yields && role?.allowsYield === false) {
      diagnostics.push({ line: 1, column: 1, message: `${script.role} behaviors cannot use yielding operation '${capability}'.` });
    } else if (
      (role?.pureHooks?.includes("*") || role?.pureHooks?.includes(script.hook))
      && (operation.yields || operation.mutates)
    ) {
      diagnostics.push({ line: 1, column: 1, message: `Pure behavior hook '${script.hook}' cannot yield or mutate state.` });
    }
  }
  return {
    program: diagnostics.length === 0 ? program : null,
    sourceMap,
    requestedCapabilities: [...capabilities].sort(),
    diagnostics
  };
}

export function printSafeScript(
  program: Record<string, unknown>,
  fallbackName = "scenario_action"
): string {
  const parameters = arrayOf<JsonNode>(program.parameters)
    .map((parameter) => `${parameter.name}: ${printType(String(parameter.valueType))}`)
    .join(", ");
  const header = `func ${String(program.name || fallbackName)}(${parameters}) -> ${printType(String(program.returnType || "void"))}:`;
  const body = printStatements(arrayOf<JsonNode>(program.body), 1);
  return `${header}\n${body || "\treturn"}\n`;
}

function meaningfulLines(source: string): SourceLine[] {
  return source.replace(/\r\n?/g, "\n").split("\n").flatMap((raw, index) => {
    const expanded = raw.replace(/\t/g, "    ");
    const text = stripComment(expanded).trimEnd();
    if (!text.trim()) return [];
    return [{
      number: index + 1,
      indent: text.length - text.trimStart().length,
      text: text.trim()
    }];
  });
}

function stripComment(line: string) {
  let quote = "";
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote) {
      if (character === quote && line[index - 1] !== "\\") quote = "";
    } else if (character === "\"" || character === "'") {
      quote = character;
    } else if (character === "#") {
      return line.slice(0, index);
    }
  }
  return line;
}

function parseHeader(text: string) {
  const match = /^func\s+([a-z_][a-z0-9_]*)\s*\((.*)\)\s*->\s*([A-Za-z0-9_\[\]]+)\s*:$/.exec(text);
  if (!match) return null;
  const parameters = match[2].trim()
    ? splitArguments(match[2]).map((parameter) => {
        const part = /^([a-z_][a-z0-9_]*)\s*:\s*([A-Za-z0-9_\[\]]+)$/.exec(parameter);
        return part ? { name: part[1], valueType: parseType(part[2]), maxLength: null } : null;
      })
    : [];
  if (parameters.some((parameter) => !parameter)) return null;
  return {
    name: match[1],
    parameters: parameters as Array<{ name: string; valueType: RemakeScriptValueType; maxLength: null }>,
    returnType: parseType(match[3])
  };
}

class BlockParser {
  index = 0;
  private nodeCounter = 0;

  constructor(
    private readonly lines: SourceLine[],
    private readonly diagnostics: SafeScriptDiagnostic[],
    private readonly sourceMap: Record<string, unknown>,
    private readonly capabilities: Set<string>,
    private readonly knownScripts: readonly RemakeBehaviorDefinition[],
    private readonly persistentVariables: readonly RemakeStateDefinition[]
  ) {}

  parseBlock(indent: number): JsonNode[] {
    const result: JsonNode[] = [];
    while (this.index < this.lines.length) {
      const line = this.lines[this.index];
      if (line.indent < indent) break;
      if (line.indent > indent) {
        this.diagnostics.push(at(line, "Unexpected indentation."));
        this.index += 1;
        continue;
      }
      if (/^(elif\b|else\s*:)/.test(line.text)) break;
      const statement = this.parseStatement(line, indent);
      if (statement) result.push(statement);
    }
    return result;
  }

  private parseStatement(line: SourceLine, indent: number): JsonNode | null {
    this.index += 1;
    if (/^(while|class|class_name|signal|extends|@|lambda)\b/.test(line.text)) {
      this.diagnostics.push(at(line, "This syntax is not available in safe scripts."));
      return null;
    }
    if (line.text.startsWith("if ")) return this.parseIf(line, indent);
    if (line.text.startsWith("for ")) return this.parseFor(line, indent);
    if (line.text.startsWith("match ")) return this.parseMatch(line, indent);
    if (line.text === "return") return this.node(line, { kind: "return" });
    if (line.text.startsWith("return ")) {
      return this.node(line, { kind: "return", value: parseExpression(line.text.slice(7), line, this.diagnostics) });
    }
    const declaration = /^var\s+([a-z_][a-z0-9_]*)\s*:\s*([A-Za-z0-9_\[\]]+)\s*=\s*(.+)$/.exec(line.text);
    if (declaration) {
      const target = declaration[1];
      const valueType = parseType(declaration[2]);
      const invocation = this.parseInvocation(declaration[3], line, target);
      if (invocation) {
        invocation.declaredType = valueType;
        return this.node(line, invocation);
      }
      return this.node(line, {
        kind: "declare",
        name: target,
        valueType,
        value: parseExpression(declaration[3], line, this.diagnostics)
      });
    }
    const assignment = /^(persistent\.)?([a-z_][a-z0-9_]*)\s*=\s*(.+)$/.exec(line.text);
    if (assignment) {
      const invocation = this.parseInvocation(assignment[3], line, assignment[2]);
      if (invocation) return this.node(line, invocation);
      return this.node(line, {
        kind: "assign",
        scope: assignment[1] ? "persistent" : "local",
        name: assignment[2],
        value: parseExpression(assignment[3], line, this.diagnostics)
      });
    }
    const invocation = this.parseInvocation(line.text, line, "");
    if (invocation) return this.node(line, invocation);
    this.diagnostics.push(at(line, "Expected a declaration, assignment, condition, operation, call, or return."));
    return null;
  }

  private parseIf(line: SourceLine, indent: number): JsonNode {
    const match = /^if\s+(.+)\s*:$/.exec(line.text);
    const condition = parseExpression(match?.[1] ?? "", line, this.diagnostics);
    const childIndent = this.lines[this.index]?.indent ?? indent + 1;
    if (childIndent <= indent) this.diagnostics.push(at(line, "If body must be indented."));
    const thenStatements = this.parseBlock(childIndent);
    let elseStatements: JsonNode[] = [];
    const next = this.lines[this.index];
    if (next?.indent === indent && next.text.startsWith("elif ")) {
      next.text = `if ${next.text.slice(5)}`;
      elseStatements = [this.parseStatement(next, indent)!].filter(Boolean);
    } else if (next?.indent === indent && next.text === "else:") {
      this.index += 1;
      const elseIndent = this.lines[this.index]?.indent ?? indent + 1;
      if (elseIndent <= indent) this.diagnostics.push(at(next, "Else body must be indented."));
      elseStatements = this.parseBlock(elseIndent);
    }
    return this.node(line, { kind: "if", condition, then: thenStatements, else: elseStatements });
  }

  private parseFor(line: SourceLine, indent: number): JsonNode {
    const match = /^for\s+([a-z_][a-z0-9_]*)\s+in\s+(.+)\s*:$/.exec(line.text);
    if (!match) {
      this.diagnostics.push(at(line, "Expected 'for item in bounded_array:'."));
      return this.node(line, { kind: "for", name: "item", collection: { kind: "array", values: [] }, body: [] });
    }
    const childIndent = this.lines[this.index]?.indent ?? indent + 1;
    if (childIndent <= indent) this.diagnostics.push(at(line, "For body must be indented."));
    return this.node(line, {
      kind: "for",
      name: match[1],
      collection: parseExpression(match[2], line, this.diagnostics),
      body: this.parseBlock(childIndent)
    });
  }

  private parseMatch(line: SourceLine, indent: number): JsonNode {
    const match = /^match\s+(.+)\s*:$/.exec(line.text);
    const value = parseExpression(match?.[1] ?? "", line, this.diagnostics);
    const caseIndent = this.lines[this.index]?.indent ?? indent + 1;
    if (caseIndent <= indent) this.diagnostics.push(at(line, "Match cases must be indented."));
    const cases: JsonNode[] = [];
    let defaultStatements: JsonNode[] = [];
    while (this.index < this.lines.length && this.lines[this.index].indent === caseIndent) {
      const caseLine = this.lines[this.index];
      const caseMatch = /^(.+)\s*:$/.exec(caseLine.text);
      if (!caseMatch) {
        this.diagnostics.push(at(caseLine, "Expected a match value followed by ':'."));
        this.index += 1;
        continue;
      }
      this.index += 1;
      const bodyIndent = this.lines[this.index]?.indent ?? caseIndent + 1;
      if (bodyIndent <= caseIndent) this.diagnostics.push(at(caseLine, "Match case body must be indented."));
      const statements = this.parseBlock(bodyIndent);
      if (caseMatch[1].trim() === "_") {
        defaultStatements = statements;
      } else {
        cases.push({
          pattern: parseExpression(caseMatch[1], caseLine, this.diagnostics),
          body: statements
        });
      }
    }
    return this.node(line, { kind: "match", value, cases, default: defaultStatements });
  }

  private parseInvocation(text: string, line: SourceLine, result: string): JsonNode | null {
    const awaited = text.startsWith("await ");
    const callText = awaited ? text.slice(6).trim() : text;
    const match = /^([a-z_][a-z0-9_]*)\s*\((.*)\)$/.exec(callText);
    if (!match) return null;
    const name = match[1];
    const args = splitArguments(match[2]).map((argument) => parseExpression(argument, line, this.diagnostics));
    if (name === "script_call") {
      const target = literalString(args[0]);
      const known = this.knownScripts.find((script) => script.id === target);
      if (!target || !known) {
        this.diagnostics.push(at(line, "script_call requires the ID of an available named script."));
        return null;
      }
      if (args.length - 1 !== known.parameters.length) {
        this.diagnostics.push(at(line, `Script '${target}' expects ${known.parameters.length} argument(s).`));
      }
      return {
        kind: "call",
        scriptId: target,
        arguments: Object.fromEntries(known.parameters.map((parameter, index) => [parameter.name, args[index + 1]])),
        result
      };
    }
    if (!(name in OPERATION_SPECS)) return null;
    const spec: OperationSpec = OPERATION_SPECS[name as OperationName];
    if (Boolean(spec.yields) !== awaited) {
      this.diagnostics.push(at(line, spec.yields ? `'${name}' must be awaited.` : `'${name}' does not yield and cannot be awaited.`));
    }
    const optionalNames = spec.optionalNames ?? [];
    const parameterNames = [...spec.names, ...optionalNames];
    if (args.length < spec.names.length || args.length > parameterNames.length) {
      const expected = optionalNames.length
        ? `${spec.names.length} to ${parameterNames.length}`
        : String(spec.names.length);
      this.diagnostics.push(at(line, `'${name}' expects ${expected} argument(s).`));
    }
    this.capabilities.add(spec.capability);
    return {
      kind: "operation",
      capability: spec.capability,
      arguments: {
        ...("fixed" in spec ? spec.fixed : {}),
        ...Object.fromEntries(
          parameterNames
            .slice(0, args.length)
            .map((key, index) => [key, args[index]])
        )
      },
      result
    };
  }

  private node(line: SourceLine, value: JsonNode): JsonNode {
    const id = `n${this.nodeCounter += 1}`;
    this.sourceMap[id] = { line: line.number, column: line.indent + 1 };
    return { ...value, sourceNode: id };
  }
}

function parseExpression(text: string, line: SourceLine, diagnostics: SafeScriptDiagnostic[]): JsonNode {
  try {
    return new ExpressionParser(tokenize(text)).parse();
  } catch (error) {
    diagnostics.push(at(line, error instanceof Error ? error.message : "Invalid expression."));
    return { kind: "literal", value: null };
  }
}

class ExpressionParser {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(minPrecedence = 0): JsonNode {
    let left = this.primary();
    while (this.peek() === ".") {
      this.index += 1;
      const member = this.tokens[this.index++]?.text ?? "";
      if (!/^[a-z_][a-z0-9_]*$/.test(member)) throw new Error("Expected a member name after '.'.");
      left = { kind: "member", object: left, member };
    }
    const precedence: Record<string, number> = { or: 1, and: 2, "==": 3, "!=": 3, "<": 4, "<=": 4, ">": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6 };
    while (this.index < this.tokens.length) {
      const operator = this.tokens[this.index].text;
      const strength = precedence[operator] ?? 0;
      if (strength <= minPrecedence) break;
      this.index += 1;
      left = { kind: "binary", operator, left, right: this.parse(strength) };
    }
    return left;
  }

  private primary(): JsonNode {
    const token = this.tokens[this.index++];
    if (!token) throw new Error("Expected an expression.");
    if (token.text === "not" || token.text === "-") {
      return { kind: "unary", operator: token.text, operand: this.primary() };
    }
    if (token.text === "(") {
      const value = this.parse();
      this.expect(")");
      return value;
    }
    if (token.text === "[") {
      const values: JsonNode[] = [];
      while (this.peek() !== "]") {
        values.push(this.parse());
        if (this.peek() !== ",") break;
        this.index += 1;
      }
      this.expect("]");
      if (values.length > 256) throw new Error("Arrays may contain at most 256 values.");
      return { kind: "array", values };
    }
    if (token.text === "{") {
      const fields: Record<string, JsonNode> = {};
      while (this.peek() !== "}") {
        const keyToken = this.tokens[this.index++];
        if (!keyToken) throw new Error("Expected a record field name.");
        const key = keyToken.text.startsWith("\"") || keyToken.text.startsWith("'")
          ? String(parseStringToken(keyToken.text))
          : keyToken.text;
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
          throw new Error("Record field names must be identifiers or strings.");
        }
        this.expect(":");
        fields[key] = this.parse();
        if (this.peek() !== ",") break;
        this.index += 1;
      }
      this.expect("}");
      const literalEntries = Object.entries(fields);
      if (literalEntries.every(([, value]) => value.kind === "literal")) {
        return {
          kind: "literal",
          value: Object.fromEntries(literalEntries.map(([name, value]) => [name, value.value]))
        };
      }
      return { kind: "record", fields };
    }
    if (token.text.startsWith("\"") || token.text.startsWith("'")) {
      return { kind: "literal", value: JSON.parse(token.text.startsWith("'") ? `"${token.text.slice(1, -1).replace(/"/g, "\\\"")}"` : token.text) };
    }
    if (/^-?\d+(\.\d+)?$/.test(token.text)) {
      return { kind: "literal", value: Number(token.text) };
    }
    if (token.text === "true" || token.text === "false") return { kind: "literal", value: token.text === "true" };
    if (token.text === "persistent" && this.peek() === ".") {
      this.index += 1;
      return { kind: "variable", scope: "persistent", name: this.tokens[this.index++]?.text ?? "" };
    }
    if (/^(any|all|find|count|filter)$/.test(token.text) && this.peek() === "(") {
      this.index += 1;
      const collection = this.parse();
      let itemName = "item";
      let predicate: JsonNode | undefined;
      if (this.peek() === ",") {
        this.index += 1;
        const item = this.tokens[this.index++]?.text ?? "";
        if (!/^[a-z_][a-z0-9_]*$/.test(item)) throw new Error("Collection query requires an item name.");
        itemName = item;
        this.expect(",");
        predicate = this.parse();
      }
      this.expect(")");
      return {
        kind: "collection",
        operation: token.text,
        collection,
        itemName,
        ...(predicate ? { predicate } : {})
      };
    }
    if (/^[a-z_][a-z0-9_]*$/.test(token.text)) return { kind: "variable", scope: "local", name: token.text };
    throw new Error(`Unsupported expression token '${token.text}'.`);
  }

  private peek() {
    return this.tokens[this.index]?.text;
  }

  private expect(text: string) {
    if (this.tokens[this.index++]?.text !== text) throw new Error(`Expected '${text}'.`);
  }
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\s*(==|!=|<=|>=|[()[\]{},:.+\-*/%<>]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*)/gy;
  let index = 0;
  while (index < text.length) {
    pattern.lastIndex = index;
    const match = pattern.exec(text);
    if (!match) throw new Error(`Unsupported expression near '${text.slice(index)}'.`);
    tokens.push({ text: match[1], column: index + 1 });
    index = pattern.lastIndex;
  }
  return tokens;
}

function parseStringToken(value: string) {
  return JSON.parse(
    value.startsWith("'")
      ? `"${value.slice(1, -1).replace(/"/g, "\\\"")}"`
      : value
  );
}

function splitArguments(text: string): string[] {
  if (!text.trim()) return [];
  const result: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === quote && text[index - 1] !== "\\") quote = "";
    } else if (character === "\"" || character === "'") {
      quote = character;
    } else if ("([".includes(character)) {
      depth += 1;
    } else if (")]".includes(character)) {
      depth -= 1;
    } else if (character === "," && depth === 0) {
      result.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(text.slice(start).trim());
  return result;
}

function validateSafeTypes(
  program: JsonNode,
  script: Pick<RemakeBehaviorDefinition, "parameters" | "returnType">,
  knownScripts: readonly RemakeBehaviorDefinition[],
  persistentVariables: readonly RemakeStateDefinition[],
  diagnostics: SafeScriptDiagnostic[],
  sourceMap: Record<string, unknown>
) {
  const locals = new Map(script.parameters.map((parameter) => [parameter.name, parameter.valueType]));
  const persistent = new Map(persistentVariables.map((variable) => [variable.name, variable.valueType]));
  const scripts = new Map(knownScripts.map((entry) => [entry.id, entry]));
  const compatible = (expected: RemakeScriptValueType | "unknown", actual: RemakeScriptValueType | "unknown") =>
    expected === "unknown"
      || actual === "unknown"
      || expected === actual
      || (expected === "float" && actual === "int");
  const infer = (expression: unknown, report: (message: string) => void): RemakeScriptValueType | "unknown" => {
    if (!expression || typeof expression !== "object" || Array.isArray(expression)) return "unknown";
    const node = expression as JsonNode;
    if (node.kind === "literal") {
      if (typeof node.value === "boolean") return "bool";
      if (typeof node.value === "number") return Number.isInteger(node.value) ? "int" : "float";
      if (typeof node.value === "string") return "string";
      return "unknown";
    }
    if (node.kind === "variable") {
      const scope = node.scope === "persistent" ? persistent : locals;
      const valueType = scope.get(String(node.name));
      if (!valueType) report(`Unknown ${node.scope === "persistent" ? "persistent variable" : "local"} '${node.name}'.`);
      return valueType ?? "unknown";
    }
    if (node.kind === "array") {
      const values = arrayOf<JsonNode>(node.values);
      if (values.length > 256) report("Arrays may contain at most 256 values.");
      if (!values.length) return "unknown";
      const first = infer(values[0], report);
      for (const value of values.slice(1)) {
        const current = infer(value, report);
        if (!compatible(first, current) || !compatible(current, first)) {
          report("Safe script arrays must be homogeneous.");
        }
      }
      const arrays: Partial<Record<RemakeScriptValueType, RemakeScriptValueType>> = {
        bool: "bool-array",
        int: "int-array",
        float: "float-array",
        string: "string-array"
      };
      return arrays[first as RemakeScriptValueType] ?? "unknown";
    }
    if (node.kind === "record") {
      for (const value of Object.values((node.fields ?? {}) as JsonNode)) infer(value, report);
      return "unknown";
    }
    if (node.kind === "unary") {
      const operand = infer(node.operand, report);
      if (node.operator === "not") {
        if (!compatible("bool", operand)) report("'not' requires a bool operand.");
        return "bool";
      }
      if (!["int", "float", "unknown"].includes(operand)) report("Unary '-' requires a numeric operand.");
      return operand;
    }
    if (node.kind === "binary") {
      const left = infer(node.left, report);
      const right = infer(node.right, report);
      const operator = String(node.operator);
      if (["and", "or"].includes(operator)) {
        if (!compatible("bool", left) || !compatible("bool", right)) report(`'${operator}' requires bool operands.`);
        return "bool";
      }
      if (["==", "!=", "<", "<=", ">", ">="].includes(operator)) {
        if (!compatible(left, right) && !compatible(right, left)) report(`'${operator}' compares incompatible values.`);
        return "bool";
      }
      if (operator === "+" && left === "string" && right === "string") return "string";
      if (!["int", "float", "unknown"].includes(left) || !["int", "float", "unknown"].includes(right)) {
        report(`'${operator}' requires numeric operands.`);
        return "unknown";
      }
      return left === "float" || right === "float" || operator === "/" ? "float" : "int";
    }
    if (node.kind === "member") {
      const objectType = infer(node.object, report);
      const valueType = CATALOG_TYPE_FIELDS.get(objectType as RemakeScriptValueType)?.[String(node.member)];
      if (!valueType && objectType !== "unknown") report(`'${String(node.member)}' is not a field on ${objectType}.`);
      return valueType ?? "unknown";
    }
    if (node.kind === "collection") {
      const collectionType = infer(node.collection, report);
      if (!collectionType.endsWith("-array") && collectionType !== "unknown") {
        report(`Collection query requires an array, not ${collectionType}.`);
      }
      const operation = String(node.operation);
      if (operation === "count") return "int";
      if (operation === "any" || operation === "all") return "bool";
      if (operation === "filter") return collectionType;
      return "unknown";
    }
    return "unknown";
  };
  const operationResult = (statement: JsonNode): RemakeScriptValueType | "unknown" => {
    const capability = String(statement.capability);
    const catalogResult = CATALOG_OPERATIONS.get(capability)?.result;
    const catalogTypes: Record<string, RemakeScriptValueType | "unknown"> = {
      void: "void",
      bool: "bool",
      int: "int",
      float: "float",
      string: "string",
      LocationSnapshot: "location-snapshot",
      TimeSnapshot: "time-snapshot",
      WealthSnapshot: "wealth-snapshot",
      "CharacterSnapshot-array": "character-snapshot-array",
      CombatSnapshot: "combat-snapshot"
    };
    if (catalogResult && catalogResult in catalogTypes) return catalogTypes[catalogResult];
    if (capability === "core.state.read") {
      const argumentsValue = (statement.arguments ?? {}) as JsonNode;
      const scope = literalString(argumentsValue.scope as JsonNode | undefined);
      if (scope === "quest") return "int";
      if (scope === "persistent" || scope === "campaign") {
        const name = literalString(argumentsValue.name as JsonNode | undefined);
        return persistent.get(name) ?? "unknown";
      }
      return "unknown";
    }
    return "void";
  };
  const visit = (statements: JsonNode[]) => {
    for (const statement of statements) {
      const source = sourceMap[String(statement.sourceNode)] as { line?: number; column?: number } | undefined;
      const report = (message: string) => diagnostics.push({ line: source?.line ?? 1, column: source?.column ?? 1, message });
      if (statement.kind === "declare") {
        const name = String(statement.name);
        if (locals.has(name)) report(`Local '${name}' is already declared.`);
        const declared = String(statement.valueType) as RemakeScriptValueType;
        const actual = infer(statement.value, report);
        if (!compatible(declared, actual)) report(`Local '${name}' is ${declared}, not ${actual}.`);
        locals.set(name, declared);
      } else if (statement.kind === "assign") {
        const scope = statement.scope === "persistent" ? persistent : locals;
        const name = String(statement.name);
        const expected = scope.get(name);
        if (!expected) report(`Unknown ${statement.scope === "persistent" ? "persistent variable" : "local"} '${statement.name}'.`);
        const actual = infer(statement.value, report);
        if (expected && !compatible(expected, actual)) report(`'${name}' is ${expected}, not ${actual}.`);
      } else if (statement.kind === "operation") {
        const capability = String(statement.capability);
        const operationArguments = (statement.arguments ?? {}) as JsonNode;
        const catalogArguments = CATALOG_OPERATIONS.get(capability)?.parameters ?? {};
        for (const [name, expectedCatalogType] of Object.entries(catalogArguments)) {
          if (!(name in operationArguments)) continue;
          const expected = scriptTypeForCatalogType(expectedCatalogType);
          const actual = infer(operationArguments[name], report);
          if (expected && !compatible(expected, actual)) {
            report(`Operation argument '${name}' is ${actual}, not ${expected}.`);
          }
        }
        if (statement.result) {
          const inferred = operationResult(statement);
          const declared = statement.declaredType ? String(statement.declaredType) : locals.get(String(statement.result));
          if (declared && !compatible(declared as RemakeScriptValueType, inferred)) report(`Operation result is ${inferred}, not ${declared}.`);
          if (statement.declaredType) locals.set(String(statement.result), statement.declaredType as RemakeScriptValueType);
        }
      } else if (statement.kind === "call") {
        const target = scripts.get(String(statement.scriptId));
        if (!target) {
          report(`Script '${statement.scriptId}' is unavailable.`);
        } else if (statement.result) {
          const declared = statement.declaredType ? String(statement.declaredType) : locals.get(String(statement.result));
          if (declared && !compatible(declared as RemakeScriptValueType, target.returnType)) {
            report(`Script call returns ${target.returnType}, not ${declared}.`);
          }
          if (statement.declaredType) locals.set(String(statement.result), statement.declaredType as RemakeScriptValueType);
        }
      } else if (statement.kind === "if") {
        const condition = infer(statement.condition, report);
        if (!compatible("bool", condition)) report(`If condition is ${condition}, not bool.`);
        visit(arrayOf<JsonNode>(statement.then));
        visit(arrayOf<JsonNode>(statement.else));
      } else if (statement.kind === "for") {
        const collectionType = infer(statement.collection, report);
        if (!collectionType.endsWith("-array") && collectionType !== "unknown") {
          report(`For loop requires an array, not ${collectionType}.`);
        }
        const itemType = collectionType === "character-snapshot-array"
          ? "character-snapshot"
          : collectionType.replace(/-array$/, "") as RemakeScriptValueType;
        const previous = locals.get(String(statement.name));
        locals.set(String(statement.name), itemType);
        visit(arrayOf<JsonNode>(statement.body));
        if (previous) locals.set(String(statement.name), previous);
        else locals.delete(String(statement.name));
      } else if (statement.kind === "match") {
        const valueType = infer(statement.value, report);
        for (const caseEntry of arrayOf<JsonNode>(statement.cases)) {
          const patternType = infer(caseEntry.pattern, report);
          if (!compatible(valueType, patternType) && !compatible(patternType, valueType)) {
            report(`Match case is ${patternType}, not ${valueType}.`);
          }
          visit(arrayOf<JsonNode>(caseEntry.body));
        }
        visit(arrayOf<JsonNode>(statement.default));
      } else if (statement.kind === "return") {
        const actual = "value" in statement ? infer(statement.value, report) : "void";
        if (!compatible(script.returnType, actual)) {
          report(`Return value is ${actual}, not ${script.returnType}.`);
        }
      }
    }
  };
  visit(arrayOf<JsonNode>(program.body));
}

function printStatements(statements: JsonNode[], depth: number): string {
  return statements.map((statement) => {
    const indent = "\t".repeat(depth);
    if (statement.kind === "if") {
      const thenText = printStatements(arrayOf<JsonNode>(statement.then), depth + 1) || `${indent}\treturn`;
      const elseValues = arrayOf<JsonNode>(statement.else);
      return `${indent}if ${printExpression(statement.condition)}:\n${thenText}${elseValues.length ? `\n${indent}else:\n${printStatements(elseValues, depth + 1)}` : ""}`;
    }
    if (statement.kind === "for") {
      const body = printStatements(arrayOf<JsonNode>(statement.body), depth + 1) || `${indent}\treturn`;
      return `${indent}for ${statement.name} in ${printExpression(statement.collection)}:\n${body}`;
    }
    if (statement.kind === "match") {
      const cases = arrayOf<JsonNode>(statement.cases).map((caseEntry) => {
        const body = printStatements(arrayOf<JsonNode>(caseEntry.body), depth + 2) || `${indent}\t\treturn`;
        return `${indent}\t${printExpression(caseEntry.pattern)}:\n${body}`;
      });
      const defaultValues = arrayOf<JsonNode>(statement.default);
      if (defaultValues.length) {
        cases.push(`${indent}\t_:\n${printStatements(defaultValues, depth + 2)}`);
      }
      return `${indent}match ${printExpression(statement.value)}:\n${cases.join("\n")}`;
    }
    if (statement.kind === "return") return `${indent}return${"value" in statement ? ` ${printExpression(statement.value)}` : ""}`;
    if (statement.kind === "declare" || statement.kind === "assign") {
      const prefix = statement.kind === "declare" ? `var ${statement.name}: ${printType(String(statement.valueType))}` : `${statement.scope === "persistent" ? "persistent." : ""}${statement.name}`;
      return `${indent}${prefix} = ${printExpression(statement.value)}`;
    }
    if (statement.kind === "operation") {
      const name = operationNameForStatement(statement);
      const spec: OperationSpec | undefined = OPERATION_SPECS[name as OperationName];
      const catalog = CATALOG_OPERATIONS.get(String(statement.capability));
      const names = spec
        ? [...spec.names, ...(spec.optionalNames ?? [])]
        : Object.keys(catalog?.parameters ?? {});
      const args = names
        .filter((key) => (statement.arguments as JsonNode)?.[key] !== undefined)
        .map((key) => printExpression((statement.arguments as JsonNode)?.[key]))
        .join(", ");
      const call = `${spec?.yields || catalog?.yields ? "await " : ""}${name}(${args})`;
      const resultType = String(statement.declaredType || spec?.result || scriptTypeForCatalogType(catalog?.result ?? "") || "void");
      return `${indent}${statement.result ? `var ${statement.result}: ${printType(resultType)} = ` : ""}${call}`;
    }
    if (statement.kind === "call") {
      const args = Object.values((statement.arguments as JsonNode) ?? {}).map(printExpression);
      const callArguments = [JSON.stringify(statement.scriptId), ...args].join(", ");
      return `${indent}${statement.result ? `var ${statement.result}: Variant = ` : ""}script_call(${callArguments})`;
    }
    return `${indent}return`;
  }).join("\n");
}

function printExpression(value: unknown): string {
  const expression = value as JsonNode;
  if (!expression || typeof expression !== "object") return JSON.stringify(value);
  if (expression.kind === "literal") return JSON.stringify(expression.value);
  if (expression.kind === "variable") return `${expression.scope === "persistent" ? "persistent." : ""}${expression.name}`;
  if (expression.kind === "array") return `[${arrayOf(expression.values).map(printExpression).join(", ")}]`;
  if (expression.kind === "record") {
    return `{${Object.entries((expression.fields ?? {}) as JsonNode)
      .map(([name, field]) => `${JSON.stringify(name)}: ${printExpression(field)}`)
      .join(", ")}}`;
  }
  if (expression.kind === "unary") return `${expression.operator} ${printExpression(expression.operand)}`;
  if (expression.kind === "binary") return `${printExpression(expression.left)} ${expression.operator} ${printExpression(expression.right)}`;
  if (expression.kind === "member") return `${printExpression(expression.object)}.${expression.member}`;
  if (expression.kind === "collection") {
    const arguments_ = [printExpression(expression.collection)];
    if (expression.predicate) arguments_.push(String(expression.itemName || "item"), printExpression(expression.predicate));
    return `${expression.operation}(${arguments_.join(", ")})`;
  }
  return "null";
}

function parseType(value: string): RemakeScriptValueType {
  const normalized: Record<string, RemakeScriptValueType> = {
    void: "void", bool: "bool", int: "int", float: "float", String: "string",
    LocationSnapshot: "location-snapshot",
    TimeSnapshot: "time-snapshot",
    WealthSnapshot: "wealth-snapshot",
    CharacterSnapshot: "character-snapshot",
    CharacterSnapshotArray: "character-snapshot-array",
    "Array[CharacterSnapshot]": "character-snapshot-array",
    CombatSnapshot: "combat-snapshot",
    ActionOutcome: "action-outcome",
    EncounterOutcome: "encounter-outcome",
    EffectOutcome: "effect-outcome",
    ItemOutcome: "item-outcome",
    MonsterDecision: "monster-decision",
    RuleModifier: "rule-modifier",
    "Array[bool]": "bool-array", "Array[int]": "int-array", "Array[float]": "float-array", "Array[String]": "string-array"
  };
  return normalized[value] ?? "void";
}

function printType(value: string) {
  return ({
    string: "String",
    "location-snapshot": "LocationSnapshot",
    "time-snapshot": "TimeSnapshot",
    "wealth-snapshot": "WealthSnapshot",
    "character-snapshot": "CharacterSnapshot",
    "character-snapshot-array": "Array[CharacterSnapshot]",
    "combat-snapshot": "CombatSnapshot",
    "action-outcome": "ActionOutcome",
    "encounter-outcome": "EncounterOutcome",
    "effect-outcome": "EffectOutcome",
    "item-outcome": "ItemOutcome",
    "monster-decision": "MonsterDecision",
    "rule-modifier": "RuleModifier",
    "bool-array": "Array[bool]",
    "int-array": "Array[int]",
    "float-array": "Array[float]",
    "string-array": "Array[String]"
  } as Record<string, string>)[value] ?? value;
}

function scriptTypeForCatalogType(value: string | undefined): RemakeScriptValueType | "unknown" {
  if (!value) return "unknown";
  const required = value.replace(/\?$/, "");
  const types: Record<string, RemakeScriptValueType | "unknown"> = {
    void: "void",
    bool: "bool",
    int: "int",
    float: "float",
    string: "string",
    "bool-array": "bool-array",
    "int-array": "int-array",
    "float-array": "float-array",
    "string-array": "string-array",
    LocationSnapshot: "location-snapshot",
    TimeSnapshot: "time-snapshot",
    WealthSnapshot: "wealth-snapshot",
    CharacterSnapshot: "character-snapshot",
    "CharacterSnapshot-array": "character-snapshot-array",
    CombatSnapshot: "combat-snapshot",
    ActionOutcome: "action-outcome",
    EncounterOutcome: "encounter-outcome",
    EffectOutcome: "effect-outcome",
    ItemOutcome: "item-outcome",
    MonsterDecision: "monster-decision",
    RuleModifier: "rule-modifier",
    variant: "unknown",
    object: "unknown"
  };
  return types[required] ?? "unknown";
}

function operationNameForStatement(statement: JsonNode) {
  const arguments_ = (statement.arguments ?? {}) as JsonNode;
  const candidates = (Object.entries(OPERATION_SPECS) as Array<[OperationName, OperationSpec]>)
    .filter(([, spec]) => spec.capability === statement.capability);
  const matching = candidates.filter(([, spec]) =>
    Object.entries(spec.fixed ?? {}).every(([name, expected]) => {
      const actual = arguments_[name];
      return actual === expected
        || (actual && typeof actual === "object" && (actual as JsonNode).kind === "literal" && (actual as JsonNode).value === expected);
    })
    && spec.names.every((name) => name in arguments_)
  );
  return (matching.sort(([, left], [, right]) =>
    Object.keys(right.fixed ?? {}).length - Object.keys(left.fixed ?? {}).length
  )[0] ?? candidates[0])?.[0] ?? String(statement.capability);
}

function literalString(value: JsonNode | undefined) {
  return value?.kind === "literal" && typeof value.value === "string" ? value.value : "";
}

function arrayOf<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function at(line: SourceLine, message: string): SafeScriptDiagnostic {
  return { line: line.number, column: line.indent + 1, message };
}

function failed(line: number, message: string, diagnostics: SafeScriptDiagnostic[]): SafeScriptParseResult {
  diagnostics.push({ line, column: 1, message });
  return { program: null, sourceMap: {}, requestedCapabilities: [], diagnostics };
}
