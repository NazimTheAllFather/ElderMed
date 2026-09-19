import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

describe("bundle security", () => {
  it("does not embed an ElevenLabs API key in source or dist", () => {
    const roots = ["src", "manifest.config.ts", "vite.config.ts"];
    const dist = path.resolve("dist");
    const files: string[] = [];

    for (const root of roots) {
      const full = path.resolve(root);
      try {
        const st = statSync(full);
        if (st.isDirectory()) files.push(...walk(full));
        else files.push(full);
      } catch {
        // missing optional path
      }
    }

    try {
      files.push(...walk(dist));
    } catch {
      // dist may not exist until build; source check still runs
    }

    // Patterns constructed at runtime so this test file itself is not a false positive.
    const banned = [
      new RegExp(["xi", "api", "key"].join("-"), "i"),
      new RegExp(["ELEVENLABS", "API", "KEY"].join("_")),
      /(?:^|[^a-zA-Z0-9])sk_[a-zA-Z0-9]{20,}/,
    ];

    for (const file of files) {
      if (file.includes(`${path.sep}shared${path.sep}bundleSecurity.test.ts`)) continue;
      if (!/\.(js|ts|tsx|mjs|cjs|css|html|json|map)$/i.test(file)) continue;
      if (/\.test\.(ts|tsx)$/i.test(file)) continue;
      const text = readFileSync(file, "utf8");
      for (const pattern of banned) {
        expect(text, `${file} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
