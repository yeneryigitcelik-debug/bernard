import { readRecords, updateRecord } from "../core/store.js";
import { findRepoRoot, bernardDir } from "../core/paths.js";
import { log } from "../util/log.js";
import { getT } from "../i18n/index.js";

function asString(value) {
  if (value == null || value === true) return undefined;
  const s = String(value).trim();
  return s === "" ? undefined : s;
}

export async function invalidate(parsed) {
  const flags = parsed.flags || {};
  const dir = bernardDir(findRepoRoot());
  const t = getT(dir);
  const id = asString((parsed._ || [])[0]);

  if (!id) {
    log.error(t("invalidate.missingId"));
    log.error(t("invalidate.usage"));
    process.exitCode = 1;
    return;
  }

  const records = readRecords(dir);
  const target = records.find((r) => r.id === id);
  if (!target) {
    log.error(t("invalidate.notFound", { id }));
    process.exitCode = 1;
    return;
  }

  const by = asString(flags.by);
  if (by != null && !records.find((r) => r.id === by)) {
    log.error(t("invalidate.byNotFound", { id: by }));
    process.exitCode = 1;
    return;
  }

  updateRecord(dir, id, { invalid: true, superseded_by: by || null });

  if (by) {
    console.log(t("invalidate.doneBy", { id, title: target.title, by }));
  } else {
    console.log(t("invalidate.done", { id, title: target.title }));
  }
}
