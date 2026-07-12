export function updateArraySlot<T>(values: T[], index: number, value: T, minLength: number) {
  const next = [...values];
  while (next.length < minLength) next.push((typeof value === "number" ? 0 : "") as T);
  next[index] = value;
  return next;
}
