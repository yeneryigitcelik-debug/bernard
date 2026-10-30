import fs from "node:fs";
import path from "node:path";
import { findRepoRoot, bernardDir } from "../core/paths.js";
import { readSnapshot } from "../core/store.js";
import { ensureIndex } from "../core/index-cache.js";
import { retrieve } from "../core/retrieve.js";
import { log } from "../util/log.js";
import { getT, resolveLocale, localeFromConfig } from "../i18n/index.js";

function readJsonSafe(file, fallback) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : fallback;
  } catch {
    return fallback;
  }
}

// ISO date -> short form (YYYY-MM-DD).
function shortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toISOString().slice(0, 10);
}

// Clip content to ~140 chars.
function shortContent(content, n = 140) {
  const s = String(content || "").replace(/\s+/g, " ").trim();
  return s.length <= n ? s : s.slice(0, n).trimEnd() + "…";
}

function valuelessFilter(flags) {
  return ["type", "tag", "tags"].find((k) => Object.hasOwn(flags, k) &&
    (flags[k] === true || (typeof flags[k] === "string" && flags[k].trim() === ""))) || null;
}

export async function search(parsed) {
  const { _ = [], flags = {} } = parsed || {};
  const root = findRepoRoot();
  const dir = bernardDir(root);
  const locale = resolveLocale({ flag: flags.locale, config: localeFromConfig(dir) });
  const t = getT(dir, flags.locale);

  const bad = valuelessFilter(flags);
  if (bad) {
    log.error(t("cli.flagNeedsValue", { flag: `--${bad}` }));
    process.exitCode = 1;
    return;
  }

  const query = _.join(" ").trim();
  if (!query) {
    console.log(t("search.empty"));
    return;
  }

  // Config + categories (synonyms and retrieval settings).
  const cfg = readJsonSafe(path.join(dir, "config.json"), {});
  const categories = readJsonSafe(path.join(dir, "categories.json"), {});
  const synonyms = categories.synonyms || {};
  const r = cfg.retrieval || {};
  const maxResults = r.max_results ?? 8;
  const recencyWeight = r.recency_weight ?? 0.3;
  const halfLifeDays = r.half_life_days ?? 30;
  const typeWeights = r.type_weights || {};

  const type = typeof flags.type === "string" ? flags.type : null;
  const tag =
    typeof flags.tag === "string"
      ? flags.tag
      : typeof flags.tags === "string"
      ? flags.tags
      : null;

  // Take one snapshot so record bodies and the index come from the same bytes;
  // the index is refreshed by fingerprint/locale and passed in.
  const snap = readSnapshot(dir);
  const records = snap.records;
  let idx = null;
  try {
    idx = ensureIndex(dir, locale, snap);
  } catch (e) {
    log.warn(t("search.indexFailed", { error: e.message }));
  }

  const res = retrieve(query, records, {
    index: idx,
    synonyms,
    type,
    tag,
    maxResults,
    recencyWeight,
    halfLifeDays,
    typeWeights,
    locale,
  });

  if (!res || res.length === 0) {
    console.log(t("search.noResults"));
    return;
  }

  console.log(t("search.header", { n: res.length, query }));
  console.log("");
  for (const { record, score } of res) {
    const tagStr = (record.tags || []).length ? record.tags.join(", ") : t("label.none");
    console.log(`[${Number(score).toFixed(2)}] (${record.type}) ${record.title}`);
    console.log(`  ${t("label.date")}: ${shortDate(record.created)}  ${t("label.tags")}: ${tagStr}`);
    console.log(`  ${shortContent(record.content)}`);
    console.log("");
  }
}
