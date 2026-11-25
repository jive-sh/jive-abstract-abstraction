/**
 * The public surface of jive-abstract-abstraction, the abstract that abstracts extend.
 *
 * What lives here: the shape of an abstract's package.json (`jive.abstract` beside jive-abstract-library's blocks),
 * the template step an abstract's build runs (`buildTemplate`), and the template format in both directions, which
 * the build writes and `jive create` renders (`encodeTemplate`, `renderTemplate`, `templateInputNames`), with the
 * published manifest create reads (`PublishedAbstractManifest`).
 */

export {
  AbstractSchema,
  PackageJsonSchema,
  PublishedAbstractManifest,
  TEMPLATE_DIRECTORY,
  TEMPLATE_FILE_SUFFIX,
  TEMPLATE_SOURCE_DIRECTORY,
  genPackageJsonSchema,
  type AbstractConfig,
  type PackageJson,
} from "./internal/public/manifest";

export { buildTemplate } from "./internal/public/template-build";

export {
  encodeTemplate,
  renderTemplate,
  templateInputNames,
  type EncodedTemplate,
  type TemplateFile,
} from "./internal/public/template-format";
