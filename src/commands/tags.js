// tags command: view / edit the type list and synonym groups in categories.json.
//   bernard tags                          -> list types and synonym groups
//   bernard tags --add "key=a,b,c"        -> merge synonyms into a group (create if absent)
//   bernard tags --remove "key"           -> remove a group
// Results go to stdout (console.log); diagnostics to stderr via log.*.

import fs from "node:fs";
import path from "node:path";
import { findRepoRoot, bernardDir } from "../core/paths.js";
import { log } from "../util/log.js";
import { getT } from "../i18n/index.js";

function categoriesPath(dir) {
  return path.join(dir, "categories.json");
}

function readCategories(p) {
  let data = { types: [], synonyms: {} };
  if (fs.existsSync(p)) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      if (raw && typeof raw === "object") {
        data.types = Array.isArray(raw.types) ? raw.types : [];
        data.synonyms =
          raw.synonyms && typeof raw.synonyms === "object" ? raw.synonyms : {};
      }
    } catch {
      // unreadable -> treated as empty
    }
  }
  return data;
}

function writeCategories(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export async function tags(parsed) {
  const flags = parsed.flags || {};
  const dir = bernardDir(findRepoRoot());
  const t = getT(dir);
  const p = categoriesPath(dir);

  // --add "key=syn1,syn2"
  if (typeof flags.add === "string" || flags.add === true) {
    if (flags.add === true || flags.add.indexOf("=") === -1) {
      console.log(t("tags.invalidAddFormat"));
      process.exitCode = 1;
      return;
    }
    const eq = flags.add.indexOf("=");
    const key = flags.add.slice(0, eq).trim();
    const syns = flags.add
      .slice(eq + 1)
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (key.length === 0) {
      console.log(t("tags.emptyKey"));
      process.exitCode = 1;
      return;
    }

    const data = readCategories(p);
    const existing = Array.isArray(data.synonyms[key]) ? data.synonyms[key] : [];
    const merged = [];
    for (const s of [...existing, ...syns]) {
      if (!merged.includes(s)) merged.push(s);
    }
    data.synonyms[key] = merged;
    writeCategories(p, data);

    console.log(t("tags.groupUpdated", { key, syns: merged.join(", ") }));
    log.success(t("tags.success"));
    return;
  }

  // --remove "key"
  if (typeof flags.remove === "string" || flags.remove === true) {
    if (flags.remove === true || flags.remove.trim().length === 0) {
      console.log(t("tags.invalidRemoveFormat"));
      process.exitCode = 1;
      return;
    }
    const key = flags.remove.trim();
    const data = readCategories(p);
    if (Object.prototype.hasOwnProperty.call(data.synonyms, key)) {
      delete data.synonyms[key];
      writeCategories(p, data);
      console.log(t("tags.groupRemoved", { key }));
      log.success(t("tags.success"));
    } else {
      console.log(t("tags.groupNotFound", { key }));
    }
    return;
  }

  // default: list
  const data = readCategories(p);

  console.log(t("tags.typesHeader"));
  if (data.types.length > 0) console.log(`  ${data.types.join(", ")}`);
  else console.log(`  ${t("tags.noTypes")}`);

  console.log("");
  console.log(t("tags.synonymsHeader"));
  const keys = Object.keys(data.synonyms);
  if (keys.length > 0) {
    for (const key of keys) {
      const syns = Array.isArray(data.synonyms[key]) ? data.synonyms[key] : [];
      console.log(`  ${key}: ${syns.join(", ")}`);
    }
  } else {
    console.log(`  ${t("tags.noSynonyms")}`);
  }
}
