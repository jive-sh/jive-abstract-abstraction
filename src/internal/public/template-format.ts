import { Effect } from "effect";
import ejs from "ejs";
import { INPUT_NAME_PATTERN, TEMPLATE_FILE_SUFFIX } from "./manifest";

/**
 * The template format, both directions: the build turns a sample package into `.ejs` files, and `jive create`
 * renders them back with the person's inputs. One module owns both, so what the build escapes is exactly what the
 * renderer unescapes.
 *
 * In a built template's file contents, each replaced literal is `<%= input %>`, and any `<%` the sample itself
 * contains is `<%%`, which EJS renders as `<%`. Rendering escapes nothing, since the output is source code, not HTML.
 *
 * File and folder names can't hold EJS tags: GitHub's artifact upload refuses a file name containing `<`, `>`, `:`,
 * `"`, `|`, `*` or `?`, and Windows can't create one, so an npm package holding such a name fails to unpack there.
 * In a name, each replaced literal is `{input}` instead, and any `{` the sample's name itself contains is `{{`.
 */

/** One file of a package or of a template, by its path relative to the package root with `/` separators. */
export interface TemplateFile {
  readonly path: string;
  readonly contents: string;
}

export interface EncodedTemplate {
  readonly files: ReadonlyArray<TemplateFile>;
  /** Literals found nowhere in the sample, neither in a file's contents nor in a file or folder name. */
  readonly literalsNeverFound: ReadonlyArray<string>;
}

const EJS_OPENING_DELIMITER = "<%";
const NAME_TAG_OPENING = "{";

/** In a built name: an escaped `{`, an input's tag (its name captured), or a `{` that starts neither. */
const NAME_TOKEN = new RegExp(`\\{\\{|\\{(${INPUT_NAME_PATTERN})\\}|\\{`, "g");

/**
 * Replaces each literal with its input's tag in every file's contents (`<%= input %>`) and in every file and folder
 * name (`{input}`), and names every file `<name>.ejs`. One pass over the text, trying longer literals first at each
 * position, so a literal inside a longer one never splits it, and the tag a literal becomes is never searched for
 * another.
 */
export function encodeTemplate(input: {
  readonly files: ReadonlyArray<TemplateFile>;
  readonly replacements: { readonly [literal: string]: string };
}): EncodedTemplate {
  const literals = Object.keys(input.replacements).sort((a, b) => b.length - a.length || a.localeCompare(b));
  const occurrences = new Map(literals.map((literal) => [literal, 0]));
  const encoder = (opening: string, escaped: string, tag: (inputName: string) => string) => {
    const pattern = new RegExp([...literals, opening].map(escapeRegExp).join("|"), "g");
    return (text: string): string => text.replace(pattern, (match) => {
      const inputName = input.replacements[match];
      if (inputName === undefined) return escaped;
      occurrences.set(match, (occurrences.get(match) ?? 0) + 1);
      return tag(inputName);
    });
  };
  const encodeContents = encoder(EJS_OPENING_DELIMITER, `${EJS_OPENING_DELIMITER}%`, (inputName) => `<%= ${inputName} %>`);
  const encodeName = encoder(NAME_TAG_OPENING, `${NAME_TAG_OPENING}${NAME_TAG_OPENING}`, (inputName) => `{${inputName}}`);

  const files = input.files.map((file) => ({
    path: `${file.path.split("/").map(encodeName).join("/")}${TEMPLATE_FILE_SUFFIX}`,
    contents: encodeContents(file.contents),
  }));
  return { files, literalsNeverFound: literals.filter((literal) => occurrences.get(literal) === 0) };
}

/**
 * Renders a built template with the person's inputs: every name and every file's contents, each file losing its
 * `.ejs`. Fails when a file does not end in `.ejs`, an input the template uses is missing, or a rendered path would
 * leave the package's directory.
 */
export function renderTemplate(input: {
  readonly files: ReadonlyArray<TemplateFile>;
  readonly inputs: { readonly [inputName: string]: string };
}): Effect.Effect<ReadonlyArray<TemplateFile>, string> {
  return Effect.forEach(input.files, (file) => Effect.gen(function* () {
    if (!file.path.endsWith(TEMPLATE_FILE_SUFFIX)) {
      return yield* Effect.fail(`${file.path} is not a template file: every file of a built template ends in ${TEMPLATE_FILE_SUFFIX}`);
    }
    const segments: Array<string> = [];
    for (const segment of file.path.slice(0, -TEMPLATE_FILE_SUFFIX.length).split("/")) {
      const rendered = yield* renderName({ name: segment, inputs: input.inputs, location: `the name ${file.path}` });
      if (rendered === "" || rendered === "." || rendered === ".." || rendered.includes("/") || rendered.includes("\\")) {
        return yield* Effect.fail(`${file.path} renders to the name ${JSON.stringify(rendered)}, which is not one file or folder name`);
      }
      segments.push(rendered);
    }
    return {
      path: segments.join("/"),
      contents: yield* render({ text: file.contents, inputs: input.inputs, location: file.path }),
    };
  }));
}

/** Renders one built file or folder name: `{{` becomes `{`, and `{input}` becomes that input's value. */
function renderName(input: {
  readonly name: string;
  readonly inputs: { readonly [inputName: string]: string };
  readonly location: string;
}): Effect.Effect<string, string> {
  const problems: Array<string> = [];
  const rendered = input.name.replace(NAME_TOKEN, (match: string, inputName: string | undefined) => {
    if (match === `${NAME_TAG_OPENING}${NAME_TAG_OPENING}`) return NAME_TAG_OPENING;
    if (inputName === undefined) {
      problems.push(`a "{" starts no {input} tag (a "{" in the name itself is written "{{")`);
      return match;
    }
    const value = input.inputs[inputName];
    if (value === undefined) {
      problems.push(`the input ${inputName} is not given`);
      return match;
    }
    return value;
  });
  return problems.length === 0 ? Effect.succeed(rendered) : Effect.fail(`Cannot render ${input.location}: ${problems.join("; ")}`);
}

function render(input: {
  readonly text: string;
  readonly inputs: { readonly [inputName: string]: string };
  readonly location: string;
}): Effect.Effect<string, string> {
  return Effect.try({
    try: () => ejs.render(input.text, input.inputs, { async: false, escape: (value: unknown) => String(value) }),
    catch: (error) => `Cannot render ${input.location}: ${error instanceof Error ? error.message : String(error)}`,
  });
}

/** The inputs a template asks for, in the order the abstract's replacements first name them. */
export function templateInputNames(replacements: { readonly [literal: string]: string }): ReadonlyArray<string> {
  return [...new Set(Object.values(replacements))];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
