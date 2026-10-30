// distill command: render conflicts, supersession chains and suggestions.
// NO mutation by default. --apply only marks (invalidates), never deletes.

import readline from "node:readline";
import { findRepoRoot, bernardDir } from "../core/paths.js";
import { readRecords, updateRecord } from "../core/store.js";
import { distill } from "../core/distill.js";
import { getT } from "../i18n/index.js";
import { log } from "../util/log.js";

const EXPECTED_CODES = new Set(["EBERNARD_INVALID_RECORD", "EBERNARD_LOCK_TIMEOUT"]);

function ask(rl, q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

function isYes(answer) {
  const a = answer.trim().toLowerCase();
  return a === "y" || a === "yes" || a === "e" || a === "evet";
}

export async function distillCmd(parsed) {
  const dir = bernardDir(findRepoRoot());
  const t = getT(dir);
  const records = readRecords(dir);

  const { conflicts, chains } = distill(records);

  console.log(t("distill.reportHeader", { n: records.length }));
  console.log(t("distill.noDelete"));
  console.log("");

  // --- Possible conflicts ---
  console.log(t("distill.conflicts", { n: conflicts.length }));
  if (conflicts.length === 0) {
    console.log(`  ${t("distill.none")}`);
  } else {
    for (const c of conflicts) {
      const tags = c.tags.length ? c.tags.join(", ") : "—";
      console.log(`  [${c.type}] ${t("label.tags")}: ${tags}`);
      console.log(`    ${t("distill.records", { ids: c.ids.join(", ") })}`);
      if (c.keep) console.log(`    ${t("distill.keep", { id: c.keep })}`);
      if (c.toInvalidate.length) {
        console.log(`    ${t("distill.toInvalidate", { ids: c.toInvalidate.join(", ") })}`);
      }
    }
  }
  console.log("");

  // --- Supersession chains ---
  console.log(t("distill.chains", { n: chains.length }));
  if (chains.length === 0) {
    console.log(`  ${t("distill.none")}`);
  } else {
    for (const z of chains) {
      console.log(`  ${t("distill.chainLine", { id: z.id, by: z.superseded_by })}`);
    }
  }
  console.log("");

  // --- Suggestions (rendered prose) ---
  const suggestions = [];
  for (const c of conflicts) {
    const tagsInline = c.tags.length
      ? t("distill.tagsInline", { tags: c.tags.join(", ") })
      : "";
    suggestions.push(
      t("distill.suggestConflict", {
        count: c.ids.length,
        type: c.type,
        tags: tagsInline,
        ids: c.ids.join(", "),
        keep: c.keep,
      })
    );
    for (const old of c.toInvalidate) {
      suggestions.push(`bernard invalidate ${old} --by ${c.keep}`);
    }
  }
  for (const z of chains) {
    suggestions.push(t("distill.suggestChain", { id: z.id, by: z.superseded_by }));
  }
  if (conflicts.length === 0 && chains.length === 0) {
    suggestions.push(t("distill.suggestConsistent"));
  }

  console.log(t("distill.suggestions", { n: suggestions.length }));
  for (const s of suggestions) console.log(`  - ${s}`);

  // --- Apply (interactive invalidation) ---
  const applyRequested = parsed?.flags?.apply;
  const applicable = conflicts.filter((c) => c.keep && c.toInvalidate.length > 0);

  if (applyRequested && !process.stdin.isTTY) console.log(t("distill.ttyHint"));
  if (!applyRequested || !process.stdin.isTTY) {
    if (applicable.length) {
      console.log("");
      console.log(t("distill.readyHeader"));
      for (const c of applicable) {
        for (const old of c.toInvalidate) {
          console.log(`  bernard invalidate ${old} --by ${c.keep}`);
        }
      }
      if (!applyRequested) {
        console.log("");
        console.log(t("distill.applyHint"));
      }
    }
    return;
  }

  if (applicable.length === 0) {
    console.log("");
    console.log(t("distill.applyNoConflicts"));
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  let total = 0;
  try {
    for (const c of applicable) {
      const tags = c.tags.length ? c.tags.join(", ") : "—";
      console.log("");
      console.log(t("distill.conflictHeading", { type: c.type, tags }));
      console.log(`  ${t("distill.keep", { id: c.keep })}`);
      console.log(`  ${t("distill.toInvalidate", { ids: c.toInvalidate.join(", ") })}`);
      const answer = await ask(rl, t("distill.applyPrompt"));
      if (isYes(answer)) {
        for (const old of c.toInvalidate) {
          let u = null;
          try {
            u = updateRecord(dir, old, { invalid: true, superseded_by: c.keep });
          } catch (err) {
            if (!err || !EXPECTED_CODES.has(err.code)) throw err;
            log.error(String(err.message));
            process.exitCode = 1;
            continue;
          }
          if (u) {
            total++;
            console.log(`  ${t("distill.applied", { old, keep: c.keep })}`);
          }
        }
      } else {
        console.log(`  ${t("distill.skipped")}`);
      }
    }
  } finally {
    rl.close();
    console.log("");
    console.log(t("distill.completed", { n: total }));
  }
}
