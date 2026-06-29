// list command: filter by --type / --tag and list newest-first.
// Results go to stdout (console.log); diagnostics to stderr via log.*.

import { findRepoRoot, bernardDir } from "../core/paths.js";
import { readRecords } from "../core/store.js";
import { getT } from "../i18n/index.js";

function badge(type) {
  return `[${String(type || "?").toUpperCase()}]`;
}

function formatDate(iso) {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso || "?";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export async function list(parsed) {
  const flags = parsed.flags || {};
  const dir = bernardDir(findRepoRoot());
  const t = getT(dir);

  let records = readRecords(dir);

  const type = typeof flags.type === "string" ? flags.type : null;
  if (type) records = records.filter((r) => r.type === type);

  const tag =
    typeof flags.tag === "string"
      ? flags.tag
      : typeof flags.tags === "string"
      ? flags.tags
      : null;
  if (tag) records = records.filter((r) => Array.isArray(r.tags) && r.tags.includes(tag));

  // newest first (by created desc); tie-break by id asc
  records.sort((a, b) => {
    const ta = Date.parse(a.created) || 0;
    const tb = Date.parse(b.created) || 0;
    if (tb !== ta) return tb - ta;
    return String(a.id).localeCompare(String(b.id));
  });

  if (records.length === 0) {
    console.log(t("list.none"));
    return;
  }

  for (const r of records) {
    const tags =
      Array.isArray(r.tags) && r.tags.length ? `  #${r.tags.join(" #")}` : "";
    const invalidNote = r.invalid ? `  ${t("list.invalid")}` : "";
    console.log(`${badge(r.type)} ${r.title}${invalidNote}`);
    console.log(`  ${r.id}  ${formatDate(r.created)}${tags}`);
  }

  console.log("");
  console.log(t("list.total", { n: records.length }));
}
