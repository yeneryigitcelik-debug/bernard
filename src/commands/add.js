import readline from "node:readline";
import { appendRecord, updateRecord, readRecords } from "../core/store.js";
import { findRepoRoot, bernardDir } from "../core/paths.js";
import { validateRecord, normalizeTags, TYPES } from "../util/schema.js";
import { log } from "../util/log.js";
import { getT } from "../i18n/index.js";

// "auth,db" -> ["auth", "db"]; drop empty/whitespace entries
function parseTags(value) {
  if (value == null || value === true) return [];
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// flag may be a string, or boolean true (valueless flag) -> ignore
function asString(value) {
  if (value == null || value === true) return undefined;
  const s = String(value).trim();
  return s === "" ? undefined : s;
}

function ask(rl, q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

export async function add(parsed) {
  const flags = parsed.flags || {};
  const dir = bernardDir(findRepoRoot());
  const t = getT(dir);

  let type = asString(flags.type);
  let title = asString(flags.title);
  let content = asString(flags.content);
  let tags = parseTags(flags.tags);

  const missing = !type || !title || !content;

  if (missing) {
    if (process.stdin.isTTY) {
      // Interactive mode: ask for the missing fields.
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stderr,
      });
      try {
        while (!type) {
          const a = (await ask(rl, t("add.promptType", { types: TYPES.join("/") }))).trim();
          if (TYPES.includes(a)) type = a;
          else if (a) log.warn(t("add.invalidType", { types: TYPES.join(", ") }));
        }
        while (!title) title = (await ask(rl, t("add.promptTitle"))).trim();
        while (!content) content = (await ask(rl, t("add.promptContent"))).trim();
        if (tags.length === 0) tags = parseTags(await ask(rl, t("add.promptTags")));
      } finally {
        rl.close();
      }
    } else {
      const miss = [];
      if (!type) miss.push("--type");
      if (!title) miss.push("--title");
      if (!content) miss.push("--content");
      log.error(t("add.missingFields", { fields: miss.join(", ") }));
      log.error(t("add.usage"));
      process.exitCode = 1;
      return;
    }
  }

  // --supersedes <oldId>: new record supersedes an old one
  const oldId = asString(flags.supersedes);
  if (oldId) {
    const records = readRecords(dir);
    if (!records.some((r) => r.id === oldId)) {
      log.error(t("add.supersedeNotFound", { id: oldId }));
      process.exitCode = 1;
      return;
    }
  }

  // Validate before writing.
  const candidate = {
    type,
    title,
    content,
    tags: normalizeTags(tags),
    source: "manual",
  };
  const { ok, errors } = validateRecord(candidate, t);
  if (!ok) {
    log.error(t("add.validateFailed"));
    for (const e of errors) log.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  const rec = appendRecord(dir, candidate);
  const tagStr = rec.tags.length ? ` [${rec.tags.join(", ")}]` : "";
  console.log(t("add.added", { id: rec.id, type: rec.type, title: rec.title, tags: tagStr }));

  if (oldId) {
    const old = updateRecord(dir, oldId, { invalid: true, superseded_by: rec.id });
    if (old) console.log(t("add.superseded", { old: old.id, new: rec.id }));
  }
}
