import { afterEach, beforeEach, expect, test } from "bun:test";
import { BunFileSystem } from "@effect/platform-bun";
import { Effect, Result } from "effect";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildTemplate } from "./template-build";

const scratchRoot = join(import.meta.dir, "..", "..", "..", ".scratch", "template-build-test");
let rootDir = "";

function write(relativePath: string, contents: string): void {
  const path = join(rootDir, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

beforeEach(() => {
  mkdirSync(scratchRoot, { recursive: true });
  rootDir = mkdtempSync(join(scratchRoot, "abstract-"));
  write("src/template/package.json", '{ "name": "jive-abstract-widget" }\n');
  write("src/template/src/entrypoints/jive-widget.ts", 'console.log("jive-widget");\n');
  write("src/template/node_modules/dep/index.js", "jive-widget\n");
  // What jive-abstract-library's build leaves: the base package, with the sample copied in twice.
  write("dist/base/package.json", JSON.stringify({ name: "jive-abstract-abstraction", version: "0.1.0-local", files: ["dist", "src"] }));
  write("dist/base/src/template/package.json", "{}");
  write("dist/base/dist/template/src/entrypoints/jive-widget.js", "");
});

afterEach(() => rmSync(rootDir, { recursive: true, force: true }));

function run(replacements: Record<string, string>) {
  return Effect.runPromise(Effect.result(Effect.provide(buildTemplate({ rootDir, abstract: { replacements } }), BunFileSystem.layer)));
}

test("writes the sample as .ejs files under dist/base/template, records the replacements, and drops the library build's copies", async () => {
  const result = await run({ widget: "kind", "jive-abstract-widget": "packageName" });
  expect(Result.isSuccess(result) && result.success.fileCount).toBe(2);

  expect(readFileSync(join(rootDir, "dist/base/template/package.json.ejs"), "utf8")).toBe('{ "name": "<%= packageName %>" }\n');
  expect(readFileSync(join(rootDir, "dist/base/template/src/entrypoints/jive-{kind}.ts.ejs"), "utf8")).toBe('console.log("jive-<%= kind %>");\n');
  expect(existsSync(join(rootDir, "dist/base/template/node_modules"))).toBe(false);
  expect(existsSync(join(rootDir, "dist/base/src/template"))).toBe(false);
  expect(existsSync(join(rootDir, "dist/base/dist/template"))).toBe(false);
  expect(JSON.parse(readFileSync(join(rootDir, "dist/base/package.json"), "utf8"))).toEqual({
    name: "jive-abstract-abstraction",
    version: "0.1.0-local",
    files: ["dist", "src", "template"],
    jive: { abstract: { replacements: { widget: "kind", "jive-abstract-widget": "packageName" } } },
  });
});

test("fails, writing nothing, when a literal appears nowhere in the sample", async () => {
  const result = await run({ widget: "kind", gadget: "other" });
  expect(Result.isFailure(result) && result.failure).toContain('names "gadget", which appears nowhere in src/template/');
  expect(existsSync(join(rootDir, "dist/base/template"))).toBe(false);
  expect(JSON.parse(readFileSync(join(rootDir, "dist/base/package.json"), "utf8")).jive).toBeUndefined();
});

test("fails when the abstract has no sample at src/template", async () => {
  rmSync(join(rootDir, "src/template"), { recursive: true });
  const result = await run({ widget: "kind" });
  expect(Result.isFailure(result) && result.failure).toContain("src/template/ is missing");
});
