import fs from "node:fs";
import path from "node:path";
import { buildIndex } from "./bm25.js";
import {
  readSnapshot,
  readRawRecords,
  fingerprintBuffer,
  writeFileAtomic,
  recordsPath,
} from "./store.js";
import { log } from "../util/log.js";
import { getT } from "../i18n/index.js";

export const INDEX_VERSION = 2;

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

function isObj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isPosInt(v) {
  return Number.isSafeInteger(v) && v > 0;
}

// Checks shape plus internal numeric consistency. Duplicate doc ids are allowed.
export function isValidIndex(idx) {
  if (!isObj(idx)) return false;
  const { N, avgdl, df, docs } = idx;
  if (!Number.isSafeInteger(N) || N < 0) return false;
  if (!Number.isFinite(avgdl) || avgdl < 0) return false;
  if (!isObj(df) || !Array.isArray(docs) || docs.length !== N) return false;
  const counts = new Map();
  let total = 0;
  for (const d of docs) {
    if (!isObj(d) || typeof d.id !== "string" || !Number.isSafeInteger(d.len) || d.len < 0 || !isObj(d.tf)) {
      return false;
    }
    let sum = 0;
    for (const k of Object.keys(d.tf)) {
      const v = d.tf[k];
      if (!isPosInt(v)) return false;
      sum += v;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    if (!Number.isSafeInteger(sum) || sum !== d.len) return false;
    total += d.len;
    if (!Number.isSafeInteger(total)) return false;
  }
  const dfKeys = Object.keys(df);
  if (dfKeys.length !== counts.size) return false;
  for (const k of dfKeys) {
    const v = df[k];
    if (!isPosInt(v) || v > N || counts.get(k) !== v) return false;
  }
  const expected = N === 0 ? 0 : total / N;
  if (Math.abs(avgdl - expected) > 1e-9 * Math.max(1, expected)) return false;
  return true;
}

// Returns the cached index only if it is well-formed, current-version, for the
// requested locale, and built from exactly the current records bytes.
function loadCached(dir, locale, fingerprint) {
  const idxP = indexPath(dir);
  let idx;
  try {
    idx = JSON.parse(fs.readFileSync(idxP, "utf8"));
  } catch {
    return null;
  }
  if (!isValidIndex(idx)) return null;
  if (idx.version !== INDEX_VERSION) return null;
  if (locale && idx.locale !== locale) return null;
  if (!isObj(idx.source) || idx.source.fingerprint !== fingerprint) return null;
  const idxM = mtimeMs(idxP);
  const recM = mtimeMs(recordsPath(dir));
  // Conservative extra check: index older than records -> rebuild.
  if (idxM === null || (recM !== null && idxM < recM)) return null;
  return idx;
}

export function isStale(dir, locale) {
  return loadCached(dir, locale, fingerprintBuffer(readRawRecords(dir))) === null;
}

function buildFromSnapshot(dir, snap, locale) {
  const index = buildIndex(snap.records, locale);
  index.version = INDEX_VERSION;
  // The fingerprint is of the very bytes that were indexed, so a concurrent
  // mutation can never be masked by this cache.
  index.source = { fingerprint: snap.fingerprint };
  try {
    writeFileAtomic(indexPath(dir), JSON.stringify(index), { tmpDir: cacheDir(dir) });
  } catch (e) {
    log.warn(getT(dir)("store.indexWriteFailed", { error: (e && e.message) || String(e) }));
  }
  return index;
}

export function buildAndWrite(dir, locale = "en") {
  return buildFromSnapshot(dir, readSnapshot(dir), locale);
}

export function ensureIndex(dir, locale = "en", snapshot = null) {
  const snap = snapshot || readSnapshot(dir);
  const cached = loadCached(dir, locale, snap.fingerprint);
  if (cached) return cached;
  return buildFromSnapshot(dir, snap, locale);
}
