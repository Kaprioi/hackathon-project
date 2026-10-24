// Runs before `npm run dev` and `npm test`. After pulling someone else's changes,
// package.json may list a package this computer doesn't have yet (like
// "web-push"), which otherwise fails with a confusing "Cannot find package"
// error. This says plainly what's missing and how to fix it.

import { existsSync, readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const wanted = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const missing = wanted.filter((name) => !existsSync(new URL(`../node_modules/${name}/package.json`, import.meta.url)));

if (missing.length) {
  console.error(`\nSome packages aren't installed on this computer yet: ${missing.join(", ")}`);
  console.error("Someone added them to the project. Run this once, then try again:\n\n    npm install\n");
  process.exit(1);
}
