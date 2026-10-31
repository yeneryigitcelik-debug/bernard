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

// Every segment keeps its original bytes. Canonical reads never resurrect an
// invalidated ID. Conflicting active copies are quarantined, not guessed at.
export function parseLines(buf, t = getT(null), warn = false) {
  const lines = [];
  const groups = new Map();
  for (const seg of splitSegments(buf)) {
    const entry = { lineNo: lines.length + 1, seg, rec: null, error: null };
    lines.push(entry);
    let text;
    try {
      text = UTF8.decode(seg).trim();
    } catch {
      entry.error = { id: "records.invalid_utf8", errors: [] };
      if (warn) log.warn(t("store.invalidUtf8", { bytes: seg.length }));
      continue;
    }
    if (!text) continue;
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      entry.error = { id: "records.corrupt_json", errors: [] };
      if (warn) log.warn(t("common.corruptLine", { line: text.slice(0, 80) }));
      continue;
    }
    const v = validateStoredRecord(value, t);
    if (!v.ok) {
      entry.error = { id: "records.schema_invalid", errors: v.errors };
      if (warn) log.warn(t("store.invalidLine", { line: text.slice(0, 80), errors: v.errors.join("; ") }));
      continue;
    }
    entry.rec = value;
    if (!groups.has(value.id)) groups.set(value.id, []);
    groups.get(value.id).push(entry);
  }
  const records = [];
  const duplicates = [];
  for (const [id, entries] of groups) {
    // Compare parsed values, independent of JSON whitespace and key order.
    const same = entries.every((e) => equivalent(e.rec, entries[0].rec));
    const invalid = entries.filter((e) => e.rec.invalid);
    const quarantined = entries.length > 1 && !same && invalid.length === 0;
    if (entries.length > 1) {
      const duplicate = { id, lineNos: entries.map((e) => e.lineNo), identical: same, quarantined };
      duplicates.push(duplicate);
      if (warn) log.warn(t("store.duplicateLines", { id, lines: duplicate.lineNos.join(", ") }));
    }
    if (quarantined) continue;
    // Prefer explicit invalidation provenance; doctor still reports every copy.
    const linked = invalid.filter((e) => typeof e.rec.superseded_by === "string");
    const candidates = linked.length ? linked : invalid.length ? invalid : entries;
    records.push(candidates[candidates.length - 1].rec);
  }
  return { lines, records, duplicates };
}

function equivalent(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && equivalent(a[key], b[key]));
}

export function readRecords(dir) {
  return parseLines(readRawRecords(dir), getT(dir), true).records;
}

// Records and diagnostics from exactly the fingerprinted bytes.
export function readSnapshot(dir) {
  const buf = readRawRecords(dir);
  const parsed = parseLines(buf, getT(dir), true);
  return { ...parsed, fingerprint: fingerprintBuffer(buf) };
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

export function readOwner(p) {
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

export function isOwnerDead(owner) {
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
  for (const r of records) {
    if (!byId.has(r.id)) byId.set(r.id, []);
    byId.get(r.id).push(r);
  }
  if (!byId.has(by)) return [t("store.supersedeMissing", { id: by })];
  // Inspect all physical copies' edges, not only the canonical read view.
  const seen = new Set();
  const pending = [by];
  while (pending.length) {
    const cur = pending.pop();
    if (cur === id) return [t("store.supersedeCycle", { id, by })];
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const r of byId.get(cur) || []) if (r.superseded_by != null) pending.push(r.superseded_by);
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
      const { lines, records, duplicates } = parseLines(buf, t, false);
      const errors = [];
      if (lines.some((l) => l.rec && l.rec.id === rec.id)) errors.push(t("store.duplicateId", { id: rec.id }));
      if (typeof rec.superseded_by === "string") {
        if (duplicates.some((d) => d.id === rec.superseded_by && !d.identical)) errors.push(t("store.ambiguousUpdate", { id: rec.superseded_by }));
        errors.push(...supersessionErrors(lines.filter((l) => l.rec).map((l) => l.rec), rec.id, rec.superseded_by, t));
      }
      let content = buf;
      if (opts.supersedes !== undefined) {
        const oldId = opts.supersedes;
        const old = records.find((r) => r.id === oldId);
        if (!old) errors.push(t("store.supersedeMissing", { id: oldId }));
        if (duplicates.some((d) => d.id === oldId && !d.identical)) errors.push(t("store.ambiguousUpdate", { id: oldId }));
        errors.push(...supersessionErrors([...lines.filter((l) => l.rec).map((l) => l.rec), rec], oldId, rec.id, t));
        if (old && !errors.length) {
          const updated = { ...old, invalid: true, superseded_by: rec.id };
          content = Buffer.concat(lines.map((l) => l.rec && l.rec.id === oldId
            ? Buffer.from(JSON.stringify(updated) + eolOf(l.seg), "utf8") : l.seg));
        }
      }
      if (errors.length) throw invalidRecordError(t, errors);
      // Append and optional supersession are one atomic transaction.
      const prefix = content.length && content[content.length - 1] !== 0x0a ? "\n" : "";
      writeFileAtomic(recordsPath(dir), Buffer.concat([content, Buffer.from(prefix + line, "utf8")]), {
        tmpDir: storeCacheDir(dir),
      });
    },
    opts
  );
  return rec;
}

export function appendSuperseding(dir, record, oldId, opts = {}) {
  if (typeof oldId !== "string" || !oldId.trim()) {
    throw invalidRecordError(getT(dir), [getT(dir)("store.supersedeMissing", { id: oldId })]);
  }
  return appendRecord(dir, record, { ...opts, supersedes: oldId });
}

// Update a record in place. Unrelated lines (including malformed ones) keep
// their exact original bytes. Validates the full candidate under the lock.
// Checked callers receive the committed record and exact byte fingerprint.
// The precondition shares the cooperating writer lock; it is not filesystem CAS
// against programs that ignore that lock. Legacy callers still get the record.
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
  const checked = opts != null && Object.hasOwn(opts, "expectedFingerprint");
  const expected = checked ? opts.expectedFingerprint : undefined;
  if (checked) {
    const m = typeof expected === "string" ? /^sha256:[a-f0-9]{64}:(0|[1-9][0-9]*)$/.exec(expected) : null;
    if (!m || !Number.isSafeInteger(Number(m[1]))) throw invalidRecordError(t, [t("store.invalidFingerprint")]);
  }
  if (typeof id !== "string" || !id) return null;

  return withStoreLock(
    dir,
    () => {
      const file = recordsPath(dir);
      const buf = readRawRecords(dir);
      if (checked && fingerprintBuffer(buf) !== expected) {
        const err = new Error(t("store.stalePlan"));
        err.code = "EBERNARD_STALE_PLAN";
        throw err;
      }
      const { lines, records, duplicates } = parseLines(buf, t, false);
      if (duplicates.some((d) => d.id === id && !d.identical)) {
        throw invalidRecordError(t, [t("store.ambiguousUpdate", { id })]);
      }
      const current = records.find((r) => r.id === id);
      if (!current) return null;
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
        if (duplicates.some((d) => d.id === clean.superseded_by && !d.identical)) errors.push(t("store.ambiguousUpdate", { id: clean.superseded_by }));
        errors.push(...supersessionErrors(lines.filter((l) => l.rec).map((l) => l.rec), id, clean.superseded_by, t));
      }
      if (errors.length) throw invalidRecordError(t, errors);

      const parts = lines.map((l) =>
        l.rec && l.rec.id === id ? Buffer.from(JSON.stringify(candidate) + eolOf(l.seg), "utf8") : l.seg
      );
      const nextBuf = Buffer.concat(parts);
      writeFileAtomic(file, nextBuf, { tmpDir: storeCacheDir(dir) });
      return checked ? { record: candidate, fingerprint: fingerprintBuffer(nextBuf) } : candidate;
    },
    opts
  );
}
