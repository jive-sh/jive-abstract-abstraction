# jive-abstract-widget

A [Jive](https://github.com/jive-sh/jive) abstract for widget packages. A widget package extends it by pointing its six
`jive:cicd:*` scripts at this abstract's CLI, `jive-widget` (`"jive:cicd:build": "jive-widget cicd build"`), and
`jive create widget` makes a new one from the sample widget package in [`src/template/`](src/template).

Each hook is a stub that does nothing yet and exits zero, and `deploy-plan` prints `{"deploy":false}`, so a widget
package's pipeline runs green and deploys nothing. Fill in what building and deploying a widget means in
[`src/entrypoints/jive-widget.ts`](src/entrypoints/jive-widget.ts), and what a widget package's manifest holds in
[`src/index.ts`](src/index.ts).

This abstract is itself built with [`jive-abstract-abstraction`](https://github.com/jive-sh/jive-abstract-abstraction):
its build is jive-abstract-library's plus the template step, which turns `src/template/` into the `.ejs` files
`jive create widget` renders, replacing each literal `jive.abstract.replacements` names with the input that takes its
place.
