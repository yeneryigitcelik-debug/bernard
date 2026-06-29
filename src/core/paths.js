import fs from "node:fs";
import path from "node:path";
import { log } from "../util/log.js";
import { getT } from "../i18n/index.js";

// Walk up looking for a directory that contains .git; fall back to cwd.
export function findRepoRoot(cwd = process.cwd()) {
  let d = path.resolve(cwd);
  while (true) {
    if (fs.existsSync(path.join(d, ".git"))) return d;
    const parent = path.dirname(d);
    if (parent === d) break; // filesystem root
    d = parent;
  }
  log.warn(getT(null)("common.noGitRepo"));
  return path.resolve(cwd);
}

export function bernardDir(root) {
  return path.join(root, ".bernard");
}
