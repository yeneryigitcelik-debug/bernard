import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { retrieve } from '../src/core/retrieve.js';
import { distill } from '../src/core/distill.js';
import { isActive } from '../src/core/inspect.js';
import { buildIndex } from '../src/core/bm25.js';
import { validateStoredRecord } from '../src/util/schema.js';

const BIN = fileURLToPath(new URL('../bin/bernard.js', import.meta.url));
const titles = { legacy: 'Atlas obsolete choice', current: 'Atlas current choice', other: 'Atlas older choice', invalid: 'Atlas invalid choice' };
function records() {
  const rec = (id, title, extra) => ({ id, type: 'decision', title, content: 'Atlas storage decision', tags: ['db'], created: '2026-01-01T00:00:00Z', invalid: false, superseded_by: null, source: 'manual', ...extra });
  const rows = [
    rec('ber_legacy', titles.legacy, { created: '2030-01-01T00:00:00Z', superseded_by: 'ber_current', future: { kept: ['synthetic', 7] } }),
    rec('ber_current', titles.current, {}),
    rec('ber_other', titles.other, { created: '2025-01-01T00:00:00Z' }),
    rec('ber_invalid', titles.invalid, { created: '2024-01-01T00:00:00Z', invalid: true, superseded_by: 'ber_current' }),
  ];
  for (const r of rows) assert.equal(validateStoredRecord(r).ok, true, 'fixture must be an accepted persisted record');
  return rows;
}
const ids = results => results.map(r => r.record.id);
const text = result => (result.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');

for (const locale of ['en', 'tr']) {
  test(`drop recall excludes a replacement-linked legacy row without changing scores/corpus (${locale})`, () => {
    const rows = records(), before = JSON.stringify(rows), index = buildIndex(rows, locale);
    const expected = ['ber_current', 'ber_other'];
    assert.deepEqual(rows.filter(isActive).map(r => r.id), expected, 'independent canonical-state control');
    for (const prebuilt of [null, index, JSON.parse(JSON.stringify(index))]) {
      const actual = retrieve('atlas', rows, { locale, index: prebuilt, maxResults: 20, recencyWeight: 0 });
      assert.deepEqual(ids(actual).sort(), expected);
      for (const r of actual) assert.equal(r.record, rows.find(x => x.id === r.record.id), 'return original object, no normalization or repair');
      const historical = retrieve('atlas', rows, { locale, index: prebuilt, maxResults: 20, recencyWeight: 0, invalidMode: 'mark' });
      for (const r of actual) assert.equal(r.score, historical.find(h => h.record.id === r.record.id).score, 'filtering must not alter BM25 corpus or ranking score');
    }
    assert.equal(JSON.stringify(rows), before);
  });

  test(`mark recall retains all history and original metadata, active before newer replaced row (${locale})`, () => {
    const rows = records(), before = JSON.stringify(rows);
    const res = retrieve('atlas', rows, { locale, maxResults: 20, recencyWeight: 0, invalidMode: 'mark' });
    assert.deepEqual(ids(res), ['ber_current', 'ber_other', 'ber_legacy', 'ber_invalid']);
    assert.deepEqual(res.find(r => r.record.id === 'ber_legacy').record, rows[0]);
    assert.equal(res.find(r => r.record.id === 'ber_legacy').record.invalid, false, 'historical read must not repair stored flags');
    assert.equal(res.find(r => r.record.id === 'ber_legacy').record.superseded_by, 'ber_current');
    assert.equal(JSON.stringify(rows), before);
  });
}

test('distill never chooses a newer replacement-linked row as the keeper or reverses an existing edge', () => {
  const rows = records(), before = JSON.stringify(rows), result = distill(rows);
  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(result.conflicts[0], { type: 'decision', tags: ['db'], ids: ['ber_current', 'ber_other'], keep: 'ber_current', toInvalidate: ['ber_other'] });
  assert.equal(JSON.stringify(rows), before);
});

test('distill retains both explicit and legacy replacement edges using the existing chain shape', () => {
  const rows = records(), result = distill(rows);
  assert.deepEqual(result.chains, [{ id: 'ber_legacy', superseded_by: 'ber_current' }, { id: 'ber_invalid', superseded_by: 'ber_current' }]);
  assert.ok(result.chains.every(c => Object.keys(c).sort().join(',') === 'id,superseded_by'));
});

test('dangling replacement is still historical; null/omitted replacement fields stay active', () => {
  const rows = records().slice(0, 3);
  rows[0].superseded_by = 'ber_missing';
  delete rows[2].superseded_by;
  assert.deepEqual(ids(retrieve('atlas', rows, { maxResults: 20, recencyWeight: 0 })), ['ber_current', 'ber_other']);
  assert.deepEqual(new Set(ids(retrieve('atlas', rows, { maxResults: 20, invalidMode: 'mark' }))), new Set(rows.map(r => r.id)));
});

test('control: ordinary active/invalid recall and scores retain their existing behavior', () => {
  const rows = records().slice(1), before = JSON.stringify(rows);
  assert.deepEqual(ids(retrieve('atlas', rows, { maxResults: 20, recencyWeight: 0 })), ['ber_current', 'ber_other']);
  assert.deepEqual(ids(retrieve('atlas', rows, { maxResults: 20, recencyWeight: 0, invalidMode: 'mark' })), ['ber_current', 'ber_other', 'ber_invalid']);
  assert.equal(JSON.stringify(rows), before);
});

test('control: distill keeps timestamp chronology plus bug/untagged exclusions and explicit history', () => {
  const rows = records().slice(1);
  rows[0].created = '2026-01-01T09:00:00+02:00';
  rows[1].created = '2026-01-01T07:30:00Z';
  rows.push({ ...rows[0], id: 'ber_bug', type: 'bug' }, { ...rows[0], id: 'ber_no_tags', tags: [] });
  const result = distill(rows);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].keep, 'ber_other');
  assert.deepEqual(result.conflicts[0].ids, ['ber_current', 'ber_other']);
  assert.deepEqual(result.chains, [{ id: 'ber_invalid', superseded_by: 'ber_current' }]);
});

function fixture(t, locale, rows = records()) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bernard-active-state-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.git'));
  const dir = path.join(root, '.bernard'); fs.mkdirSync(dir);
  const file = path.join(dir, 'records.jsonl');
  const bytes = Buffer.from(rows.map(r => JSON.stringify(r)).join('\r\n') + '\r\n');
  fs.writeFileSync(file, bytes, { mode: 0o444 });
  const before = fs.statSync(file), home = path.join(root, 'home'); fs.mkdirSync(home);
  const env = { PATH: process.env.PATH || '/usr/bin:/bin', HOME: home, USERPROFILE: home, TMPDIR: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', BERNARD_LOCALE: locale, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', NO_COLOR: '1' };
  const cli = (...args) => spawnSync(process.execPath, [BIN, ...args], { cwd: root, env, encoding: 'utf8', timeout: 10000 });
  const unchanged = () => { const after = fs.statSync(file); assert.ok(fs.readFileSync(file).equals(bytes)); assert.equal(after.ino, before.ino); assert.equal(after.mtimeMs, before.mtimeMs); assert.equal(after.mode, before.mode); };
  return { root, dir, file, rows, cli, env, unchanged };
}

for (const locale of ['en', 'tr']) {
  test(`legacy missing/self/cyclic edges stay historical, visible and diagnostic without repair (${locale})`, { timeout: 20000 }, async t => {
    const sample = records()[0];
    const rows = [records()[1],
      { ...sample, id: 'ber_missing_link', title: 'Atlas dangling history', superseded_by: 'ber_absent' },
      { ...sample, id: 'ber_cycle_a', title: 'Atlas cycle A', superseded_by: 'ber_cycle_b' },
      { ...sample, id: 'ber_cycle_b', title: 'Atlas cycle B', superseded_by: 'ber_cycle_a' },
      { ...sample, id: 'ber_self', title: 'Atlas self history', superseded_by: 'ber_self' },
    ];
    const f = fixture(t, locale, rows), before = JSON.stringify(rows);
    assert.deepEqual(ids(retrieve('atlas', rows, { locale, maxResults: 20 })), ['ber_current']);
    assert.deepEqual(new Set(ids(retrieve('atlas', rows, { locale, maxResults: 20, invalidMode: 'mark' }))), new Set(rows.map(r => r.id)));
    assert.deepEqual(distill(rows), { conflicts: [], chains: rows.slice(1).map(r => ({ id: r.id, superseded_by: r.superseded_by })) });
    const listed = f.cli('list', '--locale', locale); assert.equal(listed.status, 0, listed.stderr);
    for (const r of rows.slice(1)) {
      assert.ok(listed.stdout.includes(r.title) && listed.stdout.includes(r.superseded_by));
      const shown = f.cli('show', r.id, '--locale', locale); assert.equal(shown.status, 0, shown.stderr);
      assert.ok(shown.stdout.includes(locale === 'en' ? 'replacement linked' : 'yerine geçen kayıt bağlı'));
      assert.ok(shown.stdout.includes(r.superseded_by));
      const raw = f.cli('show', r.id, '--json'); assert.equal(raw.status, 0, raw.stderr); assert.deepEqual(JSON.parse(raw.stdout), r);
    }
    const check = f.cli('doctor', '--json'); assert.equal(check.status, 2, check.stderr);
    const graph = JSON.parse(check.stdout).checks.filter(c => c.id.startsWith('graph.'));
    for (const id of ['graph.superseded_by_missing', 'graph.superseded_by_self', 'graph.cycle']) assert.ok(graph.some(c => c.id === id), id);
    assert.equal(graph.filter(c => c.id === 'graph.valid_but_superseded').length, 4);
    const transport = new StdioClientTransport({ command: process.execPath, args: [BIN, 'mcp'], cwd: f.root, env: f.env, stderr: 'pipe' });
    transport.stderr?.on('data', () => {});
    const client = new Client({ name: 'synthetic-legacy-graph', version: '1' });
    try {
      await client.connect(transport);
      const call = (name, args) => client.callTool({ name, arguments: args });
      const found = text(await call('bernard_search', { query: 'atlas' }));
      assert.ok(found.includes(rows[0].title)); for (const r of rows.slice(1)) assert.ok(!found.includes(r.title));
      const history = text(await call('bernard_list', {}));
      for (const r of rows.slice(1)) {
        assert.ok(history.includes(r.title) && history.includes(r.superseded_by));
        assert.deepEqual(JSON.parse(text(await call('bernard_get', { id: r.id }))), r);
      }
      assert.ok(history.includes(locale === 'en' ? 'replacement linked' : 'yerine geçen kayıt bağlı'));
    } finally { await client.close().catch(() => {}); await transport.close().catch(() => {}); }
    assert.equal(JSON.stringify(rows), before); f.unchanged();
  });

  test(`canonical duplicate rules do not reactivate or rewrite legacy history (${locale})`, t => {
    const legacy = records()[0], activeCopy = { ...legacy, superseded_by: null };
    const f = fixture(t, locale, [legacy, activeCopy, records()[1]]);
    const found = f.cli('search', 'atlas'); assert.equal(found.status, 0, found.stderr);
    assert.ok(!found.stdout.includes(legacy.title)); assert.ok(found.stdout.includes(titles.current));
    const shown = f.cli('show', legacy.id, '--json'); assert.notEqual(shown.status, 0);
    assert.ok((shown.stdout + shown.stderr).includes('1') && (shown.stdout + shown.stderr).includes('2'));
    const listed = f.cli('list'); assert.equal(listed.status, 0, listed.stderr); assert.ok(!listed.stdout.includes(legacy.title));
    f.unchanged();
    const identical = fixture(t, locale, [legacy, legacy, records()[1]]);
    const exact = identical.cli('show', legacy.id, '--json'); assert.equal(exact.status, 0, exact.stderr); assert.deepEqual(JSON.parse(exact.stdout), legacy);
    const recalled = identical.cli('search', 'atlas'); assert.equal(recalled.status, 0, recalled.stderr); assert.ok(!recalled.stdout.includes(legacy.title));
    identical.unchanged();
  });
}

test('control: exact CLI historical inspection preserves the legacy flag, replacement and unknown fields', t => {
  const f = fixture(t, 'en'), got = f.cli('show', 'ber_legacy', '--json');
  assert.equal(got.status, 0, got.stderr);
  assert.deepEqual(JSON.parse(got.stdout), f.rows[0]);
  assert.equal(JSON.parse(got.stdout).invalid, false);
  assert.equal(JSON.parse(got.stdout).superseded_by, 'ber_current');
  f.unchanged();
});

for (const locale of ['en', 'tr']) {
  test(`real CLI search is active-only, history stays exact, distill proposes only active choices (${locale})`, t => {
    const f = fixture(t, locale);
    const found = f.cli('search', 'atlas', '--locale', locale);
    assert.equal(found.status, 0, found.stderr);
    assert.ok(!found.stdout.includes(titles.legacy) && !found.stdout.includes(titles.invalid));
    assert.ok(found.stdout.includes(titles.current) && found.stdout.includes(titles.other));
    const listed = f.cli('list', '--locale', locale); assert.equal(listed.status, 0, listed.stderr);
    for (const r of f.rows) assert.ok(listed.stdout.includes(r.title), 'default list must retain history');
    const got = f.cli('show', 'ber_legacy', '--json', '--locale', locale); assert.equal(got.status, 0, got.stderr); assert.deepEqual(JSON.parse(got.stdout), f.rows[0]);
    const distilled = f.cli('distill', '--locale', locale); assert.equal(distilled.status, 0, distilled.stderr);
    assert.ok(distilled.stdout.includes('bernard invalidate ber_other --by ber_current'));
    assert.ok(!distilled.stdout.includes('bernard invalidate ber_current --by ber_legacy'));
    assert.ok(!distilled.stdout.includes('bernard invalidate ber_other --by ber_legacy'));
    f.unchanged();
  });

  test(`real MCP search agrees with active list while get/default list preserve replacement history (${locale})`, { timeout: 15000 }, async t => {
    const f = fixture(t, locale);
    const transport = new StdioClientTransport({ command: process.execPath, args: [BIN, 'mcp'], cwd: f.root, env: f.env, stderr: 'pipe' });
    transport.stderr?.on('data', () => {});
    const client = new Client({ name: 'synthetic-active-state-fixture', version: '1' });
    try {
      await client.connect(transport);
      const call = (name, args) => client.callTool({ name, arguments: args });
      const found = await call('bernard_search', { query: 'atlas', type: 'decision', tag: 'db' });
      assert.notEqual(found.isError, true, text(found));
      const active = await call('bernard_list', { include_invalid: false });
      for (const r of f.rows) { const expected = ['ber_current', 'ber_other'].includes(r.id); assert.equal(text(found).includes(r.title), expected); assert.equal(text(active).includes(r.title), expected); }
      const historical = await call('bernard_get', { id: 'ber_legacy' }); assert.notEqual(historical.isError, true); assert.deepEqual(JSON.parse(text(historical)), f.rows[0]);
      const listed = await call('bernard_list', {}); for (const r of f.rows) assert.ok(text(listed).includes(r.title));
      assert.ok(text(listed).includes('ber_current'), 'replacement target must stay visible');
      f.unchanged();
    } finally { await client.close().catch(() => {}); await transport.close().catch(() => {}); }
  });
}
