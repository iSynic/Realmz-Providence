export type ParseContext = {
  errors: string[];
  warnings: string[];
};

export type ObjectValue = Record<string, unknown>;
export type SeedReference = number | string;

export function parseArray<T>(
  input: unknown,
  path: string,
  context: ParseContext,
  parse: (input: unknown, path: string, context: ParseContext) => T | null
): T[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) {
    context.errors.push(`${path} must be an array.`);
    return undefined;
  }
  const values: T[] = [];
  input.forEach((item, index) => {
    const parsed = parse(item, `${path}[${index}]`, context);
    if (parsed) values.push(parsed);
  });
  return values;
}

export function parseIntegerArray(input: unknown, path: string, context: ParseContext): number[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) {
    context.errors.push(`${path} must be an array of integers.`);
    return undefined;
  }
  const values: number[] = [];
  input.forEach((item, index) => {
    const parsed = requireInteger(item, `${path}[${index}]`, context);
    if (parsed !== null) values.push(parsed);
  });
  return values;
}

export function optionalFixedIntegerArray(input: unknown, path: string, length: number, context: ParseContext) {
  const values = parseIntegerArray(input, path, context);
  if (values && values.length !== length) context.errors.push(`${path} must contain exactly ${length} entries.`);
  return values;
}

export function optionalFixedIntegerMatrix(input: unknown, path: string, rows: number, columns: number, context: ParseContext) {
  const values = parseArray(input, path, context, (row, rowPath, rowContext) => optionalFixedIntegerArray(row, rowPath, columns, rowContext) ?? null);
  if (values && values.length !== rows) context.errors.push(`${path} must contain exactly ${rows} rows.`);
  return values;
}

export function optionalStringProperty<T extends string>(
  value: ObjectValue,
  key: T,
  path: string,
  context: ParseContext
): Partial<Record<T, string>> {
  const parsed = optionalString(value[key], `${path}.${key}`, context);
  return parsed === undefined ? {} : { [key]: parsed } as Partial<Record<T, string>>;
}

export function parseStringArray(input: unknown, path: string, context: ParseContext): string[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) {
    context.errors.push(`${path} must be an array of strings.`);
    return undefined;
  }
  const values: string[] = [];
  input.forEach((item, index) => {
    const parsed = optionalString(item, `${path}[${index}]`, context);
    if (parsed !== undefined) values.push(parsed);
  });
  return values;
}

export function parseRefArray(input: unknown, path: string, context: ParseContext): SeedReference[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) {
    context.errors.push(`${path} must be an array of integer IDs or key strings.`);
    return undefined;
  }
  const values: SeedReference[] = [];
  input.forEach((item, index) => {
    values.push(requireRef(item, `${path}[${index}]`, context));
  });
  return values;
}

export function requireRef(input: unknown, path: string, context: ParseContext): SeedReference {
  if (typeof input === "string" && input.trim().length > 0) return input;
  if (Number.isInteger(input)) return input as number;
  context.errors.push(`${path} must be an integer ID or non-empty key string.`);
  return 0;
}

export function optionalRef(input: unknown, path: string, context: ParseContext): SeedReference | undefined {
  if (input === undefined) return undefined;
  if (typeof input === "string" && input.trim().length > 0) return input;
  if (Number.isInteger(input)) return input as number;
  context.errors.push(`${path} must be an integer ID or non-empty key string.`);
  return undefined;
}

export function requireObject(input: unknown, path: string, context: ParseContext): ObjectValue | null {
  if (isObject(input)) return input;
  context.errors.push(`${path} must be an object.`);
  return null;
}

export function allowKeys(value: ObjectValue, path: string, keys: string[], context: ParseContext) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) context.errors.push(`${path}.${key} is not a supported scenario seed field.`);
  }
}

export function requireString(input: unknown, path: string, context: ParseContext): string | null {
  if (typeof input === "string" && input.trim().length > 0) return input;
  context.errors.push(`${path} must be a non-empty string.`);
  return null;
}

export function optionalString(input: unknown, path: string, context: ParseContext): string | undefined {
  if (input === undefined) return undefined;
  if (typeof input === "string") return input;
  context.errors.push(`${path} must be a string.`);
  return undefined;
}

export function requireInteger(input: unknown, path: string, context: ParseContext): number | null {
  if (Number.isInteger(input)) return input as number;
  context.errors.push(`${path} must be an integer.`);
  return null;
}

export function optionalInteger(input: unknown, path: string, context: ParseContext): number | undefined {
  if (input === undefined) return undefined;
  if (Number.isInteger(input)) return input as number;
  context.errors.push(`${path} must be an integer.`);
  return undefined;
}

export function optionalBoolean(input: unknown, path: string, context: ParseContext): boolean | undefined {
  if (input === undefined) return undefined;
  if (typeof input === "boolean") return input;
  context.errors.push(`${path} must be a boolean.`);
  return undefined;
}

export function checkIntegerRange(
  value: number | null | undefined,
  path: string,
  min: number | null,
  max: number | null,
  context: ParseContext
) {
  if (value === null || value === undefined) return;
  if (min !== null && value < min) context.errors.push(`${path} must be greater than or equal to ${min}.`);
  if (max !== null && value > max) context.errors.push(`${path} must be less than or equal to ${max}.`);
}

export function isObject(input: unknown): input is ObjectValue {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
