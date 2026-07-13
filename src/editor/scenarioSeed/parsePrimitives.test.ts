import { describe, expect, it } from "vitest";
import {
  allowKeys,
  checkIntegerRange,
  optionalFixedIntegerMatrix,
  parseArray,
  parseIntegerArray,
  parseRefArray,
  requireObject,
  type ParseContext
} from "./parsePrimitives";

function context(): ParseContext {
  return { errors: [], warnings: [] };
}

describe("scenario seed parse primitives", () => {
  it("preserves indexed diagnostics while retaining valid array entries", () => {
    const ctx = context();

    expect(parseIntegerArray([1, "bad", 3], "root.values", ctx)).toEqual([1, 3]);
    expect(ctx.errors).toEqual(["root.values[1] must be an integer."]);
  });

  it("keeps unknown fields and fixed matrix dimensions explicit", () => {
    const ctx = context();
    const value = requireObject({ known: true, extra: 2 }, "root", ctx);
    if (value) allowKeys(value, "root", ["known"], ctx);
    optionalFixedIntegerMatrix([[1, 2], [3]], "root.matrix", 2, 2, ctx);

    expect(ctx.errors).toEqual([
      "root.extra is not a supported scenario seed field.",
      "root.matrix[1] must contain exactly 2 entries."
    ]);
  });

  it("normalizes references and range diagnostics without throwing", () => {
    const ctx = context();

    expect(parseRefArray([4, "door", null], "root.refs", ctx)).toEqual([4, "door", 0]);
    checkIntegerRange(12, "root.value", 0, 10, ctx);
    expect(ctx.errors).toEqual([
      "root.refs[2] must be an integer ID or non-empty key string.",
      "root.value must be less than or equal to 10."
    ]);
  });

  it("rejects non-array inputs at the generic boundary", () => {
    const ctx = context();

    expect(parseArray("bad", "root.items", ctx, () => "unused")).toBeUndefined();
    expect(ctx.errors).toEqual(["root.items must be an array."]);
  });
});
