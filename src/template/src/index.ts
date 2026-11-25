import { makeJivePackageJsonSchema } from "jive-abstract-library";

/**
 * The shape of a widget package's package.json: the fields every Jive package has. Add this abstract's own block
 * beside `cicd` (`makeJivePackageJsonSchema({ widget: ... })`) when widget packages have something to configure.
 */
export const PackageJsonSchema = makeJivePackageJsonSchema({});
