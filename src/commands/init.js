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

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // 1) records.jsonl (empty)
  const recordsPath = path.join(dir, "records.jsonl");
  if (fs.existsSync(recordsPath)) {
    skipped.push(".bernard/records.jsonl");
  } else {
    fs.writeFileSync(recordsPath, "", "utf8");
    created.push(".bernard/records.jsonl");
  }

  // 2) categories.json
  const categoriesPath = path.join(dir, "categories.json");
  if (fs.existsSync(categoriesPath)) {
    skipped.push(".bernard/categories.json");
  } else {
    const categories = { types: [...TYPES], synonyms: seedSynonyms(locale) };
    fs.writeFileSync(categoriesPath, JSON.stringify(categories, null, 2) + "\n", "utf8");
    created.push(".bernard/categories.json");
  }

  // 3) config.json
  const configPath = path.join(dir, "config.json");
  if (fs.existsSync(configPath)) {
    skipped.push(".bernard/config.json");
  } else {
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
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
    created.push(".bernard/config.json");
  }

  // 4) add ".bernard/.cache/" to .gitignore
  const gitignorePath = path.join(root, ".gitignore");
  const ignoreLine = ".bernard/.cache/";
  let gi = "";
  let giExisted = false;
  if (fs.existsSync(gitignorePath)) {
    giExisted = true;
    gi = fs.readFileSync(gitignorePath, "utf8");
  }
  if (gi.split(/\r?\n/).map((s) => s.trim()).includes(ignoreLine)) {
    skipped.push(t("init.gitignoreContains"));
  } else {
    let add = ignoreLine + "\n";
    if (giExisted && gi.length > 0 && !gi.endsWith("\n")) add = "\n" + add;
    fs.appendFileSync(gitignorePath, add, "utf8");
    created.push(giExisted ? t("init.gitignoreAdded") : t("init.gitignoreCreated"));
  }

  // 5) add union-merge line to .gitattributes (idempotent)
  const gitattributesPath = path.join(root, ".gitattributes");
  const attrLine = ".bernard/records.jsonl merge=union";
  let attr = "";
  let attrExisted = false;
  if (fs.existsSync(gitattributesPath)) {
    attrExisted = true;
    attr = fs.readFileSync(gitattributesPath, "utf8");
  }
  if (attr.split(/\r?\n/).map((s) => s.trim()).includes(attrLine)) {
    skipped.push(t("init.gitattrContains"));
  } else {
    let add = attrLine + "\n";
    if (attrExisted && attr.length > 0 && !attr.endsWith("\n")) add = "\n" + add;
    fs.appendFileSync(gitattributesPath, add, "utf8");
    created.push(attrExisted ? t("init.gitattrAdded") : t("init.gitattrCreated"));
  }

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
}
