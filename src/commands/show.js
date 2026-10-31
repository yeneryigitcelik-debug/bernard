// show command: exact-ID read-only inspection. Never writes or builds the index.
import fs from "node:fs";
import path from "node:path";
import { findRepoRoot, bernardDir } from "../core/paths.js";
import { readSnapshot } from "../core/store.js";
import { resolveRecord, stateLine } from "../core/inspect.js";
import { getT } from "../i18n/index.js";
import { log } from "../util/log.js";

function fail(msg) {
  log.error(msg);
  process.exitCode = 1;
}

export async function show(parsed) {
  const { _ = [], flags = {} } = parsed || {};
  const dir = bernardDir(findRepoRoot());
  const t = getT(dir);

  if (Object.hasOwn(flags, "json") && flags.json !== true) {
    return fail(t("inspect.jsonNoValue"));
  }
  const asJson = flags.json === true;

  if (_.length !== 1 || typeof _[0] !== "string" || _[0].trim() === "") {
    return fail(t("inspect.usage"));
  }
  const id = _[0];

  if (!fs.existsSync(path.join(dir, "records.jsonl"))) {
    return fail(t("inspect.notInitialized", { dir }));
  }

  const snap = readSnapshot(dir);
  const res = resolveRecord(snap, id);
  if (res.problem === "ambiguous") {
    return fail(t("inspect.ambiguous", { id, lines: res.lineNos.join(", ") }));
  }
  if (res.problem) return fail(t("inspect.notFound", { id }));

  const rec = res.record;
  if (asJson) {
    console.log(JSON.stringify(rec, null, 2));
    return;
  }

  const tags = Array.isArray(rec.tags) && rec.tags.length ? rec.tags.join(", ") : t("label.none");
  const source = rec.source !== undefined && rec.source !== null && rec.source !== "" ? String(rec.source) : t("label.none");
  console.log(`[${String(rec.type || "?").toUpperCase()}] ${rec.title}`);
  console.log(`  ${t("label.id")}: ${rec.id}`);
  console.log(`  ${t("label.date")}: ${rec.created || t("label.none")}`);
  console.log(`  ${t("label.tags")}: ${tags}`);
  console.log(`  ${t("inspect.source", { source })}`);
  console.log(`  ${stateLine(rec, t)}`);
  console.log("");
  console.log(String(rec.content ?? ""));
}
