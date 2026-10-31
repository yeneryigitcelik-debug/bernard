// Git helpers using node:child_process execFileSync. Failures never leak to the
// caller (every failure returns [] / "" / false).
import { execFileSync } from "node:child_process";
import path from "node:path";

// Run a single git command. Returns null on failure (never throws).
function git(root, args) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

// Is `root` a git repository?
export function isGitRepo(root) {
  if (!root) return false;
  const out = git(root, ["rev-parse", "--is-inside-work-tree"]);
  return typeof out === "string" && out.trim() === "true";
}

// Absolute path of a hook as git resolves it (worktrees, core.hooksPath). null on failure.
export function gitHookPath(root, name) {
  if (!root || !name) return null;
  // Resolve the directory only: Git canonicalizes a symlinked leaf, which
  // would bypass install-hook's lstat check and remove the user-owned target.
  const rel = "hooks";
  let out = git(root, ["rev-parse", "--path-format=absolute", "--git-path", rel]);
  if (out === null) out = git(root, ["rev-parse", "--git-path", rel]);
  if (out === null) return null;
  const p = out.trim().split("\n").pop().trim();
  return p && !p.startsWith("--") ? path.join(path.resolve(root, p), name) : null;
}

// NUL separates fields and records; commit messages cannot contain NUL.
// File names come from diff-tree, never inferred from a body paragraph.
export function recentCommits(root, n = 5) {
  if (!isGitRepo(root)) return [];
  const count = Number.isInteger(n) && n > 0 ? n : 5;
  const out = git(root, ["log", "-n", String(count), "-z", "--format=%H%x00%h%x00%s%x00%aI%x00%b"]);
  if (out === null) return [];
  const fields = out.split("\0");
  const commits = [];
  for (let i = 0; i + 4 < fields.length; i += 5) {
    const [hash, shortHash, title, date, body] = fields.slice(i, i + 5);
    if (!/^[0-9a-f]{40,64}$/.test(hash)) continue;
    const names = git(root, ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "-z", hash, "--"]);
    commits.push({ hash, shortHash, title, date, body: body.trim(), files: names ? names.split("\0").filter(Boolean) : [] });
  }
  return commits;
}

// `git show --stat -p` for a commit, capped at ~4000 chars. "" on failure.
export function commitDiff(root, hash) {
  if (!root || !hash) return "";
  const out = git(root, ["show", "--stat", "-p", String(hash)]);
  if (out === null) return "";
  const CAP = 4000;
  return out.length <= CAP ? out : out.slice(0, CAP) + "\n…[truncated at 4000 chars]";
}
