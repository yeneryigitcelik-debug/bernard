// Git helpers using node:child_process execFileSync. Failures never leak to the
// caller (every failure returns [] / "" / false).
import { execFileSync } from "node:child_process";

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

// Separators for pretty format (unlikely to collide with commit messages).
const FIELD = "\x1f"; // unit separator
const RECORD = "\x1e"; // record separator

// Return the last N commits, structured.
// Each commit: { hash, shortHash, title, body, date, files: [] }
// Returns [] if not a repo / no commits.
export function recentCommits(root, n = 5) {
  if (!isGitRepo(root)) return [];
  const count = Number.isInteger(n) && n > 0 ? n : 5;

  // Separate commits with %x1e and fields with %x1f. body (%b) may be
  // multi-line, so it goes last.
  const pretty = `--pretty=format:${RECORD}%H${FIELD}%h${FIELD}%s${FIELD}%aI${FIELD}%b`;
  const out = git(root, ["log", `-n`, String(count), "--name-only", pretty]);
  if (out === null) return [];

  const commits = [];
  const blocks = out.split(RECORD);
  for (const block of blocks) {
    if (!block.trim()) continue;
    // First 4 fields are fixed; the 5th (body) is followed by the file list.
    const parts = block.split(FIELD);
    if (parts.length < 5) continue;
    const hash = parts[0].trim();
    const shortHash = parts[1].trim();
    const title = parts[2];
    const date = parts[3].trim();
    // 5th part: body + "\n" + file lines (from --name-only).
    const rest = parts.slice(4).join(FIELD);
    const lines = rest.split("\n");

    // git leaves a blank line between the body and the --name-only file list.
    // Walk from the end, collecting consecutive file-like lines, then treat
    // the remainder as the body.
    const files = [];
    let i = lines.length - 1;
    while (i >= 0 && lines[i].trim() === "") i--; // drop trailing blanks
    const collected = [];
    while (i >= 0) {
      const line = lines[i];
      if (line.trim() === "") break; // blank between body and files
      collected.push(line);
      i--;
    }
    for (let j = collected.length - 1; j >= 0; j--) {
      const p = collected[j].trim();
      if (p) files.push(p);
    }
    const body = lines.slice(0, i + 1).join("\n").trim();

    commits.push({ hash, shortHash, title, body, date, files });
  }
  return commits;
}

// `git show --stat -p` for a commit, capped at ~4000 chars. "" on failure.
export function commitDiff(root, hash) {
  if (!root || !hash) return "";
  const out = git(root, ["show", "--stat", "-p", String(hash)]);
  if (out === null) return "";
  const CAP = 4000;
  return out.length <= CAP ? out : out.slice(0, CAP);
}
