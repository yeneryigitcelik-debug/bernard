import readline from "node:readline";
import path from "node:path";
import { appendRecord } from "../core/store.js";
import { findRepoRoot, bernardDir } from "../core/paths.js";
import { isGitRepo, recentCommits } from "../util/git.js";
import { log } from "../util/log.js";
import { getT } from "../i18n/index.js";

// Guess a record type from the commit title (case-insensitive).
function guessType(title) {
  const b = String(title || "").trim();
  if (/^(feat|feature)/i.test(b)) return "decision";
  if (/^(fix|bug|hotfix)/i.test(b)) return "bug";
  if (/^(refactor|perf|arch)/i.test(b)) return "architecture";
  if (/^(docs|chore|test|style|ci|build)/i.test(b)) return "note";
  return "note";
}

// Derive tags from changed files: top-level dirs, else file extension.
function guessTags(files) {
  const set = new Set();
  for (const f of files || []) {
    const clean = String(f || "").trim();
    if (!clean) continue;
    const parts = clean.split("/").filter(Boolean);
    if (parts.length > 1) {
      set.add(parts[0]);
    } else {
      const ext = path.extname(clean).replace(/^\./, "");
      set.add(ext || clean);
    }
  }
  return [...set].map((s) => s.trim()).filter(Boolean);
}

function asNumber(value, def) {
  if (value == null || value === true) return def;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

function ask(rl, q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

function isYes(answer) {
  const a = answer.trim().toLowerCase();
  return a === "y" || a === "yes" || a === "e" || a === "evet";
}

export async function suggest(parsed) {
  const flags = parsed.flags || {};
  const root = findRepoRoot();
  const dir = bernardDir(root);
  const t = getT(dir);

  if (!isGitRepo(root)) {
    log.warn(t("suggest.notGitRepo"));
    return;
  }

  const n = asNumber(flags.n, 3);
  const commits = recentCommits(root, n);
  if (!commits.length) {
    log.warn(t("suggest.noCommits"));
    return;
  }

  // Build one draft record per commit.
  const drafts = commits.map((c) => {
    const type = guessType(c.title);
    const body = (c.body || "").trim();
    const content = (body ? body + "\n\n" : "") + "(commit " + c.shortHash + ")";
    const tags = guessTags(c.files);
    return { type, title: c.title, content, tags };
  });

  console.log(t("suggest.header", { n: drafts.length }));
  console.log("");
  console.log(t("suggest.note1"));
  console.log(t("suggest.note2"));
  console.log("");

  drafts.forEach((d, i) => {
    const tags = d.tags.length ? d.tags.join(", ") : t("suggest.none");
    console.log(`--- ${i + 1} ---`);
    console.log(`${t("suggest.labelType")}: ${d.type}`);
    console.log(`${t("suggest.labelTitle")}: ${d.title}`);
    console.log(`${t("suggest.labelTags")}: ${tags}`);
    console.log(`${t("suggest.labelContent")}: ${d.content.replace(/\n/g, "\n  ")}`);
    console.log("");
  });

  const addRequested = flags.add === true || flags.add === "true";

  if (addRequested && process.stdin.isTTY) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    try {
      for (let i = 0; i < drafts.length; i++) {
        const d = drafts[i];
        const answer = await ask(
          rl,
          t("suggest.savePrompt", { i: i + 1, n: drafts.length, title: d.title })
        );
        if (isYes(answer)) {
          const rec = appendRecord(dir, {
            type: d.type,
            title: d.title,
            content: d.content,
            tags: d.tags,
            source: "manual",
          });
          console.log(t("suggest.saved", { id: rec.id, type: rec.type, title: rec.title }));
        } else {
          log.dim(t("suggest.skipped"));
        }
      }
    } finally {
      rl.close();
    }
  } else {
    console.log(t("suggest.useAddHint"));
    if (addRequested && !process.stdin.isTTY) log.dim(t("suggest.ttyHint"));
  }
}
