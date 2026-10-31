import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readRecords, readSnapshot, updateRecord, appendRecord, fingerprintBuffer, acquireStoreLock, releaseStoreLock, writeFileAtomic } from '../src/core/store.js';

const DISTILL = new URL('../src/commands/distill.js', import.meta.url).href;
const rec = (id, created, tags = ['db']) => ({ id, type: 'decision', title: 'Atlas ' + id, content: 'Synthetic storage decision', tags, created, invalid: false, superseded_by: null, source: 'manual', future: { preserved: ['yes', 7] } });
const rows = () => [rec('ber_old', '2025-01-01T00:00:00Z'), rec('ber_keeper', '2026-01-01T00:00:00Z'), rec('ber_new', '2027-01-01T00:00:00Z', ['other'])];
function fixture(t, initial = rows(), locale = 'en') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bernard-stale-plan-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.git'));
  const dir = path.join(root, '.bernard'); fs.mkdirSync(dir);
  const file = path.join(dir, 'records.jsonl');
  fs.writeFileSync(file, initial.map(r => JSON.stringify(r)).join('\r\n') + '\r\n', { mode: 0o640 });
  const env = { PATH: process.env.PATH || '/usr/bin:/bin', HOME: root, USERPROFILE: root, TMPDIR: root, BERNARD_LOCALE: locale, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', NO_COLOR: '1', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  return { root, dir, file, env, locale };
}
const snapshotFile = f => ({ bytes: fs.readFileSync(f.file), stat: fs.statSync(f.file) });
function unchanged(f, before) {
  const after = snapshotFile(f);
  assert.ok(after.bytes.equals(before.bytes), 'refused step must preserve exact external bytes');
  assert.equal(after.stat.ino, before.stat.ino); assert.equal(after.stat.mtimeMs, before.stat.mtimeMs); assert.equal(after.stat.mode, before.stat.mode);
}
async function apply(t, f, onPrompt = () => {}) {
  const runner = path.join(f.root, 'apply.mjs');
  fs.writeFileSync(runner, `Object.defineProperty(process.stdin,'isTTY',{value:true,configurable:true});const {distillCmd}=await import(${JSON.stringify(DISTILL)});await distillCmd({flags:{apply:true}});`);
  const child = spawn(process.execPath, [runner], { cwd: f.root, env: f.env, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = '', prompts = 0, failure;
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => {
    err += d;
    const n = (err.match(f.locale === 'en' ? /\(y\/n\)/g : /\(e\/h\)/g) || []).length;
    while (prompts < n) {
      prompts++;
      try { onPrompt(prompts); child.stdin.write(f.locale === 'en' ? 'y\n' : 'e\n'); }
      catch (error) { failure = error; child.kill('SIGKILL'); break; }
    }
  });
  child.stdin.on('error', () => {});
  const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
  t.after(() => { clearTimeout(timer); if (child.exitCode === null) child.kill('SIGKILL'); });
  const [code, signal] = await once(child, 'exit'); clearTimeout(timer);
  if (failure) throw failure;
  assert.equal(signal, null, err); assert.ok(prompts > 0, 'exercise actual interactive confirmation');
  return { code, out, err, prompts };
}
function staleResult(result, locale, count = 0) {
  assert.equal(result.code, 1, result.err);
  assert.match(result.err, locale === 'en' ? /changed|plan/i : /değiş|plan/i);
  assert.match(result.err, /bernard distill/);
  assert.doesNotMatch(result.err, /\n\s+at /);
  assert.ok(result.out.includes(locale === 'en' ? `Done: ${count} record(s)` : `Tamamlandı: ${count} kayıt`), result.out);
}

for (const locale of ['en', 'tr']) {
  for (const subject of ['ber_old', 'ber_keeper']) {
    test(`interactive stale ${subject} replacement aborts without overwriting newer history (${locale})`, { timeout: 15000 }, async t => {
      const f = fixture(t, rows(), locale); let external;
      const result = await apply(t, f, () => { updateRecord(f.dir, subject, { invalid: true, superseded_by: 'ber_new' }); external = snapshotFile(f); });
      staleResult(result, locale); unchanged(f, external);
      assert.equal(readRecords(f.dir).find(r => r.id === subject).superseded_by, 'ber_new');
    });
  }
}
for (const [field, value] of [['content', 'Revised synthetic purpose'], ['tags', ['different-topic']], ['created', '2028-01-01T00:00:00Z']]) {
  test(`still-active ${field} edit invalidates displayed plan rather than trusting active flags`, { timeout: 15000 }, async t => {
    const f = fixture(t); let external;
    const result = await apply(t, f, () => { updateRecord(f.dir, 'ber_old', { [field]: value }); external = snapshotFile(f); });
    staleResult(result, 'en'); unchanged(f, external);
    const old = readRecords(f.dir).find(r => r.id === 'ber_old'); assert.equal(old.invalid, false); assert.deepEqual(old[field], value);
  });
}
test('unrelated append conservatively aborts; new records are never silently adopted', { timeout: 15000 }, async t => {
  const f = fixture(t); let external;
  const result = await apply(t, f, () => { appendRecord(f.dir, rec('ber_extra', '2029-01-01T00:00:00Z', ['elsewhere'])); external = snapshotFile(f); });
  staleResult(result, 'en'); unchanged(f, external); assert.equal(readRecords(f.dir).length, 4);
});
test('unchanged plan carries only its own committed fingerprints across multiple rows and prompts', { timeout: 15000 }, async t => {
  const initial = [...rows(), rec('ber_older', '2024-01-01T00:00:00Z'), rec('ber_api_old', '2024-01-01T00:00:00Z', ['api']), rec('ber_api_keep', '2026-01-01T00:00:00Z', ['api'])];
  const f = fixture(t, initial), before = snapshotFile(f), result = await apply(t, f);
  assert.equal(result.code, 0, result.err); assert.equal(result.prompts, 2); assert.match(result.out, /Done: 3 record\(s\)/);
  const after = readRecords(f.dir);
  for (const [id, keep] of [['ber_old', 'ber_keeper'], ['ber_older', 'ber_keeper'], ['ber_api_old', 'ber_api_keep']]) {
    const actual = after.find(r => r.id === id); assert.equal(actual.invalid, true); assert.equal(actual.superseded_by, keep); assert.deepEqual(actual.future, initial.find(r => r.id === id).future);
  }
  for (const id of ['ber_keeper', 'ber_new', 'ber_api_keep']) assert.deepEqual(after.find(r => r.id === id), initial.find(r => r.id === id));
  assert.equal(fs.statSync(f.file).mode, before.stat.mode); assert.equal(fs.readFileSync(f.file, 'utf8').split('\r\n').length, initial.length + 1);
});
test('mid-session external mutation keeps truthful prior count and aborts all remaining prompts', { timeout: 15000 }, async t => {
  const initial = [...rows(), rec('ber_api_old', '2024-01-01T00:00:00Z', ['api']), rec('ber_api_keep', '2026-01-01T00:00:00Z', ['api']), rec('ber_third_old', '2024-01-01T00:00:00Z', ['third']), rec('ber_third_keep', '2026-01-01T00:00:00Z', ['third'])];
  const f = fixture(t, initial); let external;
  const result = await apply(t, f, n => { if (n === 2) { updateRecord(f.dir, 'ber_api_keep', { content: 'Changed during second confirmation' }); external = snapshotFile(f); } });
  staleResult(result, 'en', 1); assert.equal(result.prompts, 2); unchanged(f, external);
  const after = readRecords(f.dir); assert.equal(after.find(r => r.id === 'ber_old').superseded_by, 'ber_keeper');
  assert.equal(after.find(r => r.id === 'ber_api_old').invalid, false); assert.equal(after.find(r => r.id === 'ber_third_old').invalid, false);
});
test('checked storage rejects stale fingerprint with no record rewrite, legacy update return stays unchanged', t => {
  const f = fixture(t), old = readSnapshot(f.dir).fingerprint;
  const legacy = updateRecord(f.dir, 'ber_old', { content: 'New synthetic content' }); assert.equal(legacy.id, 'ber_old'); assert.equal(Object.hasOwn(legacy, 'record'), false);
  const external = snapshotFile(f);
  assert.throws(() => updateRecord(f.dir, 'ber_old', { invalid: true, superseded_by: 'ber_keeper' }, { expectedFingerprint: old }), { code: 'EBERNARD_STALE_PLAN' });
  unchanged(f, external);
  // Explicit manual mutation still permits existing overwrite semantics, independently of a plan.
  const manual = updateRecord(f.dir, 'ber_old', { invalid: true, superseded_by: 'ber_new' }); assert.equal(manual.superseded_by, 'ber_new'); assert.equal(Object.hasOwn(manual, 'record'), false);
});
test('checked storage returns hash of exact committed bytes and preserves unrelated CRLF segments', t => {
  const f = fixture(t), before = snapshotFile(f), expected = readSnapshot(f.dir).fingerprint;
  const result = updateRecord(f.dir, 'ber_old', { invalid: true, superseded_by: 'ber_keeper' }, { expectedFingerprint: expected });
  assert.equal(result.record.id, 'ber_old'); assert.equal(result.fingerprint, fingerprintBuffer(fs.readFileSync(f.file))); assert.notEqual(result.fingerprint, expected);
  assert.deepEqual(result.record.future, rows()[0].future);
  assert.ok(fs.readFileSync(f.file).subarray(fs.readFileSync(f.file).indexOf('\r\n') + 2).equals(before.bytes.subarray(before.bytes.indexOf('\r\n') + 2)));
  assert.equal(fs.statSync(f.file).mode, before.stat.mode);
});
test('explicit malformed fingerprints fail closed before writes; ordinary absent option remains valid', t => {
  const f = fixture(t), before = snapshotFile(f);
  for (const bad of [undefined, null, '', 1, {}, 'sha256:nope:1', 'sha256:' + 'a'.repeat(64) + ':01', 'sha256:' + 'a'.repeat(64) + ':9007199254740992', readSnapshot(f.dir).fingerprint + '\n', readSnapshot(f.dir).fingerprint + '\r\n']) {
    assert.throws(() => updateRecord(f.dir, 'ber_old', { invalid: true }, { expectedFingerprint: bad }), { code: 'EBERNARD_INVALID_RECORD' }); unchanged(f, before);
  }
});
test('checked update preserves existing lock-timeout failure and leaves bytes unchanged', t => {
  const f = fixture(t), before = snapshotFile(f), fingerprint = readSnapshot(f.dir).fingerprint, held = acquireStoreLock(f.dir);
  try { assert.throws(() => updateRecord(f.dir, 'ber_old', { invalid: true }, { expectedFingerprint: fingerprint, lockTimeoutMs: 15 }), { code: 'EBERNARD_LOCK_TIMEOUT' }); }
  finally { releaseStoreLock(held); }
  unchanged(f, before);
});

test('fingerprint is checked after acquiring the same writer lock, not before waiting for it', { timeout: 15000 }, async t => {
  const f = fixture(t), expected = readSnapshot(f.dir).fingerprint, held = acquireStoreLock(f.dir);
  const module = new URL('../src/core/store.js', import.meta.url).href;
  const runner = path.join(f.root, 'locked-check.mjs');
  // Observe the real exclusive-link failure; do not replace locking behavior.
  fs.writeFileSync(runner, `import fs from 'node:fs';const store=await import(${JSON.stringify(module)});const link=fs.linkSync;let sent=false;fs.linkSync=function(a,b){try{return link.call(this,a,b)}catch(e){if(e.code==='EEXIST'&&b===${JSON.stringify(held.lockPath)}&&!sent){sent=true;console.log('LOCK_CONTENDED')}throw e}};try{store.updateRecord(${JSON.stringify(f.dir)},'ber_old',{invalid:true,superseded_by:'ber_keeper'},{expectedFingerprint:${JSON.stringify(expected)},lockTimeoutMs:5000});console.log('UNSAFE_WRITE');process.exitCode=1}catch(e){console.log(e.code);process.exitCode=e.code==='EBERNARD_STALE_PLAN'?0:1}`);
  const child = spawn(process.execPath, [runner], { cwd: f.root, env: f.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '', external, released = false;
  child.stdout.on('data', d => {
    out += d;
    if (!released && out.includes('LOCK_CONTENDED')) {
      const changed = rows(); changed[0].content = 'Committed by the writer that already owns the lock';
      writeFileAtomic(f.file, Buffer.from(changed.map(r => JSON.stringify(r)).join('\r\n') + '\r\n'));
      external = snapshotFile(f); releaseStoreLock(held); released = true;
    }
  });
  child.stderr.on('data', d => { err += d; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
  try {
    const [code, signal] = await once(child, 'exit');
    assert.equal(signal, null, err); assert.equal(code, 0, out + err); assert.equal(released, true);
    assert.ok(out.includes('EBERNARD_STALE_PLAN')); assert.ok(!out.includes('UNSAFE_WRITE')); unchanged(f, external);
  } finally { clearTimeout(timer); if (!released) releaseStoreLock(held); if (child.exitCode === null) child.kill('SIGKILL'); }
});
