import fs from "node:fs";
import path from "node:path";
import { buildIndex } from "./bm25.js";
import { readRecords } from "./store.js";

export function cacheDir(dir) {
  return path.join(dir, ".cache");
}

export function indexPath(dir) {
  return path.join(dir, ".cache", "index.json");
}

function mtimeMs(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return null;
  }
}

export function isStale(dir, locale) {
  const idxP = indexPath(dir);
  const recordsP = path.join(dir, "records.jsonl");
  const idxM = mtimeMs(idxP);
  const recM = mtimeMs(recordsP);

  // index missing -> stale
  if (idxM === null) return true;

  // locale changed since the index was built -> stale
  if (locale) {
    try {
      const cached = JSON.parse(fs.readFileSync(idxP, "utf8"));
      if (!cached || cached.locale !== locale) return true;
    } catch {
      return true;
    }
  }

  // records.jsonl missing -> not stale (index exists)
  if (recM === null) return false;
  // stale if index older than records
  return idxM < recM;
}

export function buildAndWrite(dir, locale = "en") {
  const records = readRecords(dir);
  const index = buildIndex(records, locale);
  fs.mkdirSync(cacheDir(dir), { recursive: true });
  fs.writeFileSync(indexPath(dir), JSON.stringify(index, null, 2));
  return index;
}

export function ensureIndex(dir, locale = "en") {
  if (isStale(dir, locale)) {
    return buildAndWrite(dir, locale);
  }
  return JSON.parse(fs.readFileSync(indexPath(dir), "utf8"));
}
