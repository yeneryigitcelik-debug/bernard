import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { findRepoRoot, bernardDir } from "../core/paths.js";
import { TYPES } from "../util/schema.js";
import { log } from "../util/log.js";
import { makeT, resolveLocale, localeFromConfig } from "../i18n/index.js";

function detectProjectName(root) {
  // 1) package.json name
  try {
    const pkgPath = path.join(root, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg && typeof pkg.name === "string" && pkg.name.trim().length > 0) {
        return pkg.name.trim();
      }
    }
  } catch {
    // unreadable package.json -> next strategy
  }

  // 2) git remote origin url -> last segment (strip .git)
  try {
    const remote = execSync("git config --get remote.origin.url", {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (remote.length > 0) {
      let last = remote.split(/[/:]/).filter(Boolean).pop() || "";
      last = last.replace(/\.git$/, "").trim();
      if (last.length > 0) return last;
    }
  } catch {
    // no git / no remote -> next strategy
  }

  // 3) repo folder name
  return path.basename(root);
}

// Locale-appropriate starter synonym groups (the owner enriches these over time).
function seedSynonyms(locale) {
  if (locale === "tr") {
    return {
      auth: ["authentication", "kimlik doğrulama", "giriş", "oturum"],
      db: ["veritabanı", "database", "postgres", "sql"],
      payment: ["ödeme", "tahsilat", "iyzico", "stripe"],
    };
  }
  return {
    auth: ["authentication", "login", "session", "signin"],
    db: ["database", "postgres", "mysql", "sql"],
    payment: ["billing", "checkout", "stripe", "invoice"],
  };
}

/**
 * Atomically create a file only if it does not exist (O_CREAT|O_EXCL).
 * Returns true if created, false if it already existed (never overwrites).
 * The content is computed lazily, only when creation is actually attempted.
 */
function createExclusive(filePath, makeContent) {
  try {
    fs.writeFileSync(filePath, makeContent(), { encoding: "utf8", flag: "wx" });
    return true;
  } catch (err) {
    if (err && err.code === "EEXIST") return false;
    throw err;
  }
}

/**
 * Idempotently append a line to a text file without losing existing content.
 * Uses append mode only (never truncates). Returns "contains" | "added" | "created".
 */
function ensureLine(filePath, line) {
  let existing = null;
  try {
    existing = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    if (!err || err.code !== "ENOENT") throw err;
  }

  if (existing === null) {
    // Try exclusive creation first; if someone created it meanwhile, fall back to append.
    if (createExclusive(filePath, () => line + "\n")) return "created";
    existing = fs.readFileSync(filePath, "utf8");
  }

  if (existing.split(/\r?\n/).map((s) => s.trim()).includes(line)) return "contains";

  let add = line + "\n";
  if (existing.length > 0 && !existing.endsWith("\n")) add = "\n" + add;
  fs.appendFileSync(filePath, add, "utf8");
  return "added";
}

export async function init(parsed) {
  const root = findRepoRoot();
  const dir = bernardDir(root);
  const locale = resolveLocale({
    flag: parsed?.flags?.locale,
    config: localeFromConfig(dir),
  });
  const t = makeT(locale);

  const created = [];
  const skipped = [];

  fs.mkdirSync(dir, { recursive: true });

  // 1) records.jsonl (empty)
  const recordsPath = path.join(dir, "records.jsonl");
  if (createExclusive(recordsPath, () => "")) {
    created.push(".bernard/records.jsonl");
  } else {
    skipped.push(".bernard/records.jsonl");
  }

  // 2) categories.json
  const categoriesPath = path.join(dir, "categories.json");
  if (
    createExclusive(categoriesPath, () => {
      const categories = { types: [...TYPES], synonyms: seedSynonyms(locale) };
      return JSON.stringify(categories, null, 2) + "\n";
    })
  ) {
    created.push(".bernard/categories.json");
  } else {
    skipped.push(".bernard/categories.json");
  }

  // 3) config.json
  const configPath = path.join(dir, "config.json");
  if (
    createExclusive(configPath, () => {
      const config = {
        project: detectProjectName(root),
        locale,
        retrieval: {
          max_results: 8,
          recency_weight: 0.3,
          half_life_days: 30,
          type_weights: {
            decision: 1.2,
            architecture: 1.2,
            bug: 1.0,
            preference: 1.0,
            note: 0.9,
          },
        },
      };
      return JSON.stringify(config, null, 2) + "\n";
    })
  ) {
    created.push(".bernard/config.json");
  } else {
    skipped.push(".bernard/config.json");
  }

  // 4) add ".bernard/.cache/" to .gitignore
  const gi = ensureLine(path.join(root, ".gitignore"), ".bernard/.cache/");
  if (gi === "contains") skipped.push(t("init.gitignoreContains"));
  else created.push(gi === "added" ? t("init.gitignoreAdded") : t("init.gitignoreCreated"));

  // 5) add union-merge line to .gitattributes (idempotent)
  const ga = ensureLine(path.join(root, ".gitattributes"), ".bernard/records.jsonl merge=union");
  if (ga === "contains") skipped.push(t("init.gitattrContains"));
  else created.push(ga === "added" ? t("init.gitattrAdded") : t("init.gitattrCreated"));

  // Summary (stdout)
  console.log(t("init.done", { dir }));
  if (created.length > 0) {
    console.log(t("init.created"));
    for (const c of created) console.log(`  + ${c}`);
  }
  if (skipped.length > 0) {
    console.log(t("init.skipped"));
    for (const s of skipped) console.log(`  - ${s}`);
  }
  if (created.length === 0) console.log(t("init.allInPlace"));

  log.success(t("init.success"));
  return { dir, created, skipped };
}
