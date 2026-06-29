import fs from "node:fs";
import path from "node:path";
import { findRepoRoot, bernardDir } from "../core/paths.js";
import { isGitRepo } from "../util/git.js";
import { log } from "../util/log.js";
import { getT } from "../i18n/index.js";

// Identifies a hook installed by bernard.
const MARKER = "# bernard";

function hookContent(reminder) {
  return [
    "#!/bin/sh",
    MARKER,
    "# bernard post-commit hook: remind to extract record suggestions.",
    `echo "${reminder}" 1>&2`,
    "",
  ].join("\n");
}

function snippet(reminder) {
  return ["", "  " + MARKER, `  echo "${reminder}" 1>&2`, ""].join("\n");
}

export async function installHook(parsed) {
  const root = findRepoRoot();
  const dir = bernardDir(root);
  const t = getT(dir);
  const reminder = t("hook.reminder");

  if (!isGitRepo(root)) {
    log.warn(t("hook.notGitRepo"));
    console.log(t("hook.notGitRepoOut"));
    process.exitCode = 1;
    return;
  }

  const hooksDir = path.join(root, ".git", "hooks");
  const hook = path.join(hooksDir, "post-commit");
  const remove = !!parsed.flags.remove;

  // --remove: only remove a hook that bernard installed.
  if (remove) {
    if (!fs.existsSync(hook)) {
      console.log(t("hook.removeNone"));
      log.dim(t("hook.removeNoneDim"));
      return;
    }
    let existing = "";
    try {
      existing = fs.readFileSync(hook, "utf8");
    } catch {
      existing = "";
    }
    if (!existing.includes(MARKER)) {
      log.warn(t("hook.removeNotOurs"));
      console.log(t("hook.removeNotOursOut"));
      return;
    }
    try {
      fs.rmSync(hook);
    } catch (e) {
      log.error(t("hook.removeFailed", { error: e && e.message ? e.message : String(e) }));
      console.log(t("hook.removeFailedOut"));
      process.exitCode = 1;
      return;
    }
    console.log(t("hook.removed", { path: hook }));
    log.success(t("hook.removeSuccess"));
    return;
  }

  // Install: do not overwrite an existing non-bernard hook.
  if (fs.existsSync(hook)) {
    let existing = "";
    try {
      existing = fs.readFileSync(hook, "utf8");
    } catch {
      existing = "";
    }
    if (existing.includes(MARKER)) {
      console.log(t("hook.alreadyInstalled", { path: hook }));
      log.dim(t("hook.noChange"));
      return;
    }
    log.warn(t("hook.existsNotOurs"));
    console.log(t("hook.existsOut", { path: hook }));
    console.log(t("hook.snippetIntro"));
    console.log(snippet(reminder));
    return;
  }

  // Write a new hook and make it executable.
  if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });
  try {
    fs.writeFileSync(hook, hookContent(reminder), "utf8");
    fs.chmodSync(hook, 0o755);
  } catch (e) {
    log.error(t("hook.installFailed", { error: e && e.message ? e.message : String(e) }));
    console.log(t("hook.installFailedOut"));
    process.exitCode = 1;
    return;
  }

  console.log(t("hook.installed", { path: hook }));
  console.log(t("hook.installedHint"));
  log.success(t("hook.success"));
}
