import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  acquireStoreLock,
  releaseStoreLock,
  lockPath,
  readRawRecords,
  readRecords,
  appendRecord,
  updateRecord,
} from '../src/core/store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const storeUrl = pathToFileURL(path.join(here, '..', 'src', 'core', 'store.js')).href;
const NL = String.fromCharCode(10);
const CRLF = String.fromCharCode(13, 10);
const CHILD_TIMEOUT_MS = 45000;

function mkRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bernard-store-test-'));
  const store = path.join(root, 'store');
  fs.mkdirSync(store, { recursive: true });
  return { root, store };
}

function rmRoot(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function base(id, extra = {}) {
  return {
    id,
    type: 'note',
    title: 't ' + id,
    content: 'c',
    tags: [],
    created: '2024-01-01T00:00:00.000Z',
    invalid: false,
    superseded_by: null,
    source: 'manual',
    ...extra,
  };
}

const line = (o) => JSON.stringify(o) + NL;

function recordsFile(store) {
  return path.join(store, 'records.jsonl');
}

function sameBytes(a, b, msg) {
  assert.ok(Buffer.isBuffer(a) && Buffer.isBuffer(b), 'buffers expected');
  assert.ok(a.equals(b), msg || 'bytes differ');
}

function listFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

function writeWorker(root) {
  const src = [
    'import { updateRecord, appendRecord, acquireStoreLock } from ' + JSON.stringify(storeUrl) + ';',
    'const [mode, dir, id, n] = process.argv.slice(2);',
    'function fail(e) { process.send({ type: "error", message: String((e && e.stack) || e) }, () => process.exit(1)); }',
    'try {',
    '  if (mode === "hold") {',
    '    acquireStoreLock(dir, { lockTimeoutMs: 10000 });',
    '    process.send({ type: "held" });',
    '    setInterval(() => {}, 1000);',
    '  } else {',
    '    process.on("message", (m) => {',
    '      if (!m || m.type !== "go") return;',
    '      try {',
    '        for (let i = 1; i <= 5; i++) {',
    '          updateRecord(dir, id, { content: "u" + i }, { lockTimeoutMs: 30000 });',
    '          appendRecord(dir, { type: "note", title: "n-" + n + "-" + i, content: "x" }, { lockTimeoutMs: 30000 });',
    '        }',
    '        process.send({ type: "done" }, () => process.exit(0));',
    '      } catch (e) { fail(e); }',
    '    });',
    '    process.send({ type: "ready" });',
    '  }',
    '} catch (e) { fail(e); }',
  ].join(NL);
  const p = path.join(root, 'worker.mjs');
  fs.writeFileSync(p, src);
  return p;
}

function spawnWorker(workerPath, args) {
  return fork(workerPath, args, { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
}

function waitFor(child, type, ms = CHILD_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('timeout waiting for ' + type));
    }, ms);
    const onMsg = (m) => {
      if (m && m.type === 'error') {
        cleanup();
        reject(new Error('child error: ' + m.message));
      } else if (m && m.type === type) {
        cleanup();
        resolve(m);
      }
    };
    const onExit = (code, sig) => {
      cleanup();
      reject(new Error('child exited (' + code + ', ' + sig + ') before ' + type));
    };
    function cleanup() {
      clearTimeout(timer);
      child.off('message', onMsg);
      child.off('exit', onExit);
    }
    child.on('message', onMsg);
    child.on('exit', onExit);
  });
}

function killAll(children) {
  for (const c of children) {
    if (c.exitCode === null && c.signalCode === null) {
      try {
        c.kill('SIGKILL');
      } catch {}
    }
  }
}

test('8 independent child processes: all base updates and 40 appends are retained', { timeout: 90000 }, async () => {
  const { root, store } = mkRoot();
  const children = [];
  try {
    const ids = Array.from({ length: 8 }, (_, i) => 'ber_base' + i);
    fs.writeFileSync(recordsFile(store), ids.map((id) => line(base(id))).join(''));
    const worker = writeWorker(root);
    const ready = [];
    for (let i = 0; i < 8; i++) {
      const c = spawnWorker(worker, ['work', store, ids[i], String(i)]);
      children.push(c);
      ready.push(waitFor(c, 'ready'));
    }
    await Promise.all(ready);
    const done = children.map((c) => waitFor(c, 'done'));
    for (const c of children) c.send({ type: 'go' });
    await Promise.all(done);

    const recs = readRecords(store);
    for (const id of ids) {
      const r = recs.filter((x) => x.id === id);
      assert.equal(r.length, 1, 'exactly one ' + id);
      assert.equal(r[0].content, 'u5');
      assert.equal(r[0].title, 't ' + id);
      assert.equal(r[0].created, '2024-01-01T00:00:00.000Z');
    }
    const notes = recs.filter((r) => r.title.startsWith('n-'));
    assert.equal(notes.length, 40);
    assert.equal(new Set(notes.map((n) => n.title)).size, 40);
    assert.equal(new Set(recs.map((r) => r.id)).size, 48);
    assert.equal(fs.existsSync(lockPath(store)), false);
  } finally {
    killAll(children);
    rmRoot(root);
  }
});

test('lock held by a SIGKILLed child is recovered by the next append', { timeout: 60000 }, async () => {
  const { root, store } = mkRoot();
  const children = [];
  try {
    fs.writeFileSync(recordsFile(store), line(base('ber_seed')));
    const worker = writeWorker(root);
    const c = spawnWorker(worker, ['hold', store]);
    children.push(c);
    await waitFor(c, 'held');
    assert.ok(fs.existsSync(lockPath(store)), 'child holds the lock');
    const exited = once(c, 'exit');
    c.kill('SIGKILL');
    await exited;

    const r = appendRecord(store, { type: 'note', title: 'after crash', content: '' }, { lockTimeoutMs: 5000 });
    const recs = readRecords(store);
    assert.ok(recs.some((x) => x.id === r.id));
    assert.ok(recs.some((x) => x.id === 'ber_seed'));
    assert.equal(fs.existsSync(lockPath(store)), false);
  } finally {
    killAll(children);
    rmRoot(root);
  }
});

test('live parent lock: append times out preserving owner token; stale handle cannot delete foreign lock', () => {
  const { root, store } = mkRoot();
  try {
    fs.writeFileSync(recordsFile(store), line(base('ber_seed')));
    const h = acquireStoreLock(store, { lockTimeoutMs: 1000 });
    try {
      const before = readRawRecords(store);
      assert.throws(
        () => appendRecord(store, { type: 'note', title: 'x', content: '' }, { lockTimeoutMs: 50 }),
        (e) => e && e.code === 'EBERNARD_LOCK_TIMEOUT'
      );
      sameBytes(readRawRecords(store), before);
      assert.equal(JSON.parse(fs.readFileSync(lockPath(store), 'utf8')).token, h.token);

      const foreign = JSON.stringify({
        token: 'f'.repeat(32),
        pid: process.pid,
        host: os.hostname(),
        created: new Date().toISOString(),
      });
      fs.writeFileSync(lockPath(store), foreign);
      assert.equal(releaseStoreLock(h), false);
      assert.equal(fs.readFileSync(lockPath(store), 'utf8'), foreign);
    } finally {
      fs.rmSync(lockPath(store), { force: true });
    }
  } finally {
    rmRoot(root);
  }
});

test('injected EIO on records rename leaves raw bytes untouched and cleans tmp/lock', (t) => {
  const { root, store } = mkRoot();
  try {
    fs.writeFileSync(recordsFile(store), line(base('ber_a')) + line(base('ber_b')));
    const before = readRawRecords(store);
    const target = path.resolve(recordsFile(store));
    const orig = fs.renameSync;
    t.mock.method(fs, 'renameSync', function (from, to) {
      if (path.resolve(String(to)) === target) {
        const e = new Error('injected EIO');
        e.code = 'EIO';
        throw e;
      }
      return orig.call(fs, from, to);
    });

    assert.throws(() => updateRecord(store, 'ber_a', { content: 'changed' }, { lockTimeoutMs: 2000 }));
    sameBytes(readRawRecords(store), before);
    assert.throws(() => appendRecord(store, { type: 'note', title: 'n', content: '' }, { lockTimeoutMs: 2000 }));
    sameBytes(readRawRecords(store), before);

    assert.equal(fs.existsSync(lockPath(store)), false, 'lock released');
    const leftovers = listFiles(store).filter((p) => p.endsWith('.tmp') || p.endsWith('.tomb'));
    assert.deepEqual(leftovers, []);
  } finally {
    rmRoot(root);
  }
});

test('malformed lines skipped; raw bytes, CRLF and unknown fields preserved on update and append', () => {
  const { root, store } = mkRoot();
  try {
    const target = base('ber_t', { extra: { nested: [1, 2] }, futureField: 'keep' });
    const head = Buffer.from(JSON.stringify(target) + CRLF);
    const rest = Buffer.concat([
      Buffer.from('{not json' + NL),
      Buffer.from('null' + NL),
      Buffer.from('[1,2]' + NL),
      Buffer.from(JSON.stringify(base('ber_tags', { tags: 'a,b' })) + NL),
      Buffer.concat([
        Buffer.from('{"id":"ber_utf","type":"note","title":"bad'),
        Buffer.from([0xff, 0xfe]),
        Buffer.from('","content":""}' + CRLF),
      ]),
      Buffer.from(JSON.stringify(base('ber_last'))),
    ]);
    fs.writeFileSync(recordsFile(store), Buffer.concat([head, rest]));

    assert.deepEqual(readRecords(store).map((r) => r.id).sort(), ['ber_last', 'ber_t']);

    const updated = updateRecord(store, 'ber_t', { content: 'new' }, { lockTimeoutMs: 2000 });
    assert.equal(updated.content, 'new');
    const raw = readRawRecords(store);
    sameBytes(raw.subarray(raw.length - rest.length), rest, 'unrelated bytes preserved');
    const first = raw.subarray(0, raw.length - rest.length).toString('utf8');
    assert.ok(first.endsWith(CRLF), 'CRLF kept');
    const parsed = JSON.parse(first);
    assert.equal(parsed.content, 'new');
    assert.equal(parsed.title, 't ber_t');
    assert.deepEqual(parsed.extra, { nested: [1, 2] });
    assert.equal(parsed.futureField, 'keep');

    const prev = readRawRecords(store);
    const added = appendRecord(store, { type: 'note', title: 'appended', content: '', custom: 7 }, { lockTimeoutMs: 2000 });
    const raw2 = readRawRecords(store);
    sameBytes(raw2.subarray(0, prev.length), prev, 'prefix preserved');
    assert.equal(raw2[prev.length], 0x0a, 'missing newline inserted');
    const tail = JSON.parse(raw2.subarray(prev.length + 1).toString('utf8'));
    assert.equal(tail.id, added.id);
    assert.equal(tail.custom, 7);
    assert.deepEqual(readRecords(store).map((r) => r.id).sort(), [added.id, 'ber_last', 'ber_t'].sort());
  } finally {
    rmRoot(root);
  }
});

test('invalid append/update/duplicate id leave bytes exact; valid update retains omitted fields; supersession rejects', () => {
  const { root, store } = mkRoot();
  try {
    fs.writeFileSync(recordsFile(store), line(base('ber_A', { tags: ['k'] })) + line(base('ber_B')));
    const before = readRawRecords(store);
    const isInvalid = (e) => e && e.code === 'EBERNARD_INVALID_RECORD';
    const o = { lockTimeoutMs: 2000 };

    assert.throws(() => appendRecord(store, { type: 'bogus', title: 'x', content: '' }, o), isInvalid);
    assert.throws(() => appendRecord(store, { type: 'note', title: 'x', content: '', tags: 'a,b' }, o), isInvalid);
    assert.throws(() => appendRecord(store, { type: 'note', title: '', content: '' }, o), isInvalid);
    assert.throws(() => appendRecord(store, base('ber_A'), o), (e) => e instanceof Error);
    sameBytes(readRawRecords(store), before);

    assert.throws(() => updateRecord(store, 'ber_A', { title: '' }, o), isInvalid);
    assert.throws(() => updateRecord(store, 'ber_A', { type: 'nope' }, o), isInvalid);
    assert.throws(() => updateRecord(store, 'ber_A', { tags: 'x' }, o), isInvalid);
    assert.throws(() => updateRecord(store, 'ber_A', { id: 'ber_other' }, o), isInvalid);
    sameBytes(readRawRecords(store), before);

    const sup = updateRecord(store, 'ber_A', { superseded_by: 'ber_B' }, o);
    assert.equal(sup.superseded_by, 'ber_B');
    const before2 = readRawRecords(store);
    assert.throws(() => updateRecord(store, 'ber_B', { superseded_by: 'ber_A' }, o), isInvalid);
    assert.throws(() => updateRecord(store, 'ber_B', { superseded_by: 'ber_B' }, o), isInvalid);
    assert.throws(() => updateRecord(store, 'ber_B', { superseded_by: 'ber_missing' }, o), isInvalid);
    sameBytes(readRawRecords(store), before2);

    const u = updateRecord(store, 'ber_A', { content: 'fresh' }, o);
    const onDisk = readRecords(store).find((r) => r.id === 'ber_A');
    for (const r of [u, onDisk]) {
      assert.equal(r.content, 'fresh');
      assert.equal(r.title, 't ber_A');
      assert.deepEqual(r.tags, ['k']);
      assert.equal(r.created, '2024-01-01T00:00:00.000Z');
      assert.equal(r.superseded_by, 'ber_B');
      assert.equal(r.source, 'manual');
    }
    assert.equal(fs.existsSync(lockPath(store)), false);
  } finally {
    rmRoot(root);
  }
});
