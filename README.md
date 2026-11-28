# jive-abstract-abstraction

The [Jive](https://github.com/jive-sh/jive) abstract that abstracts extend. An abstract (`jive-abstract-<kind>`) is
a library that implements the six CI/CD hooks for one kind of package; what this abstract adds to a library is its
**template**, the files `jive create <kind>` makes a new package of that kind from. Its CLI is `jive-abstraction`.

## What an abstract built with it has

- **A sample package at `src/template/`.** It is a real, working package of the abstract's kind, kept in the
  abstract's repository and tested with it (the abstract's `tsc` and `bun test` cover it). The name is fixed, never
  configurable.
- **`jive.abstract.replacements` in its package.json.** This maps literal text in the sample to the input that takes
  its place: `{"example-library": "packageName"}` makes `jive create library` ask for `packageName` (or take
  `--packageName <value>`) and put the answer wherever the sample says `example-library`.
- **Its six scripts pointing at this CLI**, e.g. `"jive:cicd:build": "jive-abstraction cicd build"`, plus
  `"dev": "jive-abstraction dev"`.

## What the build does

`jive-abstraction cicd build` runs jive-abstract-library's build (its installed `jive-library cicd build`), then the
**template step**:

1. It reads every file under `src/template/`, skipping `node_modules`.
2. It replaces each literal with `<%= input %>` in every file's contents, and with `{input}` in every file and folder
   name, one name at a time. The longer of two literals that start at the same place wins, so `example` can never split
   `example-library`, and a replaced tag is never searched again. A `<%` the sample's contents hold becomes `<%%`, and a
   `{` its names hold becomes `{{`; each renders back unchanged. Names don't use EJS tags because GitHub's artifact
   upload refuses a file name holding `<`, `>` or `:`, and Windows can't unpack one.
3. It fails the build, writing nothing, when a literal appears nowhere, neither in a file nor in a name.
4. It writes each file as `dist/base/template/<path>.ejs`, adds `template` to `dist/base/package.json`'s `files`, and
   records the replacements there as `jive.abstract`, which is where `jive create` reads them. The copies of the sample
   that jive-abstract-library's build put in `dist/base/src/template` and `dist/base/dist/template` are removed.

Because the template step writes `template`, `jive.library.copy` can't name it: the build fails, before
jive-abstract-library's build runs, on a `copy` entry at or under `template`, and the generated `package.schema.json`
leaves it out of the paths `copy` offers.

`jive create` renders each file's contents with EJS, escaping nothing because the output is source code, fills in each
name's `{input}` tags, and writes the package
at `packages/<its package.json name>` in the workspace.

The other five hooks are jive-abstract-library's, run the same way. `jive-abstraction build-template` runs only the
template step, for an abstract whose own build runs first (jive-abstract-library's does).

The exports in [`src/index.ts`](src/index.ts) are the manifest schema (`PackageJsonSchema`, `AbstractSchema`), the
template step (`buildTemplate`), and the template format in both directions (`encodeTemplate`, `renderTemplate`,
`templateInputNames`), which `@jive-sh/jive`'s `create` command imports.

## This abstract's own template

`src/template/` is a sample abstract, `jive-abstract-widget`, with the CLI `jive-widget` and its own sample widget
package. The one replacement, `"widget": "kind"`, runs through all of it, so `jive create abstraction --kind gizmo`
writes `jive-abstract-gizmo` with the CLI `jive-gizmo`, whose own template makes `example-gizmo` packages. The sample's
hooks do nothing yet and its `deploy-plan` prints `{"deploy":false}`, so a new abstract's pipeline runs green until
its author fills them in.

## The cycle with jive-abstract-library, and its lag

This package is a library built with `jive-abstract-library`, and `jive-abstract-library` extends this package
(Alex, 2026-11-18). Each repository's pipeline has only its own source, so each installs the other's last published
version:

- This package depends on `jive-abstract-library` (pinned) and runs its installed `jive-library` CLI for every hook.
- `jive-abstract-library` builds itself from source, then runs `jive-abstraction build-template` from its
  devDependency on this package.

Imports go one way only: this package's `jive-abstraction` binary bundles the `jive-abstract-library` it depends on,
and `jive-library` only runs `jive-abstraction` as a separate process, so `bun build --compile` sees no cycle. The cost
is one release of lag each way. A change to the template step reaches `jive-abstract-library`'s build only once this
package publishes and `jive-abstract-library` bumps its devDependency. A change to the library build reaches abstracts
built with this one only once this package bumps its `jive-abstract-library` dependency.

The first release had to go in this order: this package 0.1.0 is built with `jive-abstract-library` 0.14.5, which was
already on npm. `jive-abstract-library` cannot even install until this package is published.

## Known gaps

- **The library build's local install has no template.** jive-abstract-library 0.14.5's build ends by packing
  `dist/base` and installing it into the package's own `node_modules`, and that happens before the template step runs,
  so that local copy lacks `template/`. The published package, packed again at deploy, has it. Closing this needs
  jive-abstract-library to export its build so the template step can run before the pack.
- **`package.schema.json` after a build is jive-abstract-library's.** That library build rewrites it without
  `jive.abstract`; `jive-abstraction dev` writes this abstract's schema. jive-abstract-library's schema allows unknown
  keys, so an editor shows no error either way, only no help for `jive.abstract`.
- **Binary files in a sample** are read and written as UTF-8 text.

## Developing

```sh
bun install
bun run jive:cicd:audit   # type check and tests, the sample abstract's included
bun run jive:cicd:build   # jive-abstract-library's build, then the template step into dist/base/template
```

Run tests and builds on a person's machine with `HOME` set to a scratch folder inside the package (`.scratch/` is
gitignored).
