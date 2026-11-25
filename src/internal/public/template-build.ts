import { Effect, FileSystem, Schema, pipe } from "effect";
import { join, relative, resolve, sep } from "node:path";
import { TEMPLATE_DIRECTORY, TEMPLATE_SOURCE_DIRECTORY, type AbstractConfig } from "./manifest";
import { encodeTemplate, type TemplateFile } from "./template-format";

/**
 * jive-abstract-library builds the package it publishes into dist/base, and 0.14.5 exports neither name; its build
 * also copies the whole of src/ there (and tsc emits src/ into dist/base/dist), the sample included.
 */
const BUILT_PACKAGE_DIRECTORY = join("dist", "base");
const SKIPPED_DIRECTORIES = ["node_modules"];

const BuiltManifest = Schema.Struct({ files: Schema.Array(Schema.String) });

/**
 * The template step: after jive-abstract-library has built the abstract into dist/base, writes the sample package at
 * src/template/ there as dist/base/template/, every file `.ejs` with each replacement literal turned into its input's
 * tag, and records the replacements in dist/base/package.json, where `jive create` reads them. Fails, writing nothing,
 * when a literal never appears in the sample. The copies of the sample the library build left in dist/base are
 * removed, so the package ships the sample once, as the template.
 */
export function buildTemplate(input: {
  readonly rootDir: string;
  readonly abstract: AbstractConfig;
}): Effect.Effect<{ readonly fileCount: number }, string, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const sourceDir = resolve(input.rootDir, TEMPLATE_SOURCE_DIRECTORY);
    const builtDir = resolve(input.rootDir, BUILT_PACKAGE_DIRECTORY);
    if (!(yield* fsOp(fs.exists(sourceDir)))) {
      return yield* Effect.fail(`${TEMPLATE_SOURCE_DIRECTORY}/ is missing: an abstract keeps a working sample package of its kind there, which its build turns into the template jive create renders`);
    }
    if (!(yield* fsOp(fs.exists(resolve(builtDir, "package.json"))))) {
      return yield* Effect.fail(`${BUILT_PACKAGE_DIRECTORY}/package.json is missing: the template step runs after jive-abstract-library's build`);
    }

    const { files, literalsNeverFound } = encodeTemplate({
      files: yield* readTree(sourceDir),
      replacements: input.abstract.replacements,
    });
    if (literalsNeverFound.length > 0) {
      return yield* Effect.fail(
        `jive.abstract.replacements names ${literalsNeverFound.map((literal) => JSON.stringify(literal)).join(", ")},`
        + ` which ${literalsNeverFound.length === 1 ? "appears" : "appear"} nowhere in ${TEMPLATE_SOURCE_DIRECTORY}/,`
        + " neither in a file nor in a file or folder name; remove the replacement, or use the literal in the sample",
      );
    }

    const templateDir = resolve(builtDir, TEMPLATE_DIRECTORY);
    yield* fsOp(fs.remove(templateDir, { recursive: true, force: true }));
    for (const file of files) {
      const path = resolve(templateDir, file.path);
      yield* fsOp(fs.makeDirectory(resolve(path, ".."), { recursive: true }));
      yield* fsOp(fs.writeFileString(path, file.contents));
    }
    yield* fsOp(fs.remove(resolve(builtDir, TEMPLATE_SOURCE_DIRECTORY), { recursive: true, force: true }));
    yield* fsOp(fs.remove(resolve(builtDir, "dist", "template"), { recursive: true, force: true }));

    const manifestPath = resolve(builtDir, "package.json");
    const manifest = yield* pipe(
      fsOp(fs.readFileString(manifestPath)),
      Effect.flatMap((text) => Effect.try({ try: () => JSON.parse(text) as Record<string, unknown>, catch: () => `${manifestPath} is not JSON` })),
    );
    const { files: published } = yield* pipe(
      Schema.decodeUnknownEffect(BuiltManifest)(manifest),
      Effect.mapError(() => `${manifestPath} has no "files" list; was it written by jive-abstract-library's build?`),
    );
    const updated = {
      ...manifest,
      files: published.includes(TEMPLATE_DIRECTORY) ? published : [...published, TEMPLATE_DIRECTORY],
      jive: { abstract: input.abstract },
    };
    yield* fsOp(fs.writeFileString(manifestPath, `${JSON.stringify(updated, null, 2)}\n`));

    yield* Effect.logInfo(`Built ${files.length} template file(s) from ${TEMPLATE_SOURCE_DIRECTORY}/ into ${relative(input.rootDir, templateDir)}/`);
    return { fileCount: files.length };
  });
}

/** Every file under `dir`, by its path relative to `dir` with `/` separators. */
function readTree(dir: string): Effect.Effect<ReadonlyArray<TemplateFile>, string, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const files: Array<TemplateFile> = [];
    const walk = (current: string): Effect.Effect<void, string> => Effect.gen(function* () {
      for (const child of [...(yield* fsOp(fs.readDirectory(current)))].sort()) {
        const path = resolve(current, child);
        if ((yield* fsOp(fs.stat(path))).type === "Directory") {
          if (!SKIPPED_DIRECTORIES.includes(child)) yield* walk(path);
        } else {
          files.push({ path: relative(dir, path).split(sep).join("/"), contents: yield* fsOp(fs.readFileString(path)) });
        }
      }
    });
    yield* walk(dir);
    return files;
  });
}

/** Filesystem errors carry a structured PlatformError; every caller here wants it as a message. */
function fsOp<A>(effect: Effect.Effect<A, { readonly message: string }>): Effect.Effect<A, string> {
  return Effect.mapError(effect, (e) => e.message);
}
