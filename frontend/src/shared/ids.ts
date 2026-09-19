/** Simple stable string hash for page/field IDs (not cryptographic). */
export function stableHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function makeFieldId(parts: string[]): string {
  return `fld_${stableHash(parts.join("|"))}`;
}

export function makeOptionId(parts: string[]): string {
  return `opt_${stableHash(parts.join("|"))}`;
}

export function makePageVersion(parts: string[]): string {
  return `pv_${stableHash(parts.join("||"))}`;
}
