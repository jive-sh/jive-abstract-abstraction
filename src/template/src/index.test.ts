import { expect, test } from "bun:test";
import { Schema } from "effect";
import samplePackageJson from "./template/package.json";
import { PackageJsonSchema } from "./index";

test("the sample widget package in src/template matches the widget package.json schema", () => {
  expect(() => Schema.decodeUnknownSync(PackageJsonSchema)(samplePackageJson)).not.toThrow();
});
