import { Effect, Schema } from "effect";
import { discoverDaemonNames, LibrarySchema, makeJivePackageJsonSchema, makeLibrarySchema, packageRootDir, type PackageJsonSchemaGenerator } from "jive-abstract-library";

/**
 * The shape of an abstract's package.json: everything a library built by jive-abstract-library has, plus the
 * `jive.abstract` block, which says how the abstract's sample package at `src/template/` becomes the template
 * `jive create` renders.
 */

/** Where an abstract keeps its sample package: a real, working package of the abstract's kind. Never configurable. */
export const TEMPLATE_SOURCE_DIRECTORY = "src/template";

/** Where the built template sits in the published package, beside its package.json. */
export const TEMPLATE_DIRECTORY = "template";

/** Every file of the built template carries this suffix; `jive create` renders the file and drops it. */
export const TEMPLATE_FILE_SUFFIX = ".ejs";

/** An input name, unanchored: the template format matches it inside file and folder names. */
export const INPUT_NAME_PATTERN = "[A-Za-z_$][A-Za-z0-9_$]*";
const INPUT_NAME = new RegExp(`^${INPUT_NAME_PATTERN}$`);

/** The name of one value `jive create` asks for: an EJS variable in the template, and the `--<name>` flag that gives it. */
const InputName = Schema.String.check(Schema.isPattern(INPUT_NAME)).annotate({
  description: 'An input jive create asks for, e.g. "packageName"; `jive create <kind> --packageName <value>` gives it without asking. Letters, digits, _ and $, not starting with a digit.',
});

/**
 * Literal text in the sample, each mapped to the input that takes its place. Rules for the keys sit on the record
 * rather than the key schema: decoding skips keys that fail a key-schema check without saying so.
 */
const Replacements = Schema.Record(Schema.String, InputName)
  .check(Schema.makeFilter((replacements: { readonly [literal: string]: string }) => {
    const bad = Object.keys(replacements).filter((literal) => literal.length === 0 || literal.includes("/"));
    return bad.length === 0
      ? undefined
      : `replacement literals must be non-empty and contain no "/" (a literal is matched within one file or folder name): ${bad.map((literal) => JSON.stringify(literal)).join(", ")}`;
  }))
  .annotate({
    description: 'Maps literal text in the sample package at src/template/ to the input that replaces it, e.g. {"example-library": "packageName"}. The build replaces each literal in every file\'s contents and in every file and folder name, longest literal first, and fails when a literal never appears.',
  });

/** The `jive.abstract` block. */
export const AbstractSchema = Schema.Struct({
  replacements: Replacements,
});
export type AbstractConfig = Schema.Schema.Type<typeof AbstractSchema>;

/** The package.json of an abstract built with this one. */
export const PackageJsonSchema = makeJivePackageJsonSchema({ library: LibrarySchema, abstract: AbstractSchema });
export type PackageJson = Schema.Schema.Type<typeof PackageJsonSchema>;

/** The schema the dev server writes to package.schema.json: this one, with `jive.library.daemons` pinned to the files. */
export const genPackageJsonSchema: PackageJsonSchemaGenerator = Effect.gen(function* () {
  const rootDir = yield* packageRootDir;
  const library = makeLibrarySchema(yield* discoverDaemonNames(rootDir));
  return makeJivePackageJsonSchema({ library, abstract: AbstractSchema });
});

/**
 * What the published package.json of an abstract says about its template, which the build writes and `jive create`
 * reads: the abstract's name and version, and its replacements, whose inputs are what create asks for.
 */
export const PublishedAbstractManifest = Schema.Struct({
  name: Schema.NonEmptyString,
  version: Schema.NonEmptyString,
  jive: Schema.Struct({ abstract: AbstractSchema }),
});
export type PublishedAbstractManifest = Schema.Schema.Type<typeof PublishedAbstractManifest>;
