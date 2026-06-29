// stats command: print a summary dashboard for the memory.

import { findRepoRoot, bernardDir } from "../core/paths.js";
import { readRecords } from "../core/store.js";
import { TYPES } from "../util/schema.js";
import { getT } from "../i18n/index.js";

function formatDate(iso) {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso || "?";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export async function stats(parsed) {
  const dir = bernardDir(findRepoRoot());
  const t = getT(dir);
  const records = readRecords(dir);

  console.log(t("stats.title"));
  console.log("");

  if (records.length === 0) {
    console.log(t("stats.total", { n: 0 }));
    console.log(t("stats.empty"));
    return;
  }

  console.log(t("stats.total", { n: records.length }));
  console.log("");

  // --- By type ---
  console.log(t("stats.byType"));
  const typeCount = new Map();
  for (const r of records) {
    const k = r && typeof r.type === "string" ? r.type : "?";
    typeCount.set(k, (typeCount.get(k) || 0) + 1);
  }
  for (const type of TYPES) console.log(`  ${type}: ${typeCount.get(type) || 0}`);
  for (const [type, n] of typeCount) {
    if (!TYPES.includes(type)) console.log(`  ${type}: ${n}`);
  }
  console.log("");

  // --- Top 5 tags ---
  const tagCount = new Map();
  for (const r of records) {
    if (Array.isArray(r.tags)) {
      for (const e of r.tags) {
        if (typeof e === "string" && e.trim()) {
          const k = e.trim();
          tagCount.set(k, (tagCount.get(k) || 0) + 1);
        }
      }
    }
  }
  const top = [...tagCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5);
  console.log(t("stats.topTags"));
  if (top.length === 0) {
    console.log(`  ${t("stats.noTags")}`);
  } else {
    for (const [tag, n] of top) console.log(`  ${tag}: ${n}`);
  }
  console.log("");

  // --- Invalid count ---
  const invalidCount = records.filter((r) => r && r.invalid === true).length;
  console.log(t("stats.invalidCount", { n: invalidCount }));
  console.log("");

  // --- Oldest / newest ---
  const times = records
    .map((r) => ({ rec: r, ts: Date.parse(r && r.created) }))
    .filter((x) => !Number.isNaN(x.ts));
  if (times.length === 0) {
    console.log(t("stats.noDates"));
  } else {
    let oldest = times[0];
    let newest = times[0];
    for (const x of times) {
      if (x.ts < oldest.ts) oldest = x;
      if (x.ts > newest.ts) newest = x;
    }
    console.log(t("stats.oldest", { date: formatDate(oldest.rec.created) }));
    console.log(t("stats.newest", { date: formatDate(newest.rec.created) }));
  }
  console.log("");

  // --- By source ---
  console.log(t("stats.bySource"));
  const sourceCount = new Map();
  for (const r of records) {
    const k = r && typeof r.source === "string" ? r.source : "?";
    sourceCount.set(k, (sourceCount.get(k) || 0) + 1);
  }
  for (const s of ["manual", "agent"]) console.log(`  ${s}: ${sourceCount.get(s) || 0}`);
  for (const [s, n] of sourceCount) {
    if (s !== "manual" && s !== "agent") console.log(`  ${s}: ${n}`);
  }
}
