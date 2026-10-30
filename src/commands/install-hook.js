import fs from "node:fs";
import path from "node:path";
import { findRepoRoot, bernardDir } from "../core/paths.js";
import { isGitRepo, gitHookPath } from "../util/git.js";
import { log } from "../util/log.js";
import { getT, makeT } from "../i18n/index.js";

// Explicit managed-block markers. Only an exact, owned block is ever removed.
export const BEGIN = "# >>> bernard managed block >>>";
export const END = "# <<< bernard managed block <<<";
const LEGACY_MARKER = "# bernard";

const shq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
export const managedBlock = (r) => `${BEGIN}\necho ${shq(r)} 1>&2\n${END}\n`;
const fullHook = (r) => "#!/bin/sh\n" + managedBlock(r);
// Exact template written by older bernard versions (removable only on exact match).
export const legacyHook = (r) =>
  [
    "#!/bin/sh",
    LEGACY_MARKER,
    "# bernard post-commit hook: remind to extract record suggestions.",
    `echo "${r}" 1>&2`,
    "",
  ].join("\n");

const errMsg = (e) => (e && e.message ? e.message : String(e));
const count = (s, sub) => s.split(sub).length - 1;

function classify(content, current) {
  const legacy = [makeT("en")("hook.reminder"), makeT("tr")("hook.reminder")];
  const known = [...new Set([current, ...legacy])];
  if (legacy.some((r) => content === legacyHook(r))) return { kind: "legacy" };
  if (known.some((r) => content === fullHook(r))) return { kind: "full" };
  if (count(content, BEGIN) === 1 && count(content, END) === 1) {
    for (const r of known) {
      const b = managedBlock(r);
      const i = content.indexOf(b);
      if (i >= 0 && (i === 0 || content[i - 1] === "\n")) return { kind: "block", start: i, len: b.length };
    }
  }
  return { kind: "foreign" };
}

// null = missing; {content} = regular file; {} = symlink/other (never touched).
function inspect(hook) {
  let st;
  try {
    st = fs.lstatSync(hook);
  } catch (e) {
    if (e && e.code === "ENOENT") return null;
    throw e;
  }
  if (!st.isFile()) return {};
  return { content: fs.readFileSync(hook, "utf8") };
}

const kindOf = (cur, reminder) =>
  typeof cur.content === "string" ? classify(cur.content, reminder) : { kind: "foreign" };

export async function installHook(parsed) {
  const root = findRepoRoot();
  const t = getT(bernardDir(root));
  const reminder = t("hook.reminder");
  const fail = (key, outKey, e) => {
    log.error(t(key, { error: errMsg(e) }));
    console.log(t(outKey));
    process.exitCode = 1;
  };

  const hook = isGitRepo(root) ? gitHookPath(root, "post-commit") : null;
  if (!hook) {
    log.warn(t("hook.notGitRepo"));
    console.log(t("hook.notGitRepoOut"));
    process.exitCode = 1;
    return;
  }

  if (parsed.flags.remove) {
    let cur;
    try {
      cur = inspect(hook);
    } catch (e) {
      return fail("hook.removeFailed", "hook.removeFailedOut", e);
    }
    if (!cur) {
      console.log(t("hook.removeNone"));
      log.dim(t("hook.removeNoneDim"));
      return;
    }
    const c = kindOf(cur, reminder);
    if (c.kind === "foreign") {
      log.warn(t("hook.removeNotOurs"));
      console.log(t("hook.removeNotOursOut"));
      return;
    }
    try {
      if (c.kind === "block") {
        fs.writeFileSync(hook, cur.content.slice(0, c.start) + cur.content.slice(c.start + c.len), "utf8");
      } else {
        fs.rmSync(hook);
      }
    } catch (e) {
      return fail("hook.removeFailed", "hook.removeFailedOut", e);
    }
    console.log(t("hook.removed", { path: hook }));
    log.success(t("hook.removeSuccess"));
    return;
  }

  let cur;
  try {
    cur = inspect(hook);
    if (!cur) {
      fs.mkdirSync(path.dirname(hook), { recursive: true });
      try {
        // Exclusive create: never clobber a hook that appeared concurrently.
        fs.writeFileSync(hook, fullHook(reminder), { encoding: "utf8", flag: "wx", mode: 0o755 });
        fs.chmodSync(hook, 0o755);
        console.log(t("hook.installed", { path: hook }));
        console.log(t("hook.installedHint"));
        log.success(t("hook.success"));
        return;
      } catch (e) {
        if (!e || e.code !== "EEXIST") throw e;
        cur = inspect(hook) || {};
      }
    }
  } catch (e) {
    return fail("hook.installFailed", "hook.installFailedOut", e);
  }

  if (kindOf(cur, reminder).kind !== "foreign") {
    console.log(t("hook.alreadyInstalled", { path: hook }));
    log.dim(t("hook.noChange"));
    return;
  }
  log.warn(t("hook.existsNotOurs"));
  console.log(t("hook.existsOut", { path: hook }));
  console.log(t("hook.snippetIntro"));
  console.log(managedBlock(reminder));
}
