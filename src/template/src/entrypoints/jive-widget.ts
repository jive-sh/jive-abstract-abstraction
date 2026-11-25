import { Effect, Runtime, Schema, pipe } from "effect";
import { BunFileSystem, BunRuntime, BunServices } from "@effect/platform-bun";
import { Cli, loadPackageJson, makeCicdCommandFactory } from "jive-abstract-library";
import { version } from "../../package.json";
import { PackageJsonSchema } from "../index";

const { makeCicdCommand, makePipelineCommand, makeDeployCommand, makeDeployPlanCommand } = makeCicdCommandFactory(BunFileSystem.layer);

/** The six hooks Jive's reusable pipeline calls on a widget package, by the names `CICD_API.md` gives them. */
const cicd = {
  "get-config": makeCicdCommand("get-config", "print this package's validated jive config as JSON", function* () {
    const { jive } = yield* loadPackageJson(PackageJsonSchema);
    process.stdout.write(`${JSON.stringify(Schema.encodeUnknownSync(PackageJsonSchema.fields.jive)(jive))}\n`);
  }),
  build: makeCicdCommand("build", "build the package (nothing yet)", function* () {
    yield* Effect.logInfo("Nothing to build yet");
  }),
  audit: makeCicdCommand("audit", "check the package (nothing yet)", function* () {
    yield* Effect.logInfo("Nothing to audit yet");
  }),
  "deploy-plan": makeDeployPlanCommand("deploy-plan", "print whether this environment has anything to deploy (never, yet)", function* () {
    return { deploy: false } as const;
  }),
  "upload-artifacts": makePipelineCommand("upload-artifacts", "upload the build's artifacts (nothing yet)", function* (context) {
    yield* Effect.logInfo(`Nothing to upload for ${context.repository.owner}/${context.repository.name}`);
  }),
  deploy: makeDeployCommand("deploy", "deploy the package (nothing yet)", function* ({ environment }) {
    yield* Effect.logInfo(`Nothing to deploy to ${environment}`);
  }),
};

BunRuntime.runMain(pipe(Cli.run(Cli.make("jive-widget", { cicd }), { version }), Effect.provide(Cli.terminalLogger), Effect.provide(BunServices.layer)), {
  teardown: (exit, onExit) => Runtime.defaultTeardown(exit, (code) => {
    onExit(code);
    process.exit(code);
  }),
});
