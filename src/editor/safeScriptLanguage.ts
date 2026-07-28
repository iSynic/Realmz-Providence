import type {
  RemakePersistentVariable,
  RemakeScript,
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
  result: "void" | "int" | "dynamic";
  fixed?: Record<string, string>;
  yields?: boolean;
};

const OPERATION_SPECS = {
  read_quest: { capability: "core.state.read", names: ["id"], result: "int", fixed: { scope: "quest" } },
  write_quest: { capability: "core.state.write", names: ["id", "value"], result: "void", fixed: { scope: "quest" } },
  read_variable: { capability: "core.state.read", names: ["name"], result: "dynamic", fixed: { scope: "persistent" } },
  write_variable: { capability: "core.state.write", names: ["name", "value"], result: "void", fixed: { scope: "persistent" } },
  show_text: { capability: "core.presentation.text", names: ["text"], result: "void", yields: true },
  choose: { capability: "core.presentation.choice", names: ["prompt", "options"], result: "int", yields: true },
  teleport: { capability: "core.map.teleport", names: ["levelType", "levelIndex", "x", "y"], result: "void", yields: true },
  start_battle: { capability: "core.encounter.start-battle", names: ["battleId"], result: "void", yields: true },
  roll: { capability: "core.rng.roll", names: ["maximum"], result: "int" }
} as const satisfies Record<string, OperationSpec>;

type OperationName = keyof typeof OPERATION_SPECS;

export function parseSafeScript(
  source: string,
  script: Pick<RemakeScript, "id" | "parameters" | "returnType">,
  knownScripts: readonly RemakeScript[] = [],
  persistentVariables: readonly RemakePersistentVariable[] = []
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
    private readonly knownScripts: readonly RemakeScript[],
    private readonly persistentVariables: readonly RemakePersistentVariable[]
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
    if (/^(for|while|match|class|class_name|signal|extends|@|lambda)\b/.test(line.text)) {
      this.diagnostics.push(at(line, "This syntax is not available in safe scripts."));
      return null;
    }
    if (line.text.startsWith("if ")) return this.parseIf(line, indent);
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
    if (args.length !== spec.names.length) {
      this.diagnostics.push(at(line, `'${name}' expects ${spec.names.length} argument(s).`));
    }
    this.capabilities.add(spec.capability);
    return {
      kind: "operation",
      capability: spec.capability,
      arguments: { ...("fixed" in spec ? spec.fixed : {}), ...Object.fromEntries(spec.names.map((key, index) => [key, args[index]])) },
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
  const pattern = /\s*(==|!=|<=|>=|[()[\],.+\-*/%<>]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*)/gy;
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
  script: Pick<RemakeScript, "parameters" | "returnType">,
  knownScripts: readonly RemakeScript[],
  persistentVariables: readonly RemakePersistentVariable[],
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
    return "unknown";
  };
  const operationResult = (statement: JsonNode): RemakeScriptValueType | "unknown" => {
    const capability = String(statement.capability);
    if (capability === "core.presentation.choice" || capability === "core.rng.roll") return "int";
    if (capability === "core.state.read") {
      const argumentsValue = (statement.arguments ?? {}) as JsonNode;
      const scope = literalString(argumentsValue.scope as JsonNode | undefined);
      if (scope === "quest") return "int";
      if (scope === "persistent") {
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
        const expectedArguments: Record<string, Partial<Record<string, RemakeScriptValueType>>> = {
          "core.presentation.text": { text: "string" },
          "core.presentation.choice": { prompt: "string", options: "string-array" },
          "core.map.teleport": { levelType: "string", levelIndex: "int", x: "int", y: "int" },
          "core.encounter.start-battle": { battleId: "int" },
          "core.rng.roll": { maximum: "int" },
          "core.state.read": { scope: "string", id: "int", name: "string" },
          "core.state.write": { scope: "string", id: "int", name: "string" }
        };
        for (const [name, expected] of Object.entries(expectedArguments[capability] ?? {})) {
          if (!(name in operationArguments)) continue;
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
    if (statement.kind === "return") return `${indent}return${"value" in statement ? ` ${printExpression(statement.value)}` : ""}`;
    if (statement.kind === "declare" || statement.kind === "assign") {
      const prefix = statement.kind === "declare" ? `var ${statement.name}: ${printType(String(statement.valueType))}` : `${statement.scope === "persistent" ? "persistent." : ""}${statement.name}`;
      return `${indent}${prefix} = ${printExpression(statement.value)}`;
    }
    if (statement.kind === "operation") {
      const name = Object.entries(OPERATION_SPECS).find(([, spec]) => spec.capability === statement.capability)?.[0] ?? String(statement.capability);
      const spec: OperationSpec = OPERATION_SPECS[name as OperationName];
      const args = spec.names.map((key) => printExpression((statement.arguments as JsonNode)?.[key])).join(", ");
      const call = `${spec.yields ? "await " : ""}${name}(${args})`;
      return `${indent}${statement.result ? `var ${statement.result}: ${printType(String(statement.declaredType || spec.result))} = ` : ""}${call}`;
    }
    if (statement.kind === "call") {
      const args = Object.values((statement.arguments as JsonNode) ?? {}).map(printExpression);
      return `${indent}${statement.result ? `var ${statement.result}: Variant = ` : ""}script_call(${JSON.stringify(statement.scriptId)}, ${args.join(", ")})`;
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
  if (expression.kind === "unary") return `${expression.operator} ${printExpression(expression.operand)}`;
  if (expression.kind === "binary") return `${printExpression(expression.left)} ${expression.operator} ${printExpression(expression.right)}`;
  return "null";
}

function parseType(value: string): RemakeScriptValueType {
  const normalized: Record<string, RemakeScriptValueType> = {
    void: "void", bool: "bool", int: "int", float: "float", String: "string",
    "Array[bool]": "bool-array", "Array[int]": "int-array", "Array[float]": "float-array", "Array[String]": "string-array"
  };
  return normalized[value] ?? "void";
}

function printType(value: string) {
  return ({ string: "String", "bool-array": "Array[bool]", "int-array": "Array[int]", "float-array": "Array[float]", "string-array": "Array[String]" } as Record<string, string>)[value] ?? value;
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
