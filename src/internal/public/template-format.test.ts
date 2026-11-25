import { describe, expect, test } from "bun:test";
import { Effect, Result } from "effect";
import { encodeTemplate, renderTemplate, templateInputNames } from "./template-format";

describe("encodeTemplate", () => {
  test("replaces the longer of two overlapping literals whole, so the shorter one never splits it", () => {
    const { files, literalsNeverFound } = encodeTemplate({
      files: [{ path: "README.md", contents: "jive-abstract-widget ships jive-widget for widget packages" }],
      replacements: { widget: "kind", "jive-abstract-widget": "packageName" },
    });
    expect(literalsNeverFound).toEqual([]);
    expect(files).toEqual([{
      path: "README.md.ejs",
      contents: "<%= packageName %> ships jive-<%= kind %> for <%= kind %> packages",
    }]);
  });

  test("replaces the longer literal where two start at the same place", () => {
    const { files } = encodeTemplate({
      files: [{ path: "a.md", contents: "example-library is an example" }],
      replacements: { example: "word", "example-library": "packageName" },
    });
    expect(files[0]?.contents).toBe("<%= packageName %> is an <%= word %>");
  });

  test("never searches the tag a literal became for another literal", () => {
    const { files } = encodeTemplate({
      files: [{ path: "a.txt", contents: "my-lib" }],
      replacements: { "my-lib": "packageName", Name: "displayName", ckage: "other" },
    });
    expect(files[0]?.contents).toBe("<%= packageName %>");
  });

  test("replaces literals in file and folder names, each name on its own, and names every file .ejs", () => {
    const { files } = encodeTemplate({
      files: [{ path: "src/entrypoints/jive-widget.ts", contents: "" }, { path: "widget/widget.md", contents: "" }],
      replacements: { widget: "kind" },
    });
    expect(files.map((file) => file.path)).toEqual([
      "src/entrypoints/jive-<%= kind %>.ts.ejs",
      "<%= kind %>/<%= kind %>.md.ejs",
    ]);
  });

  test("reports each literal found in no contents and no name", () => {
    const { literalsNeverFound } = encodeTemplate({
      files: [{ path: "widget.md", contents: "nothing here" }],
      replacements: { widget: "kind", gadget: "other", sprocket: "third" },
    });
    expect(literalsNeverFound).toEqual(["sprocket", "gadget"]);
  });

  test("escapes the sample's own EJS delimiters, so rendering gives them back unchanged", () => {
    const contents = 'const t = "<%= keep %>"; // example-library';
    const { files } = encodeTemplate({ files: [{ path: "x.ts", contents }], replacements: { "example-library": "packageName" } });
    expect(files[0]?.contents).toBe('const t = "<%%= keep %>"; // <%= packageName %>');
    const rendered = Effect.runSync(renderTemplate({ files, inputs: { packageName: "my-lib" } }));
    expect(rendered).toEqual([{ path: "x.ts", contents: 'const t = "<%= keep %>"; // my-lib' }]);
  });
});

describe("renderTemplate", () => {
  test("renders names and contents with the inputs, escaping nothing", () => {
    const rendered = Effect.runSync(renderTemplate({
      files: [{ path: "src/<%= kind %>.ts.ejs", contents: 'export const name = "<%= packageName %>";' }],
      inputs: { kind: "agentic-workflow", packageName: "@scope/it's & <here>" },
    }));
    expect(rendered).toEqual([{ path: "src/agentic-workflow.ts", contents: `export const name = "@scope/it's & <here>";` }]);
  });

  const failures: ReadonlyArray<{ name: string; path: string; inputs: Record<string, string>; message: string }> = [
    { name: "a file without .ejs", path: "a.ts", inputs: {}, message: "is not a template file" },
    { name: "a missing input", path: "<%= kind %>.ts.ejs", inputs: {}, message: "Cannot render the name" },
    { name: "a name that leaves the package", path: "<%= kind %>/a.ts.ejs", inputs: { kind: ".." }, message: "is not one file or folder name" },
    { name: "a name holding a slash", path: "<%= kind %>.ts.ejs", inputs: { kind: "a/b" }, message: "is not one file or folder name" },
  ];
  test.each(failures)("fails for $name", ({ path, inputs, message }) => {
    const result = Effect.runSync(Effect.result(renderTemplate({ files: [{ path, contents: "" }], inputs })));
    expect(Result.isFailure(result) && result.failure.includes(message)).toBe(true);
  });
});

test("templateInputNames lists each input once, in the order the replacements first name it", () => {
  expect(templateInputNames({ "jive-abstract-widget": "packageName", widget: "kind", "Widget Inc": "packageName" }))
    .toEqual(["packageName", "kind"]);
});
