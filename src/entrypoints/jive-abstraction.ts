import { Effect, Runtime, pipe } from "effect";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Cli, runDevServer } from "jive-abstract-library";
import { version } from "../../package.json";
import { buildTemplateCommand, cicd } from "../internal/commands/cicd";
import { genPackageJsonSchema } from "../internal/public/manifest";

const jiveAbstraction = Cli.make("jive-abstraction", {
  cicd,
  "build-template": buildTemplateCommand,
  dev: Cli.command({
    description: "watch this abstract and keep its generated package.schema.json, jive.abstract included, current while you work",
    *run() {
      yield* Effect.promise(() => runDevServer({ genPackageJsonSchema }));
    },
  }),
});

BunRuntime.runMain(pipe(Cli.run(jiveAbstraction, { version }), Effect.provide(Cli.terminalLogger), Effect.provide(BunServices.layer)), {
  // A pipeline step waits for the process, not for whatever the command leaves open.
  teardown: (exit, onExit) => Runtime.defaultTeardown(exit, (code) => {
    onExit(code);
    process.exit(code);
  }),
});
