import { Effect, Layer, Option, pipe } from "effect";
import { BunFileSystem } from "@effect/platform-bun";
import { loadPackageJson, makeCicdCommandFactory, OSPlatform, OSPlatformImpl, packageRootDir } from "jive-abstract-library";
import { PackageJsonSchema } from "../public/manifest";
import { buildTemplate } from "../public/template-build";

/**
 * The hooks of an abstract built with this one. An abstract is a library with a template, so each hook is
 * jive-abstract-library's, run through its installed `jive-library` CLI (0.14.5 exports its hooks' commands but not
 * the build they run), and the build adds the template step.
 */

const LIBRARY_CLI = "jive-library";

const hookLayer = pipe(OSPlatformImpl.Layer, Layer.provideMerge(BunFileSystem.layer));
const { makeCicdCommand } = makeCicdCommandFactory(hookLayer);

/** Runs one of jive-abstract-library's hooks with this process's input and output, so get-config's stdout is its own. */
function* runLibraryHook(hook: string) {
  const osPlatform = yield* OSPlatform;
  const maybeCli = yield* osPlatform.findExecutable(LIBRARY_CLI);
  if (Option.isNone(maybeCli)) {
    return yield* Effect.fail(
      `${LIBRARY_CLI} is not on PATH: jive-abstract-abstraction runs jive-abstract-library's hooks, which it depends on;`
      + ` run the hook as \`bun run jive:cicd:<hook>\`, which puts node_modules/.bin on PATH`,
    );
  }
  yield* Effect.logInfo(`Running jive-abstract-library's ${hook} hook: ${maybeCli.value} cicd ${hook}`);
  const { exitCode } = yield* osPlatform.spawnProcess({
    command: maybeCli.value,
    args: ["cicd", hook],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if (exitCode !== 0) return yield* Effect.fail(`${LIBRARY_CLI} cicd ${hook} exited with code ${exitCode}`);
}

/** Checks package.json against this abstract's schema, the `jive.abstract` block included, and returns it. */
function* loadManifest() {
  return yield* loadPackageJson(PackageJsonSchema);
}

function* templateStep() {
  const { jive } = yield* loadManifest();
  yield* buildTemplate({ rootDir: yield* packageRootDir, abstract: jive.abstract });
}

function delegatingHook(hook: string, description: string) {
  return makeCicdCommand(hook, description, function* () {
    yield* runLibraryHook(hook);
  });
}

export const buildTemplateCommand = makeCicdCommand(
  "build-template",
  "after jive-abstract-library's build: write dist/base/template/ from the sample package at src/template/, and record jive.abstract in dist/base/package.json",
  templateStep,
);

/** The six hooks Jive's reusable pipeline calls, by the names `CICD_API.md` gives them. */
export const cicd = {
  "get-config": makeCicdCommand(
    "get-config",
    "check package.json, jive.abstract included, then print the validated jive config as jive-abstract-library does",
    function* () {
      yield* loadManifest();
      yield* runLibraryHook("get-config");
    },
  ),
  build: makeCicdCommand(
    "build",
    "build the abstract with jive-abstract-library, then write its template from src/template/ into dist/base/template/",
    function* () {
      yield* loadManifest();
      yield* runLibraryHook("build");
      yield* templateStep();
    },
  ),
  audit: delegatingHook("audit", "jive-abstract-library's audit"),
  "deploy-plan": delegatingHook("deploy-plan", "print whether this environment has a version to publish, as jive-abstract-library decides it"),
  "upload-artifacts": delegatingHook("upload-artifacts", "jive-abstract-library's upload-artifacts"),
  deploy: delegatingHook("deploy", "publish the built abstract, its template included, with jive-abstract-library"),
};

