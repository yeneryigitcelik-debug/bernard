import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { log } from "../util/log.js";
import { getT } from "../i18n/index.js";

const FILE = "records.jsonl";

export function newId() {
  return "ber_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export function readRecords(dir) {
  const file = path.join(dir, FILE);
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out = [];
  const t = getT(dir);
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      // One bad line must never bring down the whole memory.
      log.warn(t("common.corruptLine", { line: trimmed.slice(0, 80) }));
    }
  }
  return out;
}

// Append a single record (as one JSONL line) with a stable, readable field order.
export function appendRecord(dir, record) {
  fs.mkdirSync(dir, { recursive: true });
  const rec = {
    id: record.id || newId(),
    type: record.type,
    title: record.title,
    content: record.content,
    tags: record.tags == null ? [] : record.tags,
    created: record.created == null ? new Date().toISOString() : record.created,
    invalid: record.invalid == null ? false : record.invalid,
    superseded_by: record.superseded_by == null ? null : record.superseded_by,
    source: record.source == null ? "manual" : record.source,
  };
  fs.appendFileSync(path.join(dir, FILE), JSON.stringify(rec) + "\n");
  return rec;
}

export function updateRecord(dir, id, patch) {
  const records = readRecords(dir);
  const rec = records.find((r) => r.id === id);
  if (!rec) return null;
  Object.assign(rec, patch);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, FILE),
    records.map((r) => JSON.stringify(r)).join("\n") + "\n"
  );
  return rec;
}
