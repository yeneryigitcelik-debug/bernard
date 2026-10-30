import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { log } from "../util/log.js";
import { getT } from "../i18n/index.js";
import { validateStoredRecord, validateWriteCandidate } from "../util/schema.js";

const FILE = "records.jsonl";
const CACHE_DIR = ".cache";
const LOCK_NAME = "records.lock";
const BREAKER_SUFFIX = ".break";
const DEFAULT_LOCK_TIMEOUT_MS = 10000;
const LINK_FALLBACK_CODES = ["EPERM", "ENOTSUP", "EOPNOTSUPP", "ENOSYS", "EXDEV"];
const KNOWN_FIELDS = [
  "id",
  "type",
  "title",
  "content",
  "tags",
  "created",
  "invalid",
  "superseded_by",
  "source",
];
const SLEEP_CELL = new Int32Array(new SharedArrayBuffer(4));
const UTF8 = new TextDecoder("utf-8", { fatal: true });

function sleepSync(ms) {
  Atomics.wait(SLEEP_CELL, 0, 0, Math.max(1, Math.floor(ms)));
}

function randomToken(bytes = 8) {
  return crypto.randomBytes(bytes).toString("hex");
}

function defineField(obj, key, value) {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

export function recordsPath(dir) {
  return path.join(dir, FILE);
}

export function storeCacheDir(dir) {
  return path.join(dir, CACHE_DIR);
}

export function lockPath(dir) {
  return path.join(dir, CACHE_DIR, LOCK_NAME);
}

export function newId() {
  return "ber_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function invalidRecordError(t, errors) {
  const err = new Error(t("store.invalidRecord", { errors: errors.join("; ") }));
  err.code = "EBERNARD_INVALID_RECORD";
  err.errors = errors;
  return err;
}

// Raw bytes of records.jsonl. Missing file is empty; any other I/O error throws.
export function readRawRecords(dir) {
  try {
    return fs.readFileSync(recordsPath(dir));
  } catch (e) {
    if (e && e.code === "ENOENT") return Buffer.alloc(0);
    throw e;
  }
}

export function fingerprintBuffer(buf) {
  return "sha256:" + crypto.createHash("sha256").update(buf).digest("hex") + ":" + buf.length;
}

// Split into byte segments, each including its terminating LF (if any).
function splitSegments(buf) {
  const out = [];
  let start = 0;
  while (start < buf.length) {
    const nl = buf.indexOf(0x0a, start);
    const end = nl === -1 ? buf.length : nl + 1;
    out.push(buf.subarray(start, end));
    start = end;
  }
  return out;
}

function eolOf(seg) {
  if (seg.length && seg[seg.length - 1] === 0x0a) {
    return seg.length > 1 && seg[seg.length - 2] === 0x0d ? "\r\n" : "\n";
  }
  return "";
}

// Every segment keeps its original bytes in `seg`, whatever its validity.
function parseBuffer(buf, t, warn) {
  const lines = [];
  const records = [];
  for (const seg of splitSegments(buf)) {
    const entry = { seg, rec: null };
    lines.push(entry);
    let text;
    try {
      text = UTF8.decode(seg).trim();
    } catch {
      if (warn) log.warn(t("store.invalidUtf8", { bytes: seg.length }));
      continue;
    }
    if (!text) continue;
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      // One bad line must never bring down the whole memory.
      if (warn) log.warn(t("common.corruptLine", { line: text.slice(0, 80) }));
      continue;
    }
    const v = validateStoredRecord(value, t);
    if (!v.ok) {
      if (warn) {
        log.warn(t("store.invalidLine", { line: text.slice(0, 80), errors: v.errors.join("; ") }));
      }
      continue;
    }
    entry.rec = value;
    records.push(value);
  }
  return { lines, records };
}

export function readRecords(dir) {
  return parseBuffer(readRawRecords(dir), getT(dir), true).records;
}

// Records plus the fingerprint of the exact bytes they were parsed from.
export function readSnapshot(dir) {
  const buf = readRawRecords(dir);
  return {
    records: parseBuffer(buf, getT(dir), false).records,
    fingerprint: fingerprintBuffer(buf),
  };
}

// ---------------------------------------------------------------------------
// Cross-process lock
// ---------------------------------------------------------------------------

function resolveLockTimeout(opts) {
  const fromOpts = opts && opts.lockTimeoutMs;
  if (Number.isFinite(fromOpts) && fromOpts >= 0) return fromOpts;
  const rawEnv = process.env.BERNARD_LOCK_TIMEOUT_MS;
  const env = Number(rawEnv);
  if (rawEnv && Number.isFinite(env) && env >= 0) return env;
  return DEFAULT_LOCK_TIMEOUT_MS;
}

function writeAll(fd, data) {
  let off = 0;
  while (off < data.length) {
    const written = fs.writeSync(fd, data, off, data.length - off);
    if (written <= 0) {
      const err = new Error("File write made no progress");
      err.code = "EIO";
      throw err;
    }
    off += written;
  }
}

// Remove a file we created with O_EXCL only if it still holds a prefix of our bytes.
function unlinkIfOurs(p, data) {
  try {
    const got = fs.readFileSync(p);
    if (got.length <= data.length && data.subarray(0, got.length).equals(got)) fs.unlinkSync(p);
  } catch {}
}

// Atomically create `p` containing `content`. Returns false if it already exists.
function createExclusive(p, content, tmpDir) {
  const data = Buffer.from(content, "utf8");
  const tmp = path.join(tmpDir, `${path.basename(p)}.${randomToken()}.tmp`);
  try {
    fs.writeFileSync(tmp, data, { flag: "wx" });
    try {
      fs.linkSync(tmp, p);
      return true;
    } catch (e) {
      if (e.code === "EEXIST") return false;
      if (!LINK_FALLBACK_CODES.includes(e.code)) throw e;
    }
    // Fallback for filesystems without hard links.
    let fd;
    try {
      fd = fs.openSync(p, "wx");
    } catch (e) {
      if (e.code === "EEXIST") return false;
      throw e;
    }
    let ok = false;
    try {
      writeAll(fd, data);
      fs.fsyncSync(fd);
      ok = true;
    } finally {
      try {
        fs.closeSync(fd);
      } catch {}
      if (!ok) unlinkIfOurs(p, data);
    }
    return true;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {}
  }
}

function readOwner(p) {
  let raw;
  try {
    raw = fs.readFileSync(p, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return { state: "missing" };
    throw e;
  }
  try {
    const o = JSON.parse(raw);
    if (
      o &&
      typeof o.token === "string" &&
      Number.isInteger(o.pid) &&
      o.pid > 0 &&
      typeof o.host === "string"
    ) {
      return { state: "ok", owner: o };
    }
  } catch {}
  return { state: "garbled", raw };
}

function isOwnerDead(owner) {
  // We cannot probe processes on other hosts: never steal those.
  if (owner.host !== os.hostname()) return false;
  if (owner.pid === process.pid) return false;
  try {
    process.kill(owner.pid, 0);
    return false;
  } catch (e) {
    return e.code === "ESRCH";
  }
}

// Only an identifiable, provably dead owner is stale. Unknown owners never are.
function isStaleState(state) {
  return state.state === "ok" && isOwnerDead(state.owner);
}

function describeOwner(state, t) {
  return state && state.state === "ok"
    ? `pid ${state.owner.pid} @ ${state.owner.host}`
    : t("store.lockOwnerUnknown");
}

// Break a stale lock while holding an exclusive breaker lock. The breaker is
// never reclaimed automatically: if it exists we just wait (bounded).
function tryBreakStale(lock, tmpDir, observed, content, token) {
  const breaker = lock + BREAKER_SUFFIX;
  if (!createExclusive(breaker, content, tmpDir)) return false;
  try {
    const cur = readOwner(lock);
    if (cur.state === "missing") return true;
    if (cur.state === "ok" && cur.owner.token === observed.owner.token && isOwnerDead(cur.owner)) {
      try {
        fs.unlinkSync(lock);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      return true;
    }
    return false;
  } finally {
    const b = readOwner(breaker);
    if (b.state === "ok" && b.owner.token === token) {
      try {
        fs.unlinkSync(breaker);
      } catch {}
    }
  }
}

export function acquireStoreLock(dir, opts = {}) {
  const t = getT(dir);
  const cache = storeCacheDir(dir);
  const lock = lockPath(dir);
  fs.mkdirSync(cache, { recursive: true });
  const token = randomToken(16);
  const content = JSON.stringify({
    token,
    pid: process.pid,
    host: os.hostname(),
    created: new Date().toISOString(),
  });
  const timeoutMs = resolveLockTimeout(opts);
  const deadline = Date.now() + timeoutMs;
  let delay = 5;
  let last = null;
  for (;;) {
    if (createExclusive(lock, content, cache)) return { dir, lockPath: lock, token };
    const state = readOwner(lock);
    let retryNow = state.state === "missing";
    if (state.state !== "missing") {
      last = state;
      if (isStaleState(state) && tryBreakStale(lock, cache, state, content, token)) retryNow = true;
    }
    if (Date.now() >= deadline) {
      const breaker = lock + BREAKER_SUFFIX;
      const b = readOwner(breaker);
      let msg;
      if (b.state !== "missing") {
        msg = t("store.lockBreakerStuck", { ms: timeoutMs, path: breaker, lock, owner: describeOwner(b, t) });
      } else if (last && last.state === "garbled") {
        msg = t("store.lockGarbled", { ms: timeoutMs, path: lock });
      } else {
        msg = t("store.lockTimeout", { ms: timeoutMs, path: lock, owner: describeOwner(last, t) });
      }
      const err = new Error(msg);
      err.code = "EBERNARD_LOCK_TIMEOUT";
      throw err;
    }
    if (retryNow) continue;
    sleepSync(Math.min(delay + Math.random() * delay, Math.max(1, deadline - Date.now())));
    delay = Math.min(delay * 2, 100);
  }
}

// Release only if the lock still carries our token.
export function releaseStoreLock(handle) {
  if (!handle) return false;
  const state = readOwner(handle.lockPath);
  if (state.state === "ok" && state.owner.token === handle.token) {
    try {
      fs.unlinkSync(handle.lockPath);
      return true;
    } catch (e) {
      if (e.code === "ENOENT") return false;
      throw e;
    }
  }
  log.warn(getT(handle.dir)("store.lockLost", { path: handle.lockPath }));
  return false;
}

export function withStoreLock(dir, fn, opts = {}) {
  const handle = acquireStoreLock(dir, opts);
  try {
    return fn();
  } finally {
    try {
      releaseStoreLock(handle);
    } catch (e) {
      log.warn(String((e && e.message) || e));
    }
  }
}

// ---------------------------------------------------------------------------
// Atomic replace
// ---------------------------------------------------------------------------

function renameWithRetry(from, to) {
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (e) {
      if (i < 10 && ["EPERM", "EACCES", "EBUSY"].includes(e.code)) {
        sleepSync(10 * (i + 1));
        continue;
      }
      throw e;
    }
  }
}

function fsyncDir(dir) {
  let fd = null;
  try {
    fd = fs.openSync(dir, "r");
    fs.fsyncSync(fd);
  } catch {
    // Not supported everywhere (e.g. Windows); best effort.
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
  }
}

// Write temp (same filesystem) + fsync + rename. Preserves the existing mode.
export function writeFileAtomic(target, data, opts = {}) {
  const targetDir = path.dirname(target);
  const tmpDir = opts.tmpDir || targetDir;
  fs.mkdirSync(tmpDir, { recursive: true });
  let mode = null;
  try {
    mode = fs.statSync(target).mode & 0o7777;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const tmp = path.join(tmpDir, `.${path.basename(target)}.${randomToken()}.tmp`);
  let fd = null;
  let renamed = false;
  try {
    fd = fs.openSync(tmp, "wx", mode == null ? 0o666 : mode);
    writeAll(fd, Buffer.isBuffer(data) ? data : Buffer.from(data));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    if (mode != null) {
      try {
        fs.chmodSync(tmp, mode);
      } catch {}
    }
    renameWithRetry(tmp, target);
    renamed = true;
    fsyncDir(targetDir);
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
    if (!renamed) {
      try {
        fs.unlinkSync(tmp);
      } catch {}
    }
  }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function supersessionErrors(records, id, by, t) {
  if (by === id) return [t("store.supersedeSelf", { id })];
  const byId = new Map();
  for (const r of records) if (!byId.has(r.id)) byId.set(r.id, r);
  if (!byId.has(by)) return [t("store.supersedeMissing", { id: by })];
  const seen = new Set();
  let cur = by;
  while (cur != null && !seen.has(cur)) {
    if (cur === id) return [t("store.supersedeCycle", { id, by })];
    seen.add(cur);
    const r = byId.get(cur);
    cur = r ? r.superseded_by : null;
  }
  return [];
}

// Append a single record (as one JSONL line) with a stable, readable field order.
// Validates first; the whole file is atomically replaced under the lock, so
// readers never observe a partial append. On failure the file is untouched.
export function appendRecord(dir, record, opts = {}) {
  const t = getT(dir);
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    throw invalidRecordError(t, [t("schema.notObject")]);
  }
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
  for (const k of Object.keys(record)) {
    if (!KNOWN_FIELDS.includes(k) && record[k] !== undefined) defineField(rec, k, record[k]);
  }
  const v = validateWriteCandidate(rec, t);
  if (!v.ok) throw invalidRecordError(t, v.errors);
  const line = JSON.stringify(rec) + "\n";

  withStoreLock(
    dir,
    () => {
      const buf = readRawRecords(dir);
      const { records } = parseBuffer(buf, t, false);
      const errors = [];
      if (records.some((r) => r.id === rec.id)) errors.push(t("store.duplicateId", { id: rec.id }));
      if (typeof rec.superseded_by === "string") {
        errors.push(...supersessionErrors(records, rec.id, rec.superseded_by, t));
      }
      if (errors.length) throw invalidRecordError(t, errors);
      // Never glue a new object onto an unterminated last line.
      const prefix = buf.length && buf[buf.length - 1] !== 0x0a ? "\n" : "";
      writeFileAtomic(recordsPath(dir), Buffer.concat([buf, Buffer.from(prefix + line, "utf8")]), {
        tmpDir: storeCacheDir(dir),
      });
    },
    opts
  );
  return rec;
}

// Update a record in place. Unrelated lines (including malformed ones) keep
// their exact original bytes. Validates the full candidate under the lock.
export function updateRecord(dir, id, patch, opts = {}) {
  const t = getT(dir);
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
    throw invalidRecordError(t, [t("store.patchNotObject")]);
  }
  const clean = {};
  for (const k of Object.keys(patch)) {
    if (patch[k] !== undefined) defineField(clean, k, patch[k]);
  }
  if (Object.hasOwn(clean, "id") && clean.id !== id) {
    throw invalidRecordError(t, [t("store.idImmutable")]);
  }
  if (typeof id !== "string" || !id) return null;

  return withStoreLock(
    dir,
    () => {
      const file = recordsPath(dir);
      const buf = readRawRecords(dir);
      const { lines, records } = parseBuffer(buf, t, false);
      const idx = lines.findIndex((l) => l.rec && l.rec.id === id);
      if (idx === -1) return null;
      const current = lines[idx].rec;
      const candidate = { ...current };
      for (const k of Object.keys(clean)) defineField(candidate, k, clean[k]);

      const v = validateWriteCandidate(candidate, t, {
        allowUnknownSource: !Object.hasOwn(clean, "source"),
      });
      const errors = [...v.errors];
      if (
        Object.hasOwn(clean, "superseded_by") &&
        typeof clean.superseded_by === "string" &&
        clean.superseded_by !== current.superseded_by
      ) {
        errors.push(...supersessionErrors(records, id, clean.superseded_by, t));
      }
      if (errors.length) throw invalidRecordError(t, errors);

      const eol = eolOf(lines[idx].seg);
      const parts = lines.map((l, i) =>
        i === idx ? Buffer.from(JSON.stringify(candidate) + eol, "utf8") : l.seg
      );
      writeFileAtomic(file, Buffer.concat(parts), { tmpDir: storeCacheDir(dir) });
      return candidate;
    },
    opts
  );
}
