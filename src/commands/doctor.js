import fs from "node:fs";
import { diagnose } from "../core/doctor.js";
import { findRepoRoot, bernardDir } from "../core/paths.js";
import { getT, resolveLocale, localeFromConfig } from "../i18n/index.js";

export async function doctor(parsed) {
  const root = findRepoRoot();
  const dir = bernardDir(root);
  const locale = resolveLocale({ config: localeFromConfig(dir) });
  const t = getT(dir);
  const version = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
  const report = diagnose(root, locale, version);
  if (parsed?.flags?.json) console.log(JSON.stringify(report, null, 2));
  else {
    for (const severity of ["error", "warning", "info"]) {
      for (const check of report.checks.filter((c) => c.severity === severity)) {
        console.log(`[${severity}] ${check.id}: ${check.message}`);
        if (check.id === "records.duplicate_id") console.log(`  ${t("doctor.reconcile", { lines: check.data.lineNos.join(", ") })}`);
      }
    }
    console.log(t("doctor.summary", report.summary));
  }
  process.exitCode = report.exitCode;
  return report;
}
